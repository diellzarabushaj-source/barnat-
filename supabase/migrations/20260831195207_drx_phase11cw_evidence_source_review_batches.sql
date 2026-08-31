-- DRx Phase 11CW: exact-source evidence review batching.
-- Groups evidence for reviewer efficiency only. Decisions remain row/regimen
-- specific and automatic verification remains disabled.

create or replace view drx_dose.phase11_evidence_source_review_batches_v1
with (security_invoker=true)
as
select
  md5(e.source_snapshot_id||'|'||e.source_section_code||'|'||e.source_section_sha256) as source_batch_key,
  e.source_snapshot_id,
  e.source_section_code,
  e.source_section_sha256,
  s.authority,
  s.source_tier,
  s.document_version,
  s.document_date,
  coalesce(s.final_url,s.source_url) as source_url,
  sec.heading,
  length(sec.section_text) as section_text_length,
  count(*) as evidence_rows,
  count(distinct e.regimen_key) as regimen_count,
  count(*) filter (where e.evidence_role='PRIMARY') as primary_rows,
  count(*) filter (where e.evidence_role='SUPPORTING') as supporting_rows,
  count(*) filter (where e.evidence_role='CONCORDANT') as concordant_rows,
  count(*) filter (where e.review_status='VERIFIED') as verified_rows,
  count(*) filter (where e.review_status not in ('VERIFIED','REJECTED')) as pending_rows,
  count(*) filter (where cardinality(p.integrity_blockers)>0) as integrity_blocked_rows,
  jsonb_agg(jsonb_build_object(
    'regimenKey',e.regimen_key,
    'evidenceRole',e.evidence_role,
    'reviewStatus',e.review_status
  ) order by e.regimen_key,e.evidence_role) as regimens,
  false::boolean as auto_verify_allowed
from drx_dose.source_regimen_supporting_evidence_v1 e
join drx_dose.phase11_evidence_integrity_precheck_v1 p
  on p.regimen_key=e.regimen_key
 and p.source_snapshot_id=e.source_snapshot_id
 and p.source_section_code=e.source_section_code
 and p.source_section_sha256=e.source_section_sha256
left join public.dose_source_snapshots_v3 s
  on s.snapshot_id=e.source_snapshot_id
left join public.dose_source_sections_v3 sec
  on sec.snapshot_id=e.source_snapshot_id
 and sec.section_code=e.source_section_code
 and sec.section_sha256=e.source_section_sha256
group by
  e.source_snapshot_id,e.source_section_code,e.source_section_sha256,
  s.authority,s.source_tier,s.document_version,s.document_date,
  s.final_url,s.source_url,sec.heading,sec.section_text;

create or replace view drx_dose.phase11_evidence_source_review_batch_summary_v1
with (security_invoker=true)
as
select
  count(*) as source_batches,
  sum(evidence_rows) as evidence_rows,
  sum(regimen_count) as regimen_references,
  count(*) filter (where integrity_blocked_rows=0) as integrity_ready_batches,
  count(*) filter (where integrity_blocked_rows>0) as integrity_blocked_batches,
  count(*) filter (where pending_rows>0) as human_review_pending_batches,
  count(*) filter (where pending_rows=0) as human_review_complete_batches,
  false::boolean as auto_verify_allowed
from drx_dose.phase11_evidence_source_review_batches_v1;

revoke all on drx_dose.phase11_evidence_source_review_batches_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_evidence_source_review_batch_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_evidence_source_review_batches_v1 to service_role;
grant select on drx_dose.phase11_evidence_source_review_batch_summary_v1 to service_role;

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
      'pendingRows',b.pending_rows,
      'integrityBlockedRows',b.integrity_blocked_rows,
      'regimens',b.regimens
    ) order by b.regimen_count desc,b.source_batch_key)
    from drx_dose.phase11_evidence_source_review_batches_v1 b
  ),'[]'::jsonb),
  'autoApproveAllowed',false,
  'autoVerifyEvidenceAllowed',false
);
$$;

revoke all on function public.drx_phase11_clinical_preflight_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_preflight_workbench_v1()
  to service_role;
