-- DRx Phase 11CQ: evidence integrity pre-review.
-- Technical provenance/section checks only. This layer never marks clinical
-- evidence VERIFIED and never promotes or publishes a regimen.

create or replace view drx_dose.phase11_evidence_integrity_precheck_v1 as
select
  e.regimen_key,
  e.source_snapshot_id,
  e.source_section_code,
  e.source_section_sha256,
  e.source_url,
  e.evidence_role,
  e.review_status,
  e.reviewed_by,
  e.reviewed_at,
  e.review_note,
  r.source_snapshot_id as regimen_primary_snapshot_id,
  r.source_section_code as regimen_primary_section_code,
  r.source_section_sha256 as regimen_primary_section_sha256,
  s.source_key,
  s.source_tier,
  s.authority,
  s.jurisdiction,
  s.document_type,
  s.document_version,
  s.document_date,
  s.final_url,
  sec.heading,
  sec.extraction_status,
  length(sec.section_text) as section_text_length,
  (
    e.source_snapshot_id=r.source_snapshot_id
    and e.source_section_code=r.source_section_code
    and e.source_section_sha256=r.source_section_sha256
  ) as is_primary_regimen_evidence,
  array_remove(array[
    case when s.snapshot_id is null then 'SNAPSHOT_MISSING' end,
    case when sec.snapshot_id is null then 'EXACT_SECTION_MISSING' end,
    case when sec.snapshot_id is not null and sec.section_sha256<>e.source_section_sha256 then 'SECTION_HASH_MISMATCH' end,
    case when e.source_url !~ '^https://' then 'SOURCE_URL_NOT_HTTPS' end,
    case when s.snapshot_id is not null and e.source_url not in (s.source_url,s.final_url) then 'SOURCE_URL_SNAPSHOT_MISMATCH' end,
    case when sec.snapshot_id is not null and coalesce(length(sec.section_text),0)=0 then 'SECTION_TEXT_EMPTY' end,
    case when sec.snapshot_id is not null and lower(coalesce(sec.extraction_status,''))<>'extracted' then 'SECTION_NOT_EXTRACTED' end,
    case when s.snapshot_id is not null and s.document_version is null and s.document_date is null then 'SOURCE_VERSION_DATE_MISSING' end,
    case when e.auto_promote_allowed then 'AUTO_PROMOTE_MUST_BE_FALSE' end
  ],null) as integrity_blockers,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_promote_allowed_v2
from drx_dose.source_regimen_supporting_evidence_v1 e
join drx_dose.source_regimen_candidates_v1 r
  on r.regimen_key=e.regimen_key
left join public.dose_source_snapshots_v3 s
  on s.snapshot_id=e.source_snapshot_id
left join public.dose_source_sections_v3 sec
  on sec.snapshot_id=e.source_snapshot_id
 and sec.section_code=e.source_section_code
 and sec.section_sha256=e.source_section_sha256;

create or replace view drx_dose.phase11_evidence_integrity_summary_v1 as
select
  count(*) as evidence_rows,
  count(*) filter (where cardinality(integrity_blockers)=0) as integrity_ready,
  count(*) filter (where cardinality(integrity_blockers)>0) as integrity_blocked,
  count(*) filter (where is_primary_regimen_evidence) as primary_evidence_rows,
  count(*) filter (where not is_primary_regimen_evidence) as supporting_evidence_rows,
  count(*) filter (where review_status='VERIFIED') as human_verified,
  count(*) filter (where review_status not in ('VERIFIED','REJECTED')) as human_review_pending,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_promote_allowed
from drx_dose.phase11_evidence_integrity_precheck_v1;

revoke all on drx_dose.phase11_evidence_integrity_precheck_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_evidence_integrity_summary_v1
  from public,anon,authenticated;
grant select on drx_dose.phase11_evidence_integrity_precheck_v1 to service_role;
grant select on drx_dose.phase11_evidence_integrity_summary_v1 to service_role;
