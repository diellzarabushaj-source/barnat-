-- DRx Phase 11CX: evidence batch drill-down metadata.
-- Adds exact snapshot/hash identifiers to the read-only preflight packet so
-- reviewers can review each regimen evidence row individually from one source batch.

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
  'autoApproveAllowed',false,
  'autoVerifyEvidenceAllowed',false
);
$$;

revoke all on function public.drx_phase11_clinical_preflight_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_preflight_workbench_v1()
  to service_role;
