
-- DRx Phase 11AR: ICD-10 candidate review staging for draft dose indications.
-- Suggestions are fuzzy-search candidates only; no ICD code is auto-assigned.

create table if not exists drx_dose.indication_icd_candidate_reviews_v1 (
  indication_id uuid not null
    references public.dose_indication_concepts_v3(indication_id) on delete cascade,
  candidate_rank integer not null check (candidate_rank between 1 and 10),
  icd_code text not null,
  icd_title_en text,
  icd_title_sq text,
  match_score numeric not null check (match_score >= 0 and match_score <= 1),
  match_basis text not null
    check (match_basis in ('TITLE_EN','TITLE_SQ','TAGS','COMPOSITE')),
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','RETIRED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (indication_id,candidate_rank),
  check (
    review_status<>'APPROVED'
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create or replace function public.drx_normalize_indication_search_v1(p_text text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p_text,'')),
          '\b(adult|adults|paediatric|pediatric|children|child|adolescent|adolescents|patients|patient|years|year|months|month|kg|mg|day|days|daily|treatment|prevention|prophylaxis|symptomatic|therapy|standard|shared dose family|source)\b',
          ' ',
          'gi'
        ),
        '(>=|<=|>|<|=|\b[0-9]+([.-][0-9]+)?\b)',
        ' ',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.drx_phase11_refresh_indication_icd_candidates_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,extensions
as $$
declare
  v_rows integer;
begin
  delete from drx_dose.indication_icd_candidate_reviews_v1 c
  using public.dose_indication_concepts_v3 i
  where i.indication_id=c.indication_id
    and i.editorial_status='draft'
    and c.review_status='PENDING';

  insert into drx_dose.indication_icd_candidate_reviews_v1(
    indication_id,candidate_rank,icd_code,icd_title_en,icd_title_sq,
    match_score,match_basis
  )
  with drafts as (
    select
      i.indication_id,
      i.canonical_name,
      public.drx_normalize_indication_search_v1(i.canonical_name) as search_text
    from public.dose_indication_concepts_v3 i
    where i.editorial_status='draft'
  ),
  ranked as (
    select
      d.indication_id,
      c.code,
      c.title_en,
      c.title_sq,
      greatest(
        extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_en)),
        extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_sq)),
        extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(array_to_string(c.tags,' ')))
      ) as score,
      case
        when extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_en))
          >= greatest(
            extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_sq)),
            extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(array_to_string(c.tags,' ')))
          ) then 'TITLE_EN'
        when extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_sq))
          >= extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(array_to_string(c.tags,' ')))
          then 'TITLE_SQ'
        else 'TAGS'
      end as basis,
      row_number() over (
        partition by d.indication_id
        order by greatest(
          extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_en)),
          extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(c.title_sq)),
          extensions.similarity(d.search_text,public.drx_normalize_indication_search_v1(array_to_string(c.tags,' ')))
        ) desc,
        c.code
      ) as rn
    from drafts d
    cross join public.icd_codes c
    where c.is_published
      and c.editorial_status='published'
      and d.search_text<>''
  )
  select
    indication_id,
    rn::integer,
    code,
    title_en,
    title_sq,
    round(score::numeric,4),
    basis
  from ranked
  where rn<=5
    and score>=0.15;

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'draftIndications',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='draft'),
    'candidateRows',(select count(*) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING'),
    'indicationsWithCandidates',(select count(distinct indication_id) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING'),
    'highScoreRows',(select count(*) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING' and match_score>=0.65),
    'autoApplyAllowed',false,
    'rowsRefreshed',v_rows
  );
end;
$$;

select public.drx_phase11_refresh_indication_icd_candidates_v1();

create or replace view drx_dose.indication_icd_review_queue_v1 as
select
  i.indication_id,
  i.indication_key,
  i.canonical_name,
  i.editorial_status,
  i.icd_verification_status,
  count(c.*) as candidate_count,
  max(c.match_score) as best_match_score,
  jsonb_agg(
    jsonb_build_object(
      'rank',c.candidate_rank,
      'code',c.icd_code,
      'titleEn',c.icd_title_en,
      'titleSq',c.icd_title_sq,
      'score',c.match_score,
      'basis',c.match_basis,
      'reviewStatus',c.review_status
    )
    order by c.candidate_rank
  ) filter (where c.indication_id is not null) as candidates,
  false::boolean as auto_apply_allowed
from public.dose_indication_concepts_v3 i
left join drx_dose.indication_icd_candidate_reviews_v1 c
  on c.indication_id=i.indication_id
 and c.review_status in ('PENDING','IN_REVIEW')
where i.editorial_status='draft'
group by i.indication_id,i.indication_key,i.canonical_name,i.editorial_status,i.icd_verification_status;

alter table drx_dose.indication_icd_candidate_reviews_v1 enable row level security;
revoke all on drx_dose.indication_icd_candidate_reviews_v1 from public,anon,authenticated;
revoke all on drx_dose.indication_icd_review_queue_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.indication_icd_candidate_reviews_v1 to service_role;
grant select on drx_dose.indication_icd_review_queue_v1 to service_role;

revoke all on function public.drx_phase11_refresh_indication_icd_candidates_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_indication_icd_candidates_v1() to service_role;
