
-- DRx Phase 11AA: stage-identity -> public-identity link proposals.
-- Converts "stage-only" blockers into a deterministic review queue when an exact
-- PUBLIC term match exists. This does not write public_concept_id automatically.

create table if not exists drx_dose.stage_public_identity_link_proposals_v1 (
  stage_concept_id uuid primary key
    references drx_identity.canonical_concepts_v1(concept_id) on delete cascade,
  stage_name text not null,
  stage_normalized_name text not null,
  candidate_public_concept_ids uuid[] not null default '{}'::uuid[],
  candidate_public_names text[] not null default '{}'::text[],
  exact_match_count integer not null default 0 check (exact_match_count >= 0),
  match_method text not null
    check (match_method in ('EXACT_TERM_KEY','EXACT_CANONICAL_KEY','NO_EXACT_PUBLIC_MATCH','AMBIGUOUS_EXACT_MATCH')),
  blocker_codes text[] not null default '{}'::text[],
  review_ready boolean not null default false,
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','APPLIED','RETIRED')),
  approved_public_concept_id uuid
    references public.substance_concepts_v1(concept_id) on delete restrict,
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    review_status not in ('APPROVED','APPLIED')
    or (
      approved_public_concept_id is not null
      and nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
    )
  ),
  check (
    review_ready=false
    or (exact_match_count=1 and cardinality(blocker_codes)=0)
  )
);

create or replace function public.drx_phase11_refresh_stage_public_link_proposals_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_identity
as $$
declare
  v_rows integer;
begin
  insert into drx_dose.stage_public_identity_link_proposals_v1(
    stage_concept_id,stage_name,stage_normalized_name,
    candidate_public_concept_ids,candidate_public_names,exact_match_count,
    match_method,blocker_codes,review_ready,review_status,updated_at
  )
  with needed as (
    select distinct c.identity_concept_id
    from drx_dose.identity_repair_proposal_components_v1 c
    where c.resolution_source='STAGE_ONLY_IDENTITY'
      and c.identity_concept_id is not null
  ),
  stage as (
    select cc.concept_id,cc.canonical_name,cc.normalized_name
    from needed n
    join drx_identity.canonical_concepts_v1 cc on cc.concept_id=n.identity_concept_id
    where cc.source_namespace='STAGE'
      and cc.public_concept_id is null
  ),
  matches as (
    select
      s.concept_id,s.canonical_name,s.normalized_name,
      t.concept_id as public_concept_id,
      pc.canonical_name as public_name,
      'EXACT_TERM_KEY'::text as match_method
    from stage s
    join public.substance_terms_v1 t on t.term_key=s.normalized_name
    join public.substance_concepts_v1 pc on pc.concept_id=t.concept_id

    union

    select
      s.concept_id,s.canonical_name,s.normalized_name,
      pc.concept_id,pc.canonical_name,
      'EXACT_CANONICAL_KEY'
    from stage s
    join public.substance_concepts_v1 pc on pc.canonical_key=s.normalized_name
  ),
  grouped as (
    select
      s.concept_id,s.canonical_name,s.normalized_name,
      coalesce(
        array_agg(distinct m.public_concept_id order by m.public_concept_id)
          filter (where m.public_concept_id is not null),
        '{}'::uuid[]
      ) as ids,
      coalesce(
        array_agg(distinct m.public_name order by m.public_name)
          filter (where m.public_name is not null),
        '{}'::text[]
      ) as names,
      count(distinct m.public_concept_id)::integer as match_count,
      bool_or(m.match_method='EXACT_CANONICAL_KEY') as has_canonical_key_match,
      bool_or(m.match_method='EXACT_TERM_KEY') as has_term_match
    from stage s
    left join matches m on m.concept_id=s.concept_id
    group by s.concept_id,s.canonical_name,s.normalized_name
  )
  select
    g.concept_id,g.canonical_name,g.normalized_name,g.ids,g.names,g.match_count,
    case
      when g.match_count=0 then 'NO_EXACT_PUBLIC_MATCH'
      when g.match_count>1 then 'AMBIGUOUS_EXACT_MATCH'
      when g.has_canonical_key_match then 'EXACT_CANONICAL_KEY'
      else 'EXACT_TERM_KEY'
    end,
    array_remove(array[
      case when g.match_count=0 then 'NO_EXACT_PUBLIC_MATCH' end,
      case when g.match_count>1 then 'AMBIGUOUS_PUBLIC_MATCH' end
    ],null),
    g.match_count=1,
    'PENDING',
    now()
  from grouped g
  on conflict (stage_concept_id) do update set
    stage_name=excluded.stage_name,
    stage_normalized_name=excluded.stage_normalized_name,
    candidate_public_concept_ids=excluded.candidate_public_concept_ids,
    candidate_public_names=excluded.candidate_public_names,
    exact_match_count=excluded.exact_match_count,
    match_method=excluded.match_method,
    blocker_codes=excluded.blocker_codes,
    review_ready=excluded.review_ready,
    updated_at=now()
  where drx_dose.stage_public_identity_link_proposals_v1.review_status='PENDING';

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'proposalRows',(select count(*) from drx_dose.stage_public_identity_link_proposals_v1),
    'reviewReadyRows',(select count(*) from drx_dose.stage_public_identity_link_proposals_v1 where review_status='PENDING' and review_ready),
    'blockedRows',(select count(*) from drx_dose.stage_public_identity_link_proposals_v1 where review_status='PENDING' and not review_ready),
    'refreshedRows',v_rows,
    'autoApplyAllowed',false
  );
end;
$$;

select public.drx_phase11_refresh_stage_public_link_proposals_v1();

create or replace view drx_dose.stage_public_identity_link_review_queue_v1 as
select
  p.stage_concept_id,p.stage_name,p.stage_normalized_name,
  p.candidate_public_concept_ids,p.candidate_public_names,p.exact_match_count,
  p.match_method,p.blocker_codes,p.review_ready,p.review_status,p.auto_apply_allowed,
  count(distinct c.proposal_id) as affected_identity_repair_proposals,
  array_agg(distinct rp.registry_number order by rp.registry_number)
    filter (where rp.registry_number is not null) as affected_registry_numbers
from drx_dose.stage_public_identity_link_proposals_v1 p
left join drx_dose.identity_repair_proposal_components_v1 c
  on c.identity_concept_id=p.stage_concept_id
left join drx_dose.identity_repair_proposals_v1 rp
  on rp.proposal_id=c.proposal_id
where p.review_status in ('PENDING','IN_REVIEW')
group by
  p.stage_concept_id,p.stage_name,p.stage_normalized_name,
  p.candidate_public_concept_ids,p.candidate_public_names,p.exact_match_count,
  p.match_method,p.blocker_codes,p.review_ready,p.review_status,p.auto_apply_allowed;

create or replace view drx_dose.stage_public_identity_link_summary_v1 as
select
  count(*) as proposal_rows,
  count(*) filter (where review_ready and review_status='PENDING') as review_ready_rows,
  count(*) filter (where not review_ready and review_status='PENDING') as blocked_rows,
  count(*) filter (where match_method='EXACT_TERM_KEY') as exact_term_rows,
  count(*) filter (where match_method='EXACT_CANONICAL_KEY') as exact_canonical_rows,
  count(*) filter (where match_method='NO_EXACT_PUBLIC_MATCH') as no_exact_match_rows,
  count(*) filter (where match_method='AMBIGUOUS_EXACT_MATCH') as ambiguous_rows,
  false::boolean as auto_apply_allowed
from drx_dose.stage_public_identity_link_proposals_v1;

alter table drx_dose.stage_public_identity_link_proposals_v1 enable row level security;
revoke all on drx_dose.stage_public_identity_link_proposals_v1 from public,anon,authenticated;
revoke all on drx_dose.stage_public_identity_link_review_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.stage_public_identity_link_summary_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.stage_public_identity_link_proposals_v1 to service_role;
grant select on drx_dose.stage_public_identity_link_review_queue_v1 to service_role;
grant select on drx_dose.stage_public_identity_link_summary_v1 to service_role;

revoke all on function public.drx_phase11_refresh_stage_public_link_proposals_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_refresh_stage_public_link_proposals_v1() to service_role;
