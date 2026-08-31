
-- DRx Phase 11W: generalize restriction/adjustment staging to ingredient-set targets.

alter table drx_dose.source_restriction_candidates_v1
  alter column substance_concept_id drop not null;

alter table drx_dose.source_restriction_candidates_v1
  add column if not exists target_kind text not null default 'SUBSTANCE'
    check (target_kind in ('SUBSTANCE','INGREDIENT_SET')),
  add column if not exists dose_moiety_concept_ids uuid[] not null default '{}'::uuid[],
  add column if not exists dose_moiety_key text;

update drx_dose.source_restriction_candidates_v1
set
  target_kind='SUBSTANCE',
  dose_moiety_concept_ids=drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id]),
  dose_moiety_key=md5(array_to_string(
    drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id])::text[],'|'
  ))
where substance_concept_id is not null
  and (cardinality(dose_moiety_concept_ids)=0 or dose_moiety_key is null);

alter table drx_dose.source_restriction_candidates_v1
  drop constraint if exists source_restriction_candidates_v1_target_identity_check;
alter table drx_dose.source_restriction_candidates_v1
  add constraint source_restriction_candidates_v1_target_identity_check
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

create or replace function drx_dose.set_source_restriction_target_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare v_ids uuid[];
begin
  if new.target_kind='SUBSTANCE' then
    if new.substance_concept_id is null then raise exception 'SOURCE_RESTRICTION_SUBSTANCE_ID_REQUIRED'; end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(array[new.substance_concept_id]);
  else
    if new.substance_concept_id is not null then raise exception 'SOURCE_RESTRICTION_COMBINATION_SUBSTANCE_ID_MUST_BE_NULL'; end if;
    if cardinality(new.dose_moiety_concept_ids)<=1 then raise exception 'SOURCE_RESTRICTION_COMBINATION_COMPONENTS_REQUIRED'; end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(new.dose_moiety_concept_ids);
  end if;
  new.dose_moiety_concept_ids := coalesce(v_ids,'{}'::uuid[]);
  new.dose_moiety_key := case when cardinality(new.dose_moiety_concept_ids)>0
    then md5(array_to_string(new.dose_moiety_concept_ids::text[],'|')) end;
  return new;
end;
$$;

drop trigger if exists source_restriction_target_fill on drx_dose.source_restriction_candidates_v1;
create trigger source_restriction_target_fill
before insert or update of target_kind,substance_concept_id,dose_moiety_concept_ids
on drx_dose.source_restriction_candidates_v1
for each row execute function drx_dose.set_source_restriction_target_v1();

alter table drx_dose.source_adjustment_candidates_v1
  alter column substance_concept_id drop not null;

alter table drx_dose.source_adjustment_candidates_v1
  add column if not exists target_kind text not null default 'SUBSTANCE'
    check (target_kind in ('SUBSTANCE','INGREDIENT_SET')),
  add column if not exists dose_moiety_concept_ids uuid[] not null default '{}'::uuid[],
  add column if not exists dose_moiety_key text;

update drx_dose.source_adjustment_candidates_v1
set
  target_kind='SUBSTANCE',
  dose_moiety_concept_ids=drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id]),
  dose_moiety_key=md5(array_to_string(
    drx_dose.resolve_dose_moiety_ids_v1(array[substance_concept_id])::text[],'|'
  ))
where substance_concept_id is not null
  and (cardinality(dose_moiety_concept_ids)=0 or dose_moiety_key is null);

alter table drx_dose.source_adjustment_candidates_v1
  drop constraint if exists source_adjustment_candidates_v1_target_identity_check;
alter table drx_dose.source_adjustment_candidates_v1
  add constraint source_adjustment_candidates_v1_target_identity_check
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

create or replace function drx_dose.set_source_adjustment_target_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare v_ids uuid[];
begin
  if new.target_kind='SUBSTANCE' then
    if new.substance_concept_id is null then raise exception 'SOURCE_ADJUSTMENT_SUBSTANCE_ID_REQUIRED'; end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(array[new.substance_concept_id]);
  else
    if new.substance_concept_id is not null then raise exception 'SOURCE_ADJUSTMENT_COMBINATION_SUBSTANCE_ID_MUST_BE_NULL'; end if;
    if cardinality(new.dose_moiety_concept_ids)<=1 then raise exception 'SOURCE_ADJUSTMENT_COMBINATION_COMPONENTS_REQUIRED'; end if;
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(new.dose_moiety_concept_ids);
  end if;
  new.dose_moiety_concept_ids := coalesce(v_ids,'{}'::uuid[]);
  new.dose_moiety_key := case when cardinality(new.dose_moiety_concept_ids)>0
    then md5(array_to_string(new.dose_moiety_concept_ids::text[],'|')) end;
  return new;
end;
$$;

drop trigger if exists source_adjustment_target_fill on drx_dose.source_adjustment_candidates_v1;
create trigger source_adjustment_target_fill
before insert or update of target_kind,substance_concept_id,dose_moiety_concept_ids
on drx_dose.source_adjustment_candidates_v1
for each row execute function drx_dose.set_source_adjustment_target_v1();

create index if not exists source_restriction_candidates_v1_moiety_idx
  on drx_dose.source_restriction_candidates_v1(dose_moiety_key,review_status);
create index if not exists source_adjustment_candidates_v1_moiety_idx
  on drx_dose.source_adjustment_candidates_v1(dose_moiety_key,review_status);

create or replace view drx_dose.dose_target_safety_coverage_v1 as
select
  t.dose_moiety_key,
  t.dose_moiety_concept_ids,
  t.dose_moiety_names,
  t.product_count,
  (select count(*) from drx_dose.source_restriction_candidates_v1 r
   where r.dose_moiety_key=t.dose_moiety_key) as restriction_candidate_count,
  (select count(*) from drx_dose.source_adjustment_candidates_v1 a
   where a.dose_moiety_key=t.dose_moiety_key) as adjustment_candidate_count,
  (select count(*) from drx_dose.source_regimen_candidates_v1 rg
   where rg.dose_moiety_key=t.dose_moiety_key) as regimen_candidate_count
from drx_dose.dose_target_catalog_v1 t;

revoke all on drx_dose.dose_target_safety_coverage_v1 from public,anon,authenticated;
grant select on drx_dose.dose_target_safety_coverage_v1 to service_role;
