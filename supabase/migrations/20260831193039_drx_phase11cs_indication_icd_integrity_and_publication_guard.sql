-- DRx Phase 11CS: indication/ICD integrity precheck + direct publication guard.
-- Clinical/ICD review remains human-only. This migration does not verify or
-- publish any indication and preserves the three legacy published-unverified rows.

create or replace function drx_dose.guard_indication_publication_integrity_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_missing text[];
  v_publication_change boolean;
begin
  if tg_op='INSERT' then
    v_publication_change := true;
  else
    v_publication_change :=
      old.editorial_status is distinct from new.editorial_status
      or old.icd_verification_status is distinct from new.icd_verification_status
      or old.icd10_codes is distinct from new.icd10_codes
      or old.reviewed_by is distinct from new.reviewed_by
      or old.reviewed_at is distinct from new.reviewed_at;
  end if;

  if new.icd_verification_status='verified'
     and cardinality(coalesce(new.icd10_codes,'{}'::text[]))=0 then
    raise exception 'Verified indication requires at least one ICD-10 code';
  end if;

  if new.icd_verification_status='verified' or new.editorial_status='published' then
    select array_agg(code order by code)
      into v_missing
    from unnest(coalesce(new.icd10_codes,'{}'::text[])) code
    where nullif(btrim(code),'') is null
       or not exists (
         select 1
         from public.icd_codes c
         where upper(c.code)=upper(btrim(code))
           and c.is_published
           and c.editorial_status='published'
       );

    if cardinality(coalesce(v_missing,'{}'::text[]))>0 then
      raise exception 'Unknown/unpublished ICD-10 code(s): %',
        array_to_string(v_missing,',');
    end if;
  end if;

  if new.editorial_status='published'
     and v_publication_change
     and (
       new.icd_verification_status<>'verified'
       or cardinality(coalesce(new.icd10_codes,'{}'::text[]))=0
       or nullif(btrim(new.reviewed_by),'') is null
       or new.reviewed_at is null
     )
  then
    raise exception 'Published indication requires verified ICD codes and named review provenance';
  end if;

  return new;
end;
$$;

drop trigger if exists dose_indication_concepts_v3_publication_integrity_guard
  on public.dose_indication_concepts_v3;
create trigger dose_indication_concepts_v3_publication_integrity_guard
before insert or update on public.dose_indication_concepts_v3
for each row execute function drx_dose.guard_indication_publication_integrity_v1();

revoke all on function drx_dose.guard_indication_publication_integrity_v1()
  from public,anon,authenticated;

create or replace view drx_dose.phase11_indication_icd_integrity_precheck_v1
with (security_invoker=true)
as
with candidate_stats as (
  select
    r.indication_id,
    count(*) as candidate_rows,
    count(*) filter (where r.candidate_rank<1 or r.candidate_rank>10) as bad_rank_rows,
    count(*) filter (where r.match_score<0 or r.match_score>1) as bad_score_rows,
    count(*) filter (where r.auto_apply_allowed) as auto_apply_rows,
    count(*) filter (where c.code is null or not coalesce(c.is_published,false) or c.editorial_status<>'published') as invalid_registry_rows,
    count(*) filter (where coalesce(r.icd_title_en,'')<>coalesce(c.title_en,'')) as title_en_drift_rows,
    count(*) filter (where coalesce(r.icd_title_sq,'')<>coalesce(c.title_sq,'')) as title_sq_drift_rows
  from drx_dose.indication_icd_candidate_reviews_v1 r
  left join public.icd_codes c on c.code=r.icd_code
  group by r.indication_id
),
duplicate_stats as (
  select
    x.indication_id,
    count(*) filter (where x.kind='RANK') as duplicate_rank_groups,
    count(*) filter (where x.kind='CODE') as duplicate_code_groups
  from (
    select indication_id,'RANK'::text as kind
    from drx_dose.indication_icd_candidate_reviews_v1
    group by indication_id,candidate_rank having count(*)>1
    union all
    select indication_id,'CODE'
    from drx_dose.indication_icd_candidate_reviews_v1
    group by indication_id,icd_code having count(*)>1
  ) x
  group by x.indication_id
),
regimen_stats as (
  select indication_id,count(*) as regimen_rows
  from drx_dose.source_regimen_candidates_v1
  where indication_id is not null
  group by indication_id
),
link_stats as (
  select indication_id,
         count(*) as link_rows,
         count(*) filter (where link_status<>'VERIFIED') as pending_link_rows,
         count(*) filter (where auto_publish_allowed) as auto_publish_rows
  from drx_dose.source_regimen_indication_links_v1
  where indication_id is not null
  group by indication_id
)
select
  i.indication_id,i.indication_key,i.canonical_name,
  i.icd10_codes,i.icd_verification_status,i.editorial_status,
  i.reviewed_by,i.reviewed_at,i.review_note,
  coalesce(rs.regimen_rows,0) as regimen_rows,
  coalesce(cs.candidate_rows,0) as candidate_rows,
  q.best_match_score,q.suggestion_quality,q.manual_search_required,
  coalesce(ls.link_rows,0) as link_rows,
  coalesce(ls.pending_link_rows,0) as pending_link_rows,
  array_remove(array[
    case when i.editorial_status='published' and i.icd_verification_status<>'verified'
      then 'PUBLISHED_UNVERIFIED' end,
    case when i.editorial_status='published' and cardinality(i.icd10_codes)=0
      then 'PUBLISHED_WITHOUT_ICD_CODE' end,
    case when i.icd_verification_status='verified' and cardinality(i.icd10_codes)=0
      then 'VERIFIED_WITHOUT_ICD_CODE' end,
    case when i.editorial_status in ('verified','published')
              and (nullif(btrim(i.reviewed_by),'') is null or i.reviewed_at is null)
      then 'REVIEW_PROVENANCE_MISSING' end,
    case when exists (
      select 1 from unnest(i.icd10_codes) code
      where not exists (
        select 1 from public.icd_codes c
        where upper(c.code)=upper(btrim(code))
          and c.is_published and c.editorial_status='published'
      )
    ) then 'ASSIGNED_ICD_CODE_INVALID' end,
    case when i.editorial_status='draft' and q.indication_id is null
      then 'DRAFT_REVIEW_QUEUE_MISSING' end,
    case when q.indication_id is not null and q.candidate_count<>coalesce(cs.candidate_rows,0)
      then 'QUEUE_CANDIDATE_COUNT_DRIFT' end,
    case when coalesce(cs.bad_rank_rows,0)>0 then 'CANDIDATE_RANK_INVALID' end,
    case when coalesce(cs.bad_score_rows,0)>0 then 'CANDIDATE_SCORE_INVALID' end,
    case when coalesce(cs.invalid_registry_rows,0)>0 then 'CANDIDATE_ICD_REGISTRY_INVALID' end,
    case when coalesce(cs.title_en_drift_rows,0)>0 or coalesce(cs.title_sq_drift_rows,0)>0
      then 'CANDIDATE_TITLE_DRIFT' end,
    case when coalesce(ds.duplicate_rank_groups,0)>0 then 'DUPLICATE_CANDIDATE_RANK' end,
    case when coalesce(ds.duplicate_code_groups,0)>0 then 'DUPLICATE_CANDIDATE_CODE' end,
    case when coalesce(cs.auto_apply_rows,0)>0 then 'AUTO_APPLY_MUST_BE_FALSE' end,
    case when coalesce(ls.auto_publish_rows,0)>0 then 'LINK_AUTO_PUBLISH_MUST_BE_FALSE' end,
    case when coalesce(rs.regimen_rows,0)>0
              and i.editorial_status='published'
              and i.icd_verification_status<>'verified'
      then 'REGIMEN_USES_PUBLISHED_UNVERIFIED' end
  ],null) as integrity_blockers,
  array_remove(array[
    case when i.icd_verification_status<>'verified' then 'ICD_HUMAN_VERIFICATION_REQUIRED' end,
    case when i.editorial_status<>'published' then 'INDICATION_EDITORIAL_REVIEW_REQUIRED' end,
    case when coalesce(q.manual_search_required,false) then 'MANUAL_ICD_SEARCH_REQUIRED' end,
    case when coalesce(ls.pending_link_rows,0)>0 then 'REGIMEN_INDICATION_LINK_REVIEW_REQUIRED' end
  ],null) as review_blockers,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from public.dose_indication_concepts_v3 i
left join candidate_stats cs on cs.indication_id=i.indication_id
left join duplicate_stats ds on ds.indication_id=i.indication_id
left join regimen_stats rs on rs.indication_id=i.indication_id
left join link_stats ls on ls.indication_id=i.indication_id
left join drx_dose.indication_icd_review_queue_v2 q on q.indication_id=i.indication_id;

create or replace view drx_dose.phase11_indication_icd_integrity_summary_v1
with (security_invoker=true)
as
select
  count(*) as indication_concepts,
  count(*) filter (where cardinality(integrity_blockers)=0) as integrity_ready,
  count(*) filter (where cardinality(integrity_blockers)>0) as integrity_blocked,
  count(*) filter (where editorial_status='published' and icd_verification_status<>'verified') as published_unverified,
  coalesce(sum(regimen_rows) filter (where editorial_status='published' and icd_verification_status<>'verified'),0) as regimen_rows_using_published_unverified,
  count(*) filter (where cardinality(review_blockers)>0) as human_review_pending,
  count(*) filter (where manual_search_required) as manual_icd_search_required,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_indication_icd_integrity_precheck_v1;

revoke all on drx_dose.phase11_indication_icd_integrity_precheck_v1
  from public,anon,authenticated;
revoke all on drx_dose.phase11_indication_icd_integrity_summary_v1
  from public,anon,authenticated;
grant select on drx_dose.phase11_indication_icd_integrity_precheck_v1 to service_role;
grant select on drx_dose.phase11_indication_icd_integrity_summary_v1 to service_role;
