-- DRx Phase 11CY: exact-source safety review batching + preflight packet.
-- Reviewer efficiency only: candidates remain individually reviewed.
-- No automatic approval, promotion, materialization, application or publication.

create or replace view drx_dose.phase11_safety_source_review_batches_v1
with (security_invoker=true)
as
with applicable as (
  select distinct candidate_type,candidate_key
  from drx_dose.source_regimen_applicable_safety_v2
),
candidate_base as (
  select
    'ADJUSTMENT'::text as candidate_type,
    a.adjustment_key as candidate_key,
    a.adjustment_domain as domain_or_type,
    a.condition_text as clinical_text,
    a.review_status,
    a.source_snapshot_id,
    a.source_section_code,
    a.source_section_sha256,
    a.source_url,
    a.target_kind,
    a.dose_moiety_key
  from drx_dose.source_adjustment_candidates_v1 a
  join applicable ap
    on ap.candidate_type='ADJUSTMENT'
   and ap.candidate_key=a.adjustment_key

  union all

  select
    'RESTRICTION',
    r.restriction_key,
    r.restriction_type,
    r.restriction_text,
    r.review_status,
    r.source_snapshot_id,
    r.source_section_code,
    r.source_section_sha256,
    r.source_url,
    r.target_kind,
    r.dose_moiety_key
  from drx_dose.source_restriction_candidates_v1 r
  join applicable ap
    on ap.candidate_type='RESTRICTION'
   and ap.candidate_key=r.restriction_key
),
candidate_stats as (
  select
    c.*,
    count(s.*) as applicability_rows,
    count(distinct s.regimen_key) as regimen_count,
    array_agg(distinct s.applicability_scope order by s.applicability_scope) as applicability_scopes,
    count(*) filter (where cardinality(p.integrity_blockers)>0) as integrity_blocked_rows
  from candidate_base c
  join drx_dose.source_regimen_applicable_safety_v2 s
    on s.candidate_type=c.candidate_type
   and s.candidate_key=c.candidate_key
  join drx_dose.phase11_safety_integrity_precheck_v1 p
    on p.regimen_key=s.regimen_key
   and p.candidate_type=s.candidate_type
   and p.candidate_key=s.candidate_key
  group by
    c.candidate_type,c.candidate_key,c.domain_or_type,c.clinical_text,c.review_status,
    c.source_snapshot_id,c.source_section_code,c.source_section_sha256,c.source_url,
    c.target_kind,c.dose_moiety_key
),
source_batches as (
  select
    md5(c.source_snapshot_id||'|'||c.source_section_code||'|'||c.source_section_sha256) as source_batch_key,
    c.source_snapshot_id,
    c.source_section_code,
    c.source_section_sha256,
    snap.authority,
    snap.source_tier,
    snap.document_version,
    snap.document_date,
    coalesce(snap.final_url,snap.source_url,c.source_url) as source_url,
    sec.heading,
    count(*) as candidate_count,
    count(*) filter (where c.candidate_type='ADJUSTMENT') as adjustment_count,
    count(*) filter (where c.candidate_type='RESTRICTION') as restriction_count,
    sum(c.applicability_rows) as applicability_rows,
    count(*) filter (where c.review_status='APPROVED') as approved_candidates,
    count(*) filter (where c.review_status='REJECTED') as rejected_candidates,
    count(*) filter (where c.review_status not in ('APPROVED','REJECTED','PROMOTED')) as pending_candidates,
    count(*) filter (where c.integrity_blocked_rows>0) as integrity_blocked_candidates,
    jsonb_agg(jsonb_build_object(
      'candidateType',c.candidate_type,
      'candidateKey',c.candidate_key,
      'domainOrType',c.domain_or_type,
      'clinicalText',c.clinical_text,
      'reviewStatus',c.review_status,
      'targetKind',c.target_kind,
      'doseMoietyKey',c.dose_moiety_key,
      'applicabilityRows',c.applicability_rows,
      'regimenCount',c.regimen_count,
      'applicabilityScopes',c.applicability_scopes,
      'integrityBlockedRows',c.integrity_blocked_rows
    ) order by c.candidate_type,c.candidate_key) as candidates
  from candidate_stats c
  left join public.dose_source_snapshots_v3 snap
    on snap.snapshot_id=c.source_snapshot_id
  left join public.dose_source_sections_v3 sec
    on sec.snapshot_id=c.source_snapshot_id
   and sec.section_code=c.source_section_code
   and sec.section_sha256=c.source_section_sha256
  group by
    c.source_snapshot_id,c.source_section_code,c.source_section_sha256,
    snap.authority,snap.source_tier,snap.document_version,snap.document_date,
    snap.final_url,snap.source_url,c.source_url,sec.heading
)
select
  b.*,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_apply_allowed
from source_batches b;

create or replace view drx_dose.phase11_safety_source_review_batch_summary_v1
with (security_invoker=true)
as
select
  count(*) as source_batches,
  sum(candidate_count) as applicable_candidates,
  sum(applicability_rows) as applicability_rows,
  count(*) filter (where integrity_blocked_candidates=0) as integrity_ready_batches,
  count(*) filter (where integrity_blocked_candidates>0) as integrity_blocked_batches,
  sum(approved_candidates) as approved_candidates,
  sum(rejected_candidates) as rejected_candidates,
  sum(pending_candidates) as pending_candidates,
  count(*) filter (where pending_candidates>0) as human_review_pending_batches,
  count(*) filter (where pending_candidates=0) as human_review_complete_batches,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_apply_allowed
from drx_dose.phase11_safety_source_review_batches_v1;

revoke all on drx_dose.phase11_safety_source_review_batches_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_safety_source_review_batch_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_safety_source_review_batches_v1 to service_role;
grant select on drx_dose.phase11_safety_source_review_batch_summary_v1 to service_role;

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

  'autoApproveAllowed',false,
  'autoVerifyEvidenceAllowed',false,
  'autoApproveSafetyAllowed',false,
  'autoApplySafetyAllowed',false
);
$$;

revoke all on function public.drx_phase11_clinical_preflight_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_preflight_workbench_v1()
  to service_role;
