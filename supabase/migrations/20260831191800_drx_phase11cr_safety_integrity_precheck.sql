-- DRx Phase 11CR: safety applicability integrity pre-review.
-- Technical source/scope checks only. This layer never approves a clinical
-- safety candidate and never enables automatic application.

create or replace view drx_dose.phase11_safety_integrity_precheck_v1 as
with candidates as (
  select
    'ADJUSTMENT'::text as candidate_type,
    adjustment_key as candidate_key,
    regimen_key as directly_scoped_regimen_key,
    adjustment_domain as domain_or_type,
    source_snapshot_id,source_section_code,source_section_sha256,source_url,
    review_status,reviewed_by,reviewed_at,review_note,auto_apply_allowed,
    target_kind,dose_moiety_key,dose_moiety_concept_ids
  from drx_dose.source_adjustment_candidates_v1
  union all
  select
    'RESTRICTION',restriction_key,null::text,restriction_type,
    source_snapshot_id,source_section_code,source_section_sha256,source_url,
    review_status,reviewed_by,reviewed_at,review_note,auto_apply_allowed,
    target_kind,dose_moiety_key,dose_moiety_concept_ids
  from drx_dose.source_restriction_candidates_v1
)
select
  a.regimen_key,a.candidate_type,a.candidate_key,a.review_status,
  a.target_kind,a.substance_concept_id,a.dose_moiety_key,a.directly_scoped_regimen_key,
  a.domain_or_type,a.clinical_text,a.source_snapshot_id,a.applicability_scope,
  c.source_section_code,c.source_section_sha256,c.source_url,
  c.review_status as candidate_review_status,c.reviewed_by,c.reviewed_at,c.review_note,
  c.auto_apply_allowed,c.target_kind as candidate_target_kind,
  c.dose_moiety_key as candidate_dose_moiety_key,
  c.directly_scoped_regimen_key as candidate_direct_regimen_key,
  c.domain_or_type as candidate_domain_or_type,
  r.source_snapshot_id as regimen_source_snapshot_id,
  r.target_kind as regimen_target_kind,r.dose_moiety_key as regimen_dose_moiety_key,
  s.source_key,s.source_tier,s.authority,s.document_version,s.document_date,s.final_url,
  sec.extraction_status,length(sec.section_text) as section_text_length,
  array_remove(array[
    case when c.candidate_key is null then 'CANDIDATE_MISSING' end,
    case when s.snapshot_id is null then 'SNAPSHOT_MISSING' end,
    case when c.candidate_key is not null and a.source_snapshot_id<>c.source_snapshot_id then 'APPLICABILITY_SNAPSHOT_DRIFT' end,
    case when sec.snapshot_id is null then 'EXACT_SECTION_MISSING' end,
    case when sec.snapshot_id is not null and sec.section_sha256<>c.source_section_sha256 then 'SECTION_HASH_MISMATCH' end,
    case when c.source_url !~ '^https://' then 'SOURCE_URL_NOT_HTTPS' end,
    case when s.snapshot_id is not null and c.source_url not in (s.source_url,s.final_url) then 'SOURCE_URL_SNAPSHOT_MISMATCH' end,
    case when sec.snapshot_id is not null and coalesce(length(sec.section_text),0)=0 then 'SECTION_TEXT_EMPTY' end,
    case when sec.snapshot_id is not null and lower(coalesce(sec.extraction_status,''))<>'extracted' then 'SECTION_NOT_EXTRACTED' end,
    case when s.snapshot_id is not null and s.document_version is null and s.document_date is null then 'SOURCE_VERSION_DATE_MISSING' end,
    case when coalesce(c.auto_apply_allowed,false) then 'AUTO_APPLY_MUST_BE_FALSE' end,
    case when c.candidate_key is not null and a.review_status<>c.review_status then 'REVIEW_STATUS_DRIFT' end,
    case when c.candidate_key is not null and a.domain_or_type<>c.domain_or_type then 'DOMAIN_TYPE_DRIFT' end,
    case when c.candidate_key is not null and a.target_kind<>c.target_kind then 'TARGET_KIND_DRIFT' end,
    case when c.candidate_key is not null and a.dose_moiety_key is distinct from c.dose_moiety_key then 'APPLICABLE_MOIETY_DRIFT' end,
    case when c.candidate_key is not null and c.dose_moiety_key is distinct from r.dose_moiety_key then 'REGIMEN_MOIETY_DRIFT' end,
    case when a.applicability_scope='DIRECT_REGIMEN' and c.directly_scoped_regimen_key is distinct from a.regimen_key then 'DIRECT_REGIMEN_SCOPE_DRIFT' end,
    case when a.applicability_scope='SAME_SOURCE_MOIETY' and a.source_snapshot_id is distinct from r.source_snapshot_id then 'SAME_SOURCE_SCOPE_DRIFT' end
  ],null) as integrity_blockers,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_apply_allowed_v2
from drx_dose.source_regimen_applicable_safety_v2 a
left join candidates c
  on c.candidate_type=a.candidate_type and c.candidate_key=a.candidate_key
join drx_dose.source_regimen_candidates_v1 r
  on r.regimen_key=a.regimen_key
left join public.dose_source_snapshots_v3 s
  on s.snapshot_id=a.source_snapshot_id
left join public.dose_source_sections_v3 sec
  on sec.snapshot_id=a.source_snapshot_id
 and sec.section_code=c.source_section_code
 and sec.section_sha256=c.source_section_sha256;

create or replace view drx_dose.phase11_safety_integrity_summary_v1 as
select
  count(*) as applicability_rows,
  count(distinct candidate_type||'|'||candidate_key) as distinct_safety_candidates,
  count(*) filter (where cardinality(integrity_blockers)=0) as integrity_ready_rows,
  count(*) filter (where cardinality(integrity_blockers)>0) as integrity_blocked_rows,
  count(distinct candidate_type||'|'||candidate_key)
    filter (where review_status in ('APPROVED','PROMOTED')) as human_approved_candidates,
  count(distinct candidate_type||'|'||candidate_key)
    filter (where review_status not in ('APPROVED','PROMOTED','REJECTED')) as human_review_pending_candidates,
  false::boolean as auto_approve_allowed,
  false::boolean as auto_apply_allowed
from drx_dose.phase11_safety_integrity_precheck_v1;

revoke all on drx_dose.phase11_safety_integrity_precheck_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_safety_integrity_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_safety_integrity_precheck_v1 to service_role;
grant select on drx_dose.phase11_safety_integrity_summary_v1 to service_role;
