-- DRx Phase 11CZ: exact-source §4.1 indication review batching.
-- Active regimen indications are grouped by the exact current SmPC §4.1
-- source snapshot; unused concepts remain separate. Every indication publish
-- remains an explicit human decision and automatic publication stays disabled.

create or replace view drx_dose.phase11_indication_source_review_batches_v1
with (security_invoker=true)
as
with refs as (
  select r.source_snapshot_id,r.indication_id,count(*) as regimen_count
  from drx_dose.source_regimen_candidates_v1 r
  where r.indication_id is not null
  group by r.source_snapshot_id,r.indication_id
),
rows as (
  select
    md5(r.source_snapshot_id||'|4.1|'||sec.section_sha256) as source_batch_key,
    r.source_snapshot_id,
    sec.section_sha256 as source_section_sha256,
    snap.authority,snap.source_tier,snap.document_version,snap.document_date,
    coalesce(snap.final_url,snap.source_url) as source_url,
    sec.heading,length(sec.section_text) as section_text_length,
    i.indication_id,i.indication_key,i.canonical_name,
    i.editorial_status,i.icd_verification_status,i.icd10_codes,
    r.regimen_count,
    q.candidate_count,q.best_match_score,q.suggestion_quality,
    q.manual_search_required,q.candidates,
    pre.integrity_blockers,pre.review_blockers
  from refs r
  join public.dose_indication_concepts_v3 i on i.indication_id=r.indication_id
  join public.dose_source_snapshots_v3 snap on snap.snapshot_id=r.source_snapshot_id
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=r.source_snapshot_id and sec.section_code='4.1'
  left join drx_dose.indication_icd_review_queue_v2 q on q.indication_id=i.indication_id
  left join drx_dose.phase11_indication_icd_integrity_precheck_v1 pre on pre.indication_id=i.indication_id
)
select
  source_batch_key,source_snapshot_id,source_section_sha256,
  authority,source_tier,document_version,document_date,source_url,heading,
  max(section_text_length) as section_text_length,
  count(*) as indication_count,
  sum(regimen_count) as regimen_count,
  count(*) filter (where editorial_status='published' and icd_verification_status='verified') as verified_published_indications,
  count(*) filter (where not (editorial_status='published' and icd_verification_status='verified')) as pending_indications,
  count(*) filter (where coalesce(manual_search_required,false)) as manual_search_indications,
  count(*) filter (where suggestion_quality in ('HIGH','MEDIUM')) as high_medium_indications,
  count(*) filter (where cardinality(coalesce(integrity_blockers,'{}'::text[]))>0) as integrity_blocked_indications,
  jsonb_agg(jsonb_build_object(
    'indicationId',indication_id,
    'indicationKey',indication_key,
    'canonicalName',canonical_name,
    'editorialStatus',editorial_status,
    'icdVerificationStatus',icd_verification_status,
    'icd10Codes',icd10_codes,
    'regimenCount',regimen_count,
    'candidateCount',candidate_count,
    'bestMatchScore',best_match_score,
    'suggestionQuality',suggestion_quality,
    'manualSearchRequired',manual_search_required,
    'candidates',candidates,
    'technicalBlockers',coalesce(integrity_blockers,'{}'::text[]),
    'reviewBlockers',coalesce(review_blockers,'{}'::text[])
  ) order by
    case when cardinality(coalesce(integrity_blockers,'{}'::text[]))>0 then 0 else 1 end,
    case suggestion_quality when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end,
    best_match_score desc nulls last,
    canonical_name
  ) as indications,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from rows
group by source_batch_key,source_snapshot_id,source_section_sha256,
  authority,source_tier,document_version,document_date,source_url,heading;

create or replace view drx_dose.phase11_indication_source_review_batch_summary_v1
with (security_invoker=true)
as
select
  count(*) as source_batches,
  sum(indication_count) as indication_references,
  (select count(distinct r.indication_id)
   from drx_dose.source_regimen_candidates_v1 r
   where r.indication_id is not null) as active_indications,
  sum(regimen_count) as regimen_references,
  sum(verified_published_indications) as verified_published_references,
  sum(pending_indications) as pending_indication_references,
  sum(manual_search_indications) as manual_search_references,
  sum(integrity_blocked_indications) as integrity_blocked_references,
  count(*) filter (where pending_indications>0) as human_review_pending_batches,
  count(*) filter (where pending_indications=0) as human_review_complete_batches,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_indication_source_review_batches_v1;

create or replace view drx_dose.phase11_indication_unused_review_queue_v1
with (security_invoker=true)
as
select
  i.indication_id,i.indication_key,i.canonical_name,
  i.editorial_status,i.icd_verification_status,i.icd10_codes,
  q.candidate_count,q.best_match_score,q.suggestion_quality,
  q.manual_search_required,q.candidates,
  coalesce(pre.integrity_blockers,'{}'::text[]) as technical_blockers,
  coalesce(pre.review_blockers,'{}'::text[]) as review_blockers,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from public.dose_indication_concepts_v3 i
left join drx_dose.indication_icd_review_queue_v2 q on q.indication_id=i.indication_id
left join drx_dose.phase11_indication_icd_integrity_precheck_v1 pre on pre.indication_id=i.indication_id
where not exists (
  select 1 from drx_dose.source_regimen_candidates_v1 r
  where r.indication_id=i.indication_id
);

revoke all on drx_dose.phase11_indication_source_review_batches_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_indication_source_review_batch_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_indication_unused_review_queue_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_indication_source_review_batches_v1 to service_role;
grant select on drx_dose.phase11_indication_source_review_batch_summary_v1 to service_role;
grant select on drx_dose.phase11_indication_unused_review_queue_v1 to service_role;

create or replace function public.drx_phase11_indication_review_packet_v2()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'summary',jsonb_build_object(
    'total',(select count(*) from public.dose_indication_concepts_v3),
    'published',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='published'),
    'draft',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='draft'),
    'icdVerified',(select count(*) from public.dose_indication_concepts_v3 where icd_verification_status='verified')
  ),
  'quality',(select to_jsonb(x) from drx_dose.indication_icd_review_quality_summary_v1 x),
  'sourceBatchSummary',(select to_jsonb(x) from drx_dose.phase11_indication_source_review_batch_summary_v1 x),
  'sourceBatches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceBatchKey',b.source_batch_key,
      'sourceSnapshotId',b.source_snapshot_id,
      'sourceSectionSha256',b.source_section_sha256,
      'authority',b.authority,
      'sourceTier',b.source_tier,
      'documentVersion',b.document_version,
      'documentDate',b.document_date,
      'sourceUrl',b.source_url,
      'sectionCode','4.1',
      'heading',b.heading,
      'sectionTextLength',b.section_text_length,
      'indicationCount',b.indication_count,
      'regimenCount',b.regimen_count,
      'verifiedPublishedIndications',b.verified_published_indications,
      'pendingIndications',b.pending_indications,
      'manualSearchIndications',b.manual_search_indications,
      'highMediumIndications',b.high_medium_indications,
      'integrityBlockedIndications',b.integrity_blocked_indications,
      'indications',b.indications
    ) order by b.indication_count desc,b.source_batch_key)
    from drx_dose.phase11_indication_source_review_batches_v1 b
  ),'[]'::jsonb),
  'unusedSummary',jsonb_build_object(
    'total',(select count(*) from drx_dose.phase11_indication_unused_review_queue_v1),
    'manualSearchRequired',(select count(*) from drx_dose.phase11_indication_unused_review_queue_v1 where manual_search_required),
    'integrityBlocked',(select count(*) from drx_dose.phase11_indication_unused_review_queue_v1 where cardinality(technical_blockers)>0)
  ),
  'unusedItems',coalesce((
    select jsonb_agg(jsonb_build_object(
      'indicationId',u.indication_id,
      'indicationKey',u.indication_key,
      'canonicalName',u.canonical_name,
      'editorialStatus',u.editorial_status,
      'icdVerificationStatus',u.icd_verification_status,
      'icd10Codes',u.icd10_codes,
      'candidateCount',u.candidate_count,
      'bestMatchScore',u.best_match_score,
      'suggestionQuality',u.suggestion_quality,
      'manualSearchRequired',u.manual_search_required,
      'candidates',u.candidates,
      'technicalBlockers',u.technical_blockers,
      'reviewBlockers',u.review_blockers
    ) order by
      case when cardinality(u.technical_blockers)>0 then 0 else 1 end,
      case u.suggestion_quality when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end,
      u.best_match_score desc nulls last,u.canonical_name)
    from drx_dose.phase11_indication_unused_review_queue_v1 u
  ),'[]'::jsonb),
  'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'indicationId',q.indication_id,
      'indicationKey',q.indication_key,
      'canonicalName',q.canonical_name,
      'editorialStatus',q.editorial_status,
      'icdVerificationStatus',q.icd_verification_status,
      'candidateCount',q.candidate_count,
      'bestMatchScore',q.best_match_score,
      'suggestionQuality',q.suggestion_quality,
      'manualSearchRequired',q.manual_search_required,
      'candidates',q.candidates
    ) order by
      case q.suggestion_quality when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end,
      q.best_match_score desc nulls last,q.canonical_name)
    from drx_dose.indication_icd_review_queue_v2 q
  ),'[]'::jsonb),
  'autoPublishAllowed',false
);
$$;

revoke all on function public.drx_phase11_indication_review_packet_v2()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_indication_review_packet_v2()
  to service_role;
