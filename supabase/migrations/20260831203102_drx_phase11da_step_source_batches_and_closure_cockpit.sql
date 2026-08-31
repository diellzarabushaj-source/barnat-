-- DRx Phase 11DA: step-source review batches + human-review closure cockpit.
-- Presentation and administration rows are grouped by exact §4.2 source for
-- reviewer efficiency only. Suggested queue order is advisory; no review,
-- approval, publication or cutover is automatic.

create or replace view drx_dose.phase11_step_source_review_batches_v1
with (security_invoker=true)
as
with items as (
  select
    'PRESENTATION'::text as item_type,
    p.regimen_key,p.branch_no,p.step_no,
    p.review_status,
    p.source_snapshot_id,p.source_section_sha256,
    jsonb_build_object(
      'presentationPolicy',p.presentation_policy,
      'sourceProductLabel',p.source_product_label,
      'requiredStrengthValue',p.required_strength_value,
      'requiredStrengthUnit',p.required_strength_unit,
      'requiredFormFamily',p.required_form_family,
      'requiredRouteKey',p.required_route_key,
      'requiredReleaseKey',p.required_release_key
    ) as details,
    pre.integrity_blockers
  from drx_dose.source_regimen_step_presentation_requirements_v1 p
  join drx_dose.phase11_presentation_integrity_precheck_v1 pre
    on pre.regimen_key=p.regimen_key and pre.branch_no=p.branch_no and pre.step_no=p.step_no

  union all

  select
    'ADMINISTRATION',
    a.regimen_key,a.branch_no,a.step_no,
    a.review_status,
    a.source_snapshot_id,a.source_section_sha256,
    jsonb_build_object(
      'foodRequirement',a.food_requirement,
      'timingRequirement',a.timing_requirement,
      'administrationNote',a.administration_note
    ),
    pre.integrity_blockers
  from drx_dose.source_regimen_step_administration_v1 a
  join drx_dose.phase11_administration_integrity_precheck_v1 pre
    on pre.regimen_key=a.regimen_key and pre.branch_no=a.branch_no and pre.step_no=a.step_no
)
select
  md5(i.source_snapshot_id||'|4.2|'||i.source_section_sha256) as source_batch_key,
  i.source_snapshot_id,
  i.source_section_sha256,
  snap.authority,snap.source_tier,snap.document_version,snap.document_date,
  coalesce(snap.final_url,snap.source_url) as source_url,
  sec.heading,
  count(*) as item_count,
  count(*) filter (where i.item_type='PRESENTATION') as presentation_rows,
  count(*) filter (where i.item_type='ADMINISTRATION') as administration_rows,
  count(*) filter (where i.review_status='VERIFIED') as verified_rows,
  count(*) filter (where i.review_status not in ('VERIFIED','REJECTED')) as pending_rows,
  count(*) filter (where cardinality(coalesce(i.integrity_blockers,'{}'::text[]))>0) as integrity_blocked_rows,
  jsonb_agg(jsonb_build_object(
    'itemType',i.item_type,
    'regimenKey',i.regimen_key,
    'branchNo',i.branch_no,
    'stepNo',i.step_no,
    'reviewStatus',i.review_status,
    'details',i.details,
    'technicalBlockers',coalesce(i.integrity_blockers,'{}'::text[])
  ) order by i.item_type,i.regimen_key,i.branch_no,i.step_no) as items,
  false::boolean as auto_verify_allowed
from items i
join public.dose_source_snapshots_v3 snap on snap.snapshot_id=i.source_snapshot_id
join public.dose_source_sections_v3 sec
  on sec.snapshot_id=i.source_snapshot_id
 and sec.section_code='4.2'
 and sec.section_sha256=i.source_section_sha256
group by
  i.source_snapshot_id,i.source_section_sha256,
  snap.authority,snap.source_tier,snap.document_version,snap.document_date,
  snap.final_url,snap.source_url,sec.heading;

create or replace view drx_dose.phase11_step_source_review_batch_summary_v1
with (security_invoker=true)
as
select
  count(*) as source_batches,
  sum(item_count) as item_rows,
  sum(presentation_rows) as presentation_rows,
  sum(administration_rows) as administration_rows,
  sum(verified_rows) as verified_rows,
  sum(pending_rows) as pending_rows,
  count(*) filter (where integrity_blocked_rows=0) as integrity_ready_batches,
  count(*) filter (where integrity_blocked_rows>0) as integrity_blocked_batches,
  count(*) filter (where pending_rows>0) as human_review_pending_batches,
  count(*) filter (where pending_rows=0) as human_review_complete_batches,
  false::boolean as auto_verify_allowed
from drx_dose.phase11_step_source_review_batches_v1;

create or replace view drx_dose.phase11_human_review_closure_summary_v1
with (security_invoker=true)
as
select
  c.regimen_total,
  c.technical_integrity_ready,
  c.technical_integrity_blocked,
  e.source_batches as evidence_source_batches,
  e.human_review_pending_batches as evidence_pending_batches,
  e.evidence_rows as evidence_rows,
  i.source_batches as indication_source_batches,
  i.human_review_pending_batches as indication_pending_batches,
  i.active_indications,
  (select count(*) from drx_dose.phase11_indication_unused_review_queue_v1) as unused_indications,
  s.source_batches as safety_source_batches,
  s.human_review_pending_batches as safety_pending_batches,
  s.applicable_candidates as safety_candidates,
  st.source_batches as step_source_batches,
  st.human_review_pending_batches as step_pending_batches,
  st.presentation_rows,
  st.administration_rows,
  c.ready_for_human_clinical_attestation,
  c.clinically_approved,
  c.clinically_pending,
  case
    when e.human_review_pending_batches>0 then 'EVIDENCE'
    when i.human_review_pending_batches>0
      or exists (
        select 1
        from drx_dose.phase11_indication_unused_review_queue_v1
        where not (editorial_status='published' and icd_verification_status='verified')
      ) then 'INDICATION_ICD'
    when s.human_review_pending_batches>0 then 'SAFETY'
    when st.human_review_pending_batches>0 then 'PRESENTATION_ADMINISTRATION'
    when c.ready_for_human_clinical_attestation>0 then 'FINAL_CLINICAL_ATTESTATION'
    when c.clinically_pending=0 then 'COMPLETE'
    else 'BLOCKED'
  end as suggested_next_queue,
  false::boolean as automatic_closure_allowed
from drx_dose.phase11_clinical_review_preflight_summary_v1 c
cross join drx_dose.phase11_evidence_source_review_batch_summary_v1 e
cross join drx_dose.phase11_indication_source_review_batch_summary_v1 i
cross join drx_dose.phase11_safety_source_review_batch_summary_v1 s
cross join drx_dose.phase11_step_source_review_batch_summary_v1 st;

revoke all on drx_dose.phase11_step_source_review_batches_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_step_source_review_batch_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_human_review_closure_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_step_source_review_batches_v1 to service_role;
grant select on drx_dose.phase11_step_source_review_batch_summary_v1 to service_role;
grant select on drx_dose.phase11_human_review_closure_summary_v1 to service_role;

create or replace function public.drx_phase11_clinical_preflight_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'summary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_clinical_review_preflight_summary_v1 s
  ),'{}'::jsonb),
  'closureSummary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_human_review_closure_summary_v1 s
  ),'{}'::jsonb),
  'technicalBlocked',coalesce((
    select jsonb_agg(jsonb_build_object(
      'regimenKey',q.regimen_key,
      'indicationId',q.indication_id,
      'blockers',q.technical_integrity_blockers
    ) order by q.regimen_key)
    from drx_dose.phase11_clinical_review_preflight_v1 q
    where not q.technical_integrity_ready
  ),'[]'::jsonb),
  'humanBlockerCounts',coalesce((
    select jsonb_agg(jsonb_build_object(
      'blocker',x.blocker,
      'regimenCount',x.regimen_count
    ) order by x.regimen_count desc,x.blocker)
    from (
      select b.blocker,count(distinct q.regimen_key) as regimen_count
      from drx_dose.phase11_clinical_review_preflight_v1 q
      cross join lateral unnest(q.upstream_human_review_blockers) b(blocker)
      group by b.blocker
    ) x
  ),'[]'::jsonb),
  'readyForAttestation',coalesce((
    select jsonb_agg(jsonb_build_object(
      'regimenKey',q.regimen_key,
      'reviewStatus',q.review_status
    ) order by q.regimen_key)
    from drx_dose.phase11_clinical_review_preflight_v1 q
    where q.technical_integrity_ready
      and q.upstream_human_review_complete
      and q.review_status='PENDING'
  ),'[]'::jsonb),
  'evidenceBatchSummary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_evidence_source_review_batch_summary_v1 s
  ),'{}'::jsonb),
  'evidenceSourceBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceBatchKey',b.source_batch_key,
      'sourceSnapshotId',b.source_snapshot_id,
      'sourceSectionSha256',b.source_section_sha256,
      'authority',b.authority,
      'sourceTier',b.source_tier,
      'documentVersion',b.document_version,
      'documentDate',b.document_date,
      'sourceUrl',b.source_url,
      'sectionCode',b.source_section_code,
      'heading',b.heading,
      'regimenCount',b.regimen_count,
      'evidenceRows',b.evidence_rows,
      'primaryRows',b.primary_rows,
      'supportingRows',b.supporting_rows,
      'concordantRows',b.concordant_rows,
      'verifiedRows',b.verified_rows,
      'pendingRows',b.pending_rows,
      'integrityBlockedRows',b.integrity_blocked_rows,
      'regimens',b.regimens
    ) order by b.regimen_count desc,b.source_batch_key)
    from drx_dose.phase11_evidence_source_review_batches_v1 b
  ),'[]'::jsonb),
  'safetyBatchSummary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_safety_source_review_batch_summary_v1 s
  ),'{}'::jsonb),
  'safetySourceBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceBatchKey',b.source_batch_key,
      'sourceSnapshotId',b.source_snapshot_id,
      'sourceSectionSha256',b.source_section_sha256,
      'authority',b.authority,
      'sourceTier',b.source_tier,
      'documentVersion',b.document_version,
      'documentDate',b.document_date,
      'sourceUrl',b.source_url,
      'sectionCode',b.source_section_code,
      'heading',b.heading,
      'candidateCount',b.candidate_count,
      'adjustmentCount',b.adjustment_count,
      'restrictionCount',b.restriction_count,
      'applicabilityRows',b.applicability_rows,
      'approvedCandidates',b.approved_candidates,
      'rejectedCandidates',b.rejected_candidates,
      'pendingCandidates',b.pending_candidates,
      'integrityBlockedCandidates',b.integrity_blocked_candidates,
      'candidates',b.candidates
    ) order by b.candidate_count desc,b.source_batch_key)
    from drx_dose.phase11_safety_source_review_batches_v1 b
  ),'[]'::jsonb),
  'stepBatchSummary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_step_source_review_batch_summary_v1 s
  ),'{}'::jsonb),
  'stepSourceBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceBatchKey',b.source_batch_key,
      'sourceSnapshotId',b.source_snapshot_id,
      'sourceSectionSha256',b.source_section_sha256,
      'authority',b.authority,
      'sourceTier',b.source_tier,
      'documentVersion',b.document_version,
      'documentDate',b.document_date,
      'sourceUrl',b.source_url,
      'sectionCode','4.2',
      'heading',b.heading,
      'itemCount',b.item_count,
      'presentationRows',b.presentation_rows,
      'administrationRows',b.administration_rows,
      'verifiedRows',b.verified_rows,
      'pendingRows',b.pending_rows,
      'integrityBlockedRows',b.integrity_blocked_rows,
      'items',b.items
    ) order by b.item_count desc,b.source_batch_key)
    from drx_dose.phase11_step_source_review_batches_v1 b
  ),'[]'::jsonb),
  'autoApproveAllowed',false,
  'autoVerifyEvidenceAllowed',false,
  'autoApproveSafetyAllowed',false,
  'autoApplySafetyAllowed',false,
  'autoVerifyStepAllowed',false,
  'automaticClosureAllowed',false
);
$$;

revoke all on function public.drx_phase11_clinical_preflight_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_preflight_workbench_v1()
  to service_role;
