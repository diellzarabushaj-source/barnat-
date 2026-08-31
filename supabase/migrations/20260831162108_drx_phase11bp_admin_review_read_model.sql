
-- DRx Phase 11BP: admin-review read model exposed through service-role RPCs.
-- Read-only. No clinical status, identity decision, publication or runtime state is changed.

create or replace function public.drx_phase11_review_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select jsonb_build_object(
  'completion',(select to_jsonb(x) from drx_dose.phase11_completion_summary_v3 x),
  'runtime',(select to_jsonb(x) from drx_dose.phase11_runtime_cutover_readiness_v1 x),
  'safetyInvariants',(select to_jsonb(x) from drx_dose.phase11_safety_invariant_audit_v1 x),
  'counts',jsonb_build_object(
    'identityBatches',(select count(*) from drx_dose.ingredient_identity_review_batches_v1),
    'identityProducts',(select coalesce(sum(product_count),0) from drx_dose.ingredient_identity_review_batches_v1),
    'clinicalBatches',(select count(*) from drx_dose.clinical_review_batch_summary_v1),
    'regimens',(select count(*) from drx_dose.source_regimen_candidates_v1),
    'approvedRegimens',(select count(*) from drx_dose.source_regimen_candidates_v1 where review_status='APPROVED'),
    'evidenceRows',(select count(*) from drx_dose.source_regimen_supporting_evidence_v1),
    'verifiedEvidenceRows',(select count(*) from drx_dose.source_regimen_supporting_evidence_v1 where review_status='VERIFIED'),
    'presentationRows',(select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1),
    'verifiedPresentationRows',(select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1 where review_status='VERIFIED'),
    'administrationRows',(select count(*) from drx_dose.source_regimen_step_administration_v1),
    'verifiedAdministrationRows',(select count(*) from drx_dose.source_regimen_step_administration_v1 where review_status='VERIFIED'),
    'indications',(select count(*) from public.dose_indication_concepts_v3),
    'publishedIndications',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='published'),
    'icdVerified',(select count(*) from public.dose_indication_concepts_v3 where icd_verification_status='verified'),
    'productShellItems',(select count(*) from drx_dose.product_shell_provisioning_queue_v1),
    'publishedProductShells',(select count(*) from drx_dose.product_shell_provisioning_queue_v1 where next_action='SHELL_PUBLISHED')
  ),
  'identityBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'signature',b.composition_signature,
      'composition',b.normalized_composition,
      'productCount',b.product_count,
      'registryNumbers',b.registry_numbers,
      'tradeNames',b.trade_names,
      'reviewClasses',b.review_classes
    ) order by b.product_count desc,b.normalized_composition)
    from drx_dose.ingredient_identity_review_batches_v1 b
  ),'[]'::jsonb),
  'clinicalBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'doseMoietyKey',b.dose_moiety_key,
      'targetKind',b.target_kind,
      'name',b.review_target_name,
      'regimenCount',b.regimen_count,
      'reviewReadyRegimens',b.review_ready_regimens,
      'approvedRegimens',b.approved_regimens,
      'representedProducts',b.represented_product_count,
      'priorityScore',b.batch_priority_score,
      'nextAction',b.next_action
    ) order by b.batch_priority_score desc,b.review_target_name)
    from drx_dose.clinical_review_batch_summary_v1 b
  ),'[]'::jsonb),
  'productShells',coalesce((
    select jsonb_agg(jsonb_build_object(
      'drugId',q.drug_id,
      'registryNumber',q.registry_number,
      'tradeName',q.trade_name,
      'form',q.pharmaceutical_form,
      'nextAction',q.next_action,
      'exactMarketSourceKey',q.exact_market_source_key,
      'productKey',q.product_key,
      'productShellStatus',q.product_shell_status
    ) order by q.registry_number)
    from drx_dose.product_shell_provisioning_queue_v1 q
  ),'[]'::jsonb),
  'generatedAt',now()
);
$$;

create or replace function public.drx_phase11_regimen_review_packet_v1(p_regimen_key text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'packet',to_jsonb(p),
  'safety',coalesce((
    select jsonb_agg(to_jsonb(s) order by s.candidate_type,s.candidate_key)
    from drx_dose.source_regimen_applicable_safety_v2 s
    where s.regimen_key=p.regimen_key
  ),'[]'::jsonb),
  'promotionGate',(select to_jsonb(g) from drx_dose.source_regimen_promotion_gate_v6 g where g.regimen_key=p.regimen_key),
  'materialization',coalesce((
    select jsonb_agg(to_jsonb(m) order by m.branch_no,m.step_no)
    from drx_dose.source_regimen_rule_materialization_preview_v2 m
    where m.regimen_key=p.regimen_key
  ),'[]'::jsonb),
  'inheritance',(select to_jsonb(i) from drx_dose.source_regimen_product_inheritance_summary_v1 i where i.regimen_key=p.regimen_key)
)
from drx_dose.source_regimen_clinical_review_packet_v1 p
where p.regimen_key=p_regimen_key;
$$;

create or replace function public.drx_phase11_identity_batch_packet_v1(p_composition_signature text)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'batch',to_jsonb(b),
  'products',coalesce((
    select jsonb_agg(jsonb_build_object(
      'drugId',d.id,
      'registryNumber',d.registry_number,
      'tradeName',d.trade_name,
      'activeSubstance',d.active_substance,
      'strength',d.strength,
      'form',d.pharmaceutical_form,
      'atcCode',d.atc_code,
      'sourceVersionId',d.source_version_id,
      'sourceHash',d.source_hash
    ) order by d.registry_number)
    from public.drugs d
    where d.id=any(b.drug_ids)
  ),'[]'::jsonb),
  'priorDecisions',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from drx_dose.ingredient_identity_batch_decisions_v1 x
    where x.composition_signature=b.composition_signature
  ),'[]'::jsonb)
)
from drx_dose.ingredient_identity_review_batches_v1 b
where b.composition_signature=p_composition_signature;
$$;

revoke all on function public.drx_phase11_review_workbench_v1() from public,anon,authenticated;
revoke all on function public.drx_phase11_regimen_review_packet_v1(text) from public,anon,authenticated;
revoke all on function public.drx_phase11_identity_batch_packet_v1(text) from public,anon,authenticated;

grant execute on function public.drx_phase11_review_workbench_v1() to service_role;
grant execute on function public.drx_phase11_regimen_review_packet_v1(text) to service_role;
grant execute on function public.drx_phase11_identity_batch_packet_v1(text) to service_role;
