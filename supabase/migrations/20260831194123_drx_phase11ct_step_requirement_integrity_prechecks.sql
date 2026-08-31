-- DRx Phase 11CT: presentation + administration technical integrity prechecks.
-- These views validate source linkage, section hashes and structural completeness.
-- They never mark a presentation/administration row VERIFIED and never enable
-- automatic product binding or administration application.

create or replace view drx_dose.phase11_presentation_integrity_precheck_v1
with (security_invoker=true)
as
select
  p.regimen_key,p.branch_no,p.step_no,
  p.required_strength_value,p.required_strength_unit,
  p.required_form_family,p.required_route_key,p.required_release_key,
  p.presentation_policy,p.source_product_label,
  p.source_snapshot_id,p.source_section_sha256,
  p.review_status,p.reviewed_by,p.reviewed_at,p.review_note,
  r.source_snapshot_id as regimen_primary_snapshot_id,
  s.authority,s.source_tier,s.document_version,s.document_date,
  sec.section_code,sec.extraction_status,length(sec.section_text) as section_text_length,
  case
    when p.source_snapshot_id=r.source_snapshot_id then 'PRIMARY'
    when exists (
      select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=p.regimen_key and e.source_snapshot_id=p.source_snapshot_id and e.evidence_role='SUPPORTING'
    ) then 'SUPPORTING'
    else 'UNLINKED'
  end as source_link_kind,
  array_remove(array[
    case when st.regimen_key is null then 'REGIMEN_STEP_MISSING' end,
    case when r.regimen_key is null then 'REGIMEN_MISSING' end,
    case when s.snapshot_id is null then 'SNAPSHOT_MISSING' end,
    case when sec.snapshot_id is null then 'EXACT_SECTION_HASH_MISSING' end,
    case when sec.snapshot_id is not null and sec.section_code<>'4.2' then 'SOURCE_SECTION_NOT_4_2' end,
    case when sec.snapshot_id is not null and lower(coalesce(sec.extraction_status,''))<>'extracted' then 'SOURCE_SECTION_NOT_EXTRACTED' end,
    case when sec.snapshot_id is not null and coalesce(length(sec.section_text),0)=0 then 'SOURCE_SECTION_EMPTY' end,
    case when s.snapshot_id is not null and s.document_version is null and s.document_date is null then 'SOURCE_VERSION_DATE_MISSING' end,
    case when p.source_snapshot_id is distinct from r.source_snapshot_id
          and not exists (
            select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
            where e.regimen_key=p.regimen_key and e.source_snapshot_id=p.source_snapshot_id and e.evidence_role='SUPPORTING'
          )
      then 'SOURCE_NOT_PRIMARY_OR_SUPPORTING' end,
    case when p.auto_bind_allowed then 'AUTO_BIND_MUST_BE_FALSE' end,
    case when p.presentation_policy in ('EXACT_STRENGTH','COMPATIBLE_STRENGTH_REVIEW')
          and (p.required_strength_value is null or nullif(btrim(p.required_strength_unit),'') is null)
      then 'REQUIRED_STRENGTH_INCOMPLETE' end,
    case when nullif(btrim(p.required_form_family),'') is null
          or nullif(btrim(p.required_route_key),'') is null
          or nullif(btrim(p.source_product_label),'') is null
      then 'PRESENTATION_FIELDS_INCOMPLETE' end
  ],null) as integrity_blockers,
  array_remove(array[
    case when p.review_status<>'VERIFIED' then 'PRESENTATION_HUMAN_REVIEW_REQUIRED' end
  ],null) as review_blockers,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_bind_allowed_v2
from drx_dose.source_regimen_step_presentation_requirements_v1 p
left join drx_dose.source_regimen_steps_v1 st
  on st.regimen_key=p.regimen_key and st.branch_no=p.branch_no and st.step_no=p.step_no
left join drx_dose.source_regimen_candidates_v1 r on r.regimen_key=p.regimen_key
left join public.dose_source_snapshots_v3 s on s.snapshot_id=p.source_snapshot_id
left join lateral (
  select x.snapshot_id,x.section_code,x.extraction_status,x.section_text
  from public.dose_source_sections_v3 x
  where x.snapshot_id=p.source_snapshot_id and x.section_sha256=p.source_section_sha256
  order by x.section_code limit 1
) sec on true;

create or replace view drx_dose.phase11_administration_integrity_precheck_v1
with (security_invoker=true)
as
select
  a.regimen_key,a.branch_no,a.step_no,
  a.food_requirement,a.timing_requirement,a.administration_note,
  a.source_snapshot_id,a.source_section_sha256,
  a.review_status,a.reviewed_by,a.reviewed_at,a.review_note,
  r.source_snapshot_id as regimen_primary_snapshot_id,
  s.authority,s.source_tier,s.document_version,s.document_date,
  sec.section_code,sec.extraction_status,length(sec.section_text) as section_text_length,
  case
    when a.source_snapshot_id=r.source_snapshot_id then 'PRIMARY'
    when exists (
      select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
      where e.regimen_key=a.regimen_key and e.source_snapshot_id=a.source_snapshot_id and e.evidence_role='SUPPORTING'
    ) then 'SUPPORTING'
    else 'UNLINKED'
  end as source_link_kind,
  array_remove(array[
    case when st.regimen_key is null then 'REGIMEN_STEP_MISSING' end,
    case when r.regimen_key is null then 'REGIMEN_MISSING' end,
    case when s.snapshot_id is null then 'SNAPSHOT_MISSING' end,
    case when sec.snapshot_id is null then 'EXACT_SECTION_HASH_MISSING' end,
    case when sec.snapshot_id is not null and sec.section_code<>'4.2' then 'SOURCE_SECTION_NOT_4_2' end,
    case when sec.snapshot_id is not null and lower(coalesce(sec.extraction_status,''))<>'extracted' then 'SOURCE_SECTION_NOT_EXTRACTED' end,
    case when sec.snapshot_id is not null and coalesce(length(sec.section_text),0)=0 then 'SOURCE_SECTION_EMPTY' end,
    case when s.snapshot_id is not null and s.document_version is null and s.document_date is null then 'SOURCE_VERSION_DATE_MISSING' end,
    case when a.source_snapshot_id is distinct from r.source_snapshot_id
          and not exists (
            select 1 from drx_dose.source_regimen_supporting_evidence_v1 e
            where e.regimen_key=a.regimen_key and e.source_snapshot_id=a.source_snapshot_id and e.evidence_role='SUPPORTING'
          )
      then 'SOURCE_NOT_PRIMARY_OR_SUPPORTING' end,
    case when a.auto_apply_allowed then 'AUTO_APPLY_MUST_BE_FALSE' end,
    case when nullif(btrim(a.administration_note),'') is null then 'ADMINISTRATION_NOTE_MISSING' end
  ],null) as integrity_blockers,
  array_remove(array[
    case when a.review_status<>'VERIFIED' then 'ADMINISTRATION_HUMAN_REVIEW_REQUIRED' end
  ],null) as review_blockers,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_apply_allowed_v2
from drx_dose.source_regimen_step_administration_v1 a
left join drx_dose.source_regimen_steps_v1 st
  on st.regimen_key=a.regimen_key and st.branch_no=a.branch_no and st.step_no=a.step_no
left join drx_dose.source_regimen_candidates_v1 r on r.regimen_key=a.regimen_key
left join public.dose_source_snapshots_v3 s on s.snapshot_id=a.source_snapshot_id
left join lateral (
  select x.snapshot_id,x.section_code,x.extraction_status,x.section_text
  from public.dose_source_sections_v3 x
  where x.snapshot_id=a.source_snapshot_id and x.section_sha256=a.source_section_sha256
  order by x.section_code limit 1
) sec on true;

create or replace view drx_dose.phase11_step_requirement_integrity_summary_v1
with (security_invoker=true)
as
select
  (select count(*) from drx_dose.phase11_presentation_integrity_precheck_v1) as presentation_rows,
  (select count(*) from drx_dose.phase11_presentation_integrity_precheck_v1 where cardinality(integrity_blockers)=0) as presentation_integrity_ready,
  (select count(*) from drx_dose.phase11_presentation_integrity_precheck_v1 where cardinality(integrity_blockers)>0) as presentation_integrity_blocked,
  (select count(*) from drx_dose.phase11_presentation_integrity_precheck_v1 where cardinality(review_blockers)>0) as presentation_human_review_pending,
  (select count(*) from drx_dose.phase11_administration_integrity_precheck_v1) as administration_rows,
  (select count(*) from drx_dose.phase11_administration_integrity_precheck_v1 where cardinality(integrity_blockers)=0) as administration_integrity_ready,
  (select count(*) from drx_dose.phase11_administration_integrity_precheck_v1 where cardinality(integrity_blockers)>0) as administration_integrity_blocked,
  (select count(*) from drx_dose.phase11_administration_integrity_precheck_v1 where cardinality(review_blockers)>0) as administration_human_review_pending,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_bind_or_apply_allowed;

revoke all on drx_dose.phase11_presentation_integrity_precheck_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_administration_integrity_precheck_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_step_requirement_integrity_summary_v1 from public,anon,authenticated;
grant select on drx_dose.phase11_presentation_integrity_precheck_v1 to service_role;
grant select on drx_dose.phase11_administration_integrity_precheck_v1 to service_role;
grant select on drx_dose.phase11_step_requirement_integrity_summary_v1 to service_role;
