
-- DRx Phase 11BX: clinical batch packet v3 with source-scoped safety rows.
-- Read-only; supports precise reviewer actions without exposing broader,
-- formulation-inapplicable safety candidates.

create or replace function public.drx_phase11_clinical_batch_packet_v3(p_dose_moiety_key text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'batch',(select to_jsonb(b)
           from drx_dose.clinical_review_batch_summary_v1 b
           where b.dose_moiety_key=p_dose_moiety_key),
  'regimens',coalesce((
    select jsonb_agg(jsonb_build_object(
      'regimenKey',p.regimen_key,
      'substanceName',p.substance_name,
      'indicationId',r.indication_id,
      'indicationKeyCandidate',r.indication_key_candidate,
      'indicationLabel',p.indication_label,
      'patientGroup',p.patient_group,
      'routeKey',p.route_key,
      'formFamily',p.form_family,
      'regimenKind',p.regimen_kind,
      'reviewStatus',p.review_status,
      'clinicalReviewReady',p.clinical_review_ready,
      'steps',p.steps,
      'presentationRequirements',p.presentation_requirements,
      'administrationRequirements',p.administration_requirements,
      'supportingEvidence',p.supporting_evidence,
      'linkedIndications',p.linked_indications,
      'applicableSafety',coalesce((
        select jsonb_agg(jsonb_build_object(
          'candidateType',s.candidate_type,
          'candidateKey',s.candidate_key,
          'reviewStatus',s.review_status,
          'targetKind',s.target_kind,
          'domainOrType',s.domain_or_type,
          'clinicalText',s.clinical_text,
          'applicabilityScope',s.applicability_scope,
          'sourceSnapshotId',s.source_snapshot_id
        ) order by s.candidate_type,s.candidate_key)
        from drx_dose.source_regimen_applicable_safety_v2 s
        where s.regimen_key=p.regimen_key
      ),'[]'::jsonb),
      'primaryIndication',(select jsonb_build_object(
        'indicationId',i.indication_id,
        'indicationKey',i.indication_key,
        'canonicalName',i.canonical_name,
        'editorialStatus',i.editorial_status,
        'icdVerificationStatus',i.icd_verification_status,
        'icd10Codes',i.icd10_codes
      ) from public.dose_indication_concepts_v3 i
        where i.indication_id=r.indication_id),
      'clinicalApprovalGate',(select to_jsonb(g)
        from drx_dose.source_regimen_clinical_approval_gate_v1 g
        where g.regimen_key=p.regimen_key),
      'promotionGate',(select to_jsonb(g)
        from drx_dose.source_regimen_promotion_gate_v6 g
        where g.regimen_key=p.regimen_key),
      'inheritance',(select to_jsonb(i)
        from drx_dose.source_regimen_product_inheritance_summary_v1 i
        where i.regimen_key=p.regimen_key),
      'reviewEvents',coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from drx_dose.phase11_review_events_v1 e
        where e.regimen_key=p.regimen_key
      ),'[]'::jsonb)
    ) order by p.regimen_key)
    from drx_dose.source_regimen_clinical_review_packet_v1 p
    join drx_dose.source_regimen_candidates_v1 r
      on r.regimen_key=p.regimen_key
    where r.dose_moiety_key=p_dose_moiety_key
  ),'[]'::jsonb)
);
$$;

revoke all on function public.drx_phase11_clinical_batch_packet_v3(text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_batch_packet_v3(text)
  to service_role;
