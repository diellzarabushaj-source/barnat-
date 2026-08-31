
-- DRx Phase 11V: generalize source-first regimens to substance OR ingredient-set
-- targets and expose the fill-once target/context queues.
-- Goal: clinical rules are authored per active-moiety target/context, not per brand.

alter table drx_dose.source_regimen_candidates_v1
  alter column substance_concept_id drop not null;

alter table drx_dose.source_regimen_candidates_v1
  add column if not exists target_kind text not null default 'SUBSTANCE'
    check (target_kind in ('SUBSTANCE','INGREDIENT_SET')),
  add column if not exists dose_moiety_concept_ids uuid[] not null default '{}'::uuid[],
  add column if not exists dose_moiety_key text;

update drx_dose.source_regimen_candidates_v1
set
  target_kind='SUBSTANCE',
  dose_moiety_concept_ids=drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id]),
  dose_moiety_key=md5(array_to_string(
    drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id])::text[],'|'
  ))
where substance_concept_id is not null
  and (cardinality(dose_moiety_concept_ids)=0 or dose_moiety_key is null);

alter table drx_dose.source_regimen_candidates_v1
  drop constraint if exists source_regimen_candidates_v1_target_identity_check;

alter table drx_dose.source_regimen_candidates_v1
  add constraint source_regimen_candidates_v1_target_identity_check
  check (
    (target_kind='SUBSTANCE'
      and substance_concept_id is not null
      and cardinality(dose_moiety_concept_ids)=1
      and dose_moiety_key is not null)
    or
    (target_kind='INGREDIENT_SET'
      and substance_concept_id is null
      and cardinality(dose_moiety_concept_ids)>1
      and dose_moiety_key is not null)
  );

create or replace function drx_dose.set_source_regimen_target_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_ids uuid[];
begin
  if new.target_kind='SUBSTANCE' then
    if new.substance_concept_id is null then
      raise exception 'SOURCE_REGIMEN_SUBSTANCE_ID_REQUIRED';
    end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(array[new.substance_concept_id]);
  else
    if new.substance_concept_id is not null then
      raise exception 'SOURCE_REGIMEN_COMBINATION_SUBSTANCE_ID_MUST_BE_NULL';
    end if;
    if cardinality(new.dose_moiety_concept_ids)<=1 then
      raise exception 'SOURCE_REGIMEN_COMBINATION_COMPONENTS_REQUIRED';
    end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(new.dose_moiety_concept_ids);
  end if;

  new.dose_moiety_concept_ids := coalesce(v_ids,'{}'::uuid[]);
  new.dose_moiety_key := case
    when cardinality(new.dose_moiety_concept_ids)>0
      then md5(array_to_string(new.dose_moiety_concept_ids::text[],'|'))
    else null
  end;
  return new;
end;
$$;

drop trigger if exists source_regimen_target_fill on drx_dose.source_regimen_candidates_v1;
create trigger source_regimen_target_fill
before insert or update of target_kind,substance_concept_id,dose_moiety_concept_ids
on drx_dose.source_regimen_candidates_v1
for each row execute function drx_dose.set_source_regimen_target_v1();

create table if not exists drx_dose.source_regimen_step_components_v1 (
  regimen_key text not null,
  branch_no integer not null,
  step_no integer not null,
  component_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  component_role text not null default 'ACTIVE'
    check (component_role in ('ACTIVE','DOSE_BASIS','MAX_LIMIT','INFORMATIONAL')),
  dose_min_value numeric,
  dose_max_value numeric,
  dose_unit text,
  dose_basis text,
  max_daily_value numeric,
  max_daily_unit text,
  note text,
  created_at timestamptz not null default now(),
  primary key (regimen_key,branch_no,step_no,component_concept_id),
  foreign key (regimen_key,branch_no,step_no)
    references drx_dose.source_regimen_steps_v1(regimen_key,branch_no,step_no)
    on delete cascade,
  check (dose_min_value is null or dose_max_value is null or dose_min_value <= dose_max_value)
);

create index if not exists source_regimen_candidates_v1_moiety_idx
  on drx_dose.source_regimen_candidates_v1(dose_moiety_key,review_status);

create or replace view drx_dose.dose_target_catalog_v1 as
with g as (
  select
    p.dose_moiety_key,
    p.dose_moiety_concept_ids,
    count(*) as product_count,
    count(distinct p.ingredient_set_id) as raw_ingredient_set_count,
    count(*) filter (where p.strict_autoinherit_ready) as strict_ready_product_count,
    array_agg(distinct p.registry_number order by p.registry_number) as registry_numbers
  from drx_dose.product_dose_moiety_targets_v1 p
  where p.dose_moiety_key is not null
  group by p.dose_moiety_key,p.dose_moiety_concept_ids
)
select
  g.dose_moiety_key,
  g.dose_moiety_concept_ids,
  array(
    select s.canonical_name
    from unnest(g.dose_moiety_concept_ids) u(concept_id)
    join public.substance_concepts_v1 s on s.concept_id=u.concept_id
    order by s.canonical_name
  ) as dose_moiety_names,
  g.product_count,
  g.raw_ingredient_set_count,
  g.strict_ready_product_count,
  g.registry_numbers,
  (select count(*) from drx_dose.source_regimen_candidates_v1 r
   where r.dose_moiety_key=g.dose_moiety_key) as source_regimen_candidate_count,
  (select count(*) from drx_dose.rule_targets_v1 t
   where t.dose_moiety_key=g.dose_moiety_key and t.binding_status='VERIFIED') as verified_rule_target_count,
  (select count(distinct m.drug_id) from drx_dose.inherited_rule_matches_v1 m
   where m.dose_moiety_key=g.dose_moiety_key) as inherited_product_count,
  case
    when (select count(*) from drx_dose.rule_targets_v1 t
          where t.dose_moiety_key=g.dose_moiety_key and t.binding_status='VERIFIED')>0
      then 'VERIFIED_RULE_AVAILABLE'
    when (select count(*) from drx_dose.source_regimen_candidates_v1 r
          where r.dose_moiety_key=g.dose_moiety_key)>0
      then 'SOURCE_REGIMEN_DRAFT'
    else 'NEEDS_RULES'
  end as fill_status
from g;

create or replace view drx_dose.dose_target_context_queue_v1 as
with candidate_by_drug as (
  select
    c.drug_id,
    count(*) as legacy_candidate_rows,
    count(*) filter (where c.parser_status='STRUCTURED_CANDIDATE') as structured_candidate_rows
  from drx_dose.rule_candidate_extractions_v1 c
  group by c.drug_id
),
source_by_drug as (
  select
    q.drug_id,
    count(*) filter (
      where q.matching_snapshot_count=1 and q.single_section_sha256 is not null
    ) as exact_42_candidate_rows
  from drx_dose.rule_candidate_promotion_queue_v1 q
  group by q.drug_id
),
ctx as (
  select
    p.dose_moiety_key,
    p.dose_moiety_concept_ids,
    p.route_keys,
    p.form_family,
    p.release_key,
    p.population_key,
    count(distinct p.drug_id) as product_count,
    count(distinct p.drug_id) filter (where p.strict_autoinherit_ready) as strict_ready_product_count,
    coalesce(sum(cb.legacy_candidate_rows),0) as legacy_candidate_rows,
    coalesce(sum(cb.structured_candidate_rows),0) as structured_candidate_rows,
    coalesce(sum(sb.exact_42_candidate_rows),0) as exact_42_candidate_rows,
    array_agg(distinct p.registry_number order by p.registry_number) as registry_numbers
  from drx_dose.product_dose_moiety_targets_v1 p
  left join candidate_by_drug cb on cb.drug_id=p.drug_id
  left join source_by_drug sb on sb.drug_id=p.drug_id
  where p.dose_moiety_key is not null
  group by
    p.dose_moiety_key,p.dose_moiety_concept_ids,p.route_keys,
    p.form_family,p.release_key,p.population_key
)
select
  ctx.*,
  array(
    select s.canonical_name
    from unnest(ctx.dose_moiety_concept_ids) u(concept_id)
    join public.substance_concepts_v1 s on s.concept_id=u.concept_id
    order by s.canonical_name
  ) as dose_moiety_names,
  (
    select count(*)
    from drx_dose.source_regimen_candidates_v1 r
    where r.dose_moiety_key=ctx.dose_moiety_key
      and r.route_key = any(ctx.route_keys)
      and (r.form_family is null or r.form_family=ctx.form_family)
  ) as source_regimen_candidate_count,
  (
    ctx.structured_candidate_rows*100
    + ctx.exact_42_candidate_rows*150
    + ctx.product_count*10
  )::integer as priority_score,
  case
    when ctx.strict_ready_product_count=0 then 'PRODUCT_COMPATIBILITY_REVIEW'
    when exists (
      select 1 from drx_dose.source_regimen_candidates_v1 r
      where r.dose_moiety_key=ctx.dose_moiety_key
        and r.route_key = any(ctx.route_keys)
        and (r.form_family is null or r.form_family=ctx.form_family)
    ) then 'SOURCE_REGIMEN_DRAFT'
    when ctx.exact_42_candidate_rows>0 then 'SOURCE_EVIDENCE_AVAILABLE'
    when ctx.structured_candidate_rows>0 then 'LEGACY_RULE_CANDIDATES'
    else 'NEEDS_SOURCE_AND_RULES'
  end as fill_status
from ctx;

create or replace view drx_dose.dose_fill_dashboard_v1 as
select
  'TARGETS'::text as metric_group,
  jsonb_build_object(
    'uniqueDoseTargets',(select count(*) from drx_dose.dose_target_catalog_v1),
    'targetsWithDraftRegimens',(select count(*) from drx_dose.dose_target_catalog_v1 where source_regimen_candidate_count>0),
    'targetsWithVerifiedRules',(select count(*) from drx_dose.dose_target_catalog_v1 where verified_rule_target_count>0),
    'productsRepresented',(select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1)
  ) as metrics
union all
select
  'CONTEXTS',
  jsonb_build_object(
    'targetContexts',(select count(*) from drx_dose.dose_target_context_queue_v1),
    'contextsWithDraftRegimens',(select count(*) from drx_dose.dose_target_context_queue_v1 where fill_status='SOURCE_REGIMEN_DRAFT'),
    'contextsWithExactEvidence',(select count(*) from drx_dose.dose_target_context_queue_v1 where exact_42_candidate_rows>0),
    'contextsWithLegacyCandidates',(select count(*) from drx_dose.dose_target_context_queue_v1 where structured_candidate_rows>0)
  );

alter table drx_dose.source_regimen_step_components_v1 enable row level security;
revoke all on drx_dose.source_regimen_step_components_v1 from public,anon,authenticated;
revoke all on drx_dose.dose_target_catalog_v1 from public,anon,authenticated;
revoke all on drx_dose.dose_target_context_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.dose_fill_dashboard_v1 from public,anon,authenticated;
grant select,insert,update,delete on drx_dose.source_regimen_step_components_v1 to service_role;
grant select on drx_dose.dose_target_catalog_v1 to service_role;
grant select on drx_dose.dose_target_context_queue_v1 to service_role;
grant select on drx_dose.dose_fill_dashboard_v1 to service_role;
