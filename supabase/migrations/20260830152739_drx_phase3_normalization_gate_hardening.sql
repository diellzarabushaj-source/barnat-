-- DRx strict Phase 3 — normalization gate hardening
-- Live migration version: 20260830152739
-- Adds canonical aliases/release namespace, review queue and machine-verifiable gate.
-- Publication remains false; unresolved semantics remain fail-closed.
-- Rollback: stop consuming drx_norm and return to drx_stage/V2. Do not DROP evidence.

create or replace function drx_norm.parse_strength_v1(p_strength text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  s text := btrim(coalesce(p_strength,''));
  m text[];
  numerator_value numeric;
  denominator_value numeric;
begin
  if s='' then
    return jsonb_build_object(
      'status','MISSING','raw',p_strength,'semantic','review_required'
    );
  end if;

  m := regexp_match(s, '^([0-9]+(?:[.,][0-9]+)?)\s*%$','i');
  if m is not null then
    return jsonb_build_object(
      'status','PARSED_PERCENT','raw',p_strength,
      'value',replace(m[1],',','.')::numeric,
      'unit','%',
      'semantic','percentage_no_conversion'
    );
  end if;

  m := regexp_match(
    s,
    '^([0-9]+(?:[.,][0-9]+)?)\s*(mg|g|mcg|µg|ug|iu|u|mmol|mol|ml|l)$',
    'i'
  );
  if m is not null then
    return jsonb_build_object(
      'status','PARSED_AMOUNT','raw',p_strength,
      'value',replace(m[1],',','.')::numeric,
      'unit',lower(m[2]),
      'semantic','amount'
    );
  end if;

  m := regexp_match(
    s,
    '^([0-9]+(?:[.,][0-9]+)?)\s*(mg|g|mcg|µg|ug|iu|u|mmol)\s*/\s*([0-9]+(?:[.,][0-9]+)?)?\s*(ml|l|g)$',
    'i'
  );
  if m is not null then
    numerator_value := replace(m[1],',','.')::numeric;
    denominator_value := coalesce(nullif(replace(m[3],',','.'),''),'1')::numeric;
    return jsonb_build_object(
      'status','PARSED_CONCENTRATION',
      'raw',p_strength,
      'numerator',jsonb_build_object('value',numerator_value,'unit',lower(m[2])),
      'denominator',jsonb_build_object('value',denominator_value,'unit',lower(m[4])),
      'semantic','concentration_not_dose'
    );
  end if;

  if s ~ '[+;]' then
    return jsonb_build_object(
      'status','COMBINATION_UNPARSED',
      'raw',p_strength,
      'semantic','multi_component_requires_component_alignment'
    );
  end if;

  return jsonb_build_object(
    'status','UNPARSED',
    'raw',p_strength,
    'semantic','preserved_no_inference'
  );
end;
$$;

insert into drx_norm.form_dictionary_v1(
  form_key,source_form_text,category,medindex_prefix,default_route_text,dose_unit,
  auto_fill_route,safety_note,verification_status,publish_prefix,publish_route,
  source_version,reviewed_at,source_ref,source_row_number,source_sha256
)
select
  p.form_key,
  min(p.effective_form),
  nullif(min(p.form_family),''),
  null,
  null,
  null,
  false,
  'Stage-derived exact form mapping; route/release remain separate and fail-closed.',
  'STAGE_DERIVED',
  false,
  false,
  'phase3-stage-v1',
  null,
  'drx_stage.product_registry_v1',
  null,
  null
from drx_stage.product_registry_v1 p
where p.form_key is not null
  and p.form_key ~ '^[a-z0-9]+$'
  and nullif(btrim(p.effective_form),'') is not null
group by p.form_key
on conflict (form_key) do nothing;

create table if not exists drx_norm.form_alias_v1 (
  alias_text text primary key,
  alias_key text not null check (alias_key ~ '^[a-z0-9]+$'),
  form_key text not null
    references drx_norm.form_dictionary_v1(form_key) on delete restrict,
  source_scope text not null,
  source_ref text not null,
  reviewed boolean not null default false,
  imported_at timestamptz not null default now()
);

with candidates as (
  select nullif(btrim(effective_form),'') alias_text, form_key, 'effective_form' source_scope
  from drx_stage.product_registry_v1
  union all
  select nullif(btrim(raw_form),'') alias_text, form_key, 'raw_form' source_scope
  from drx_stage.product_registry_v1
),
resolved as (
  select
    alias_text,
    min(form_key) form_key,
    string_agg(distinct source_scope,',' order by source_scope) source_scope,
    count(distinct form_key) target_count
  from candidates
  where alias_text is not null and form_key is not null
  group by alias_text
)
insert into drx_norm.form_alias_v1(
  alias_text,alias_key,form_key,source_scope,source_ref,reviewed
)
select
  alias_text,
  lower(regexp_replace(alias_text,'[^a-zA-Z0-9]+','','g')),
  form_key,
  source_scope,
  'drx_stage.product_registry_v1',
  false
from resolved
where target_count=1
  and lower(regexp_replace(alias_text,'[^a-zA-Z0-9]+','','g')) ~ '^[a-z0-9]+$'
on conflict (alias_text) do update set
  alias_key=excluded.alias_key,
  form_key=excluded.form_key,
  source_scope=excluded.source_scope,
  source_ref=excluded.source_ref;

create table if not exists drx_norm.release_dictionary_v1 (
  release_key text primary key check (release_key in (
    'IMMEDIATE','MODIFIED','PROLONGED','GASTRO_RESISTANT','DELAYED','NOT_APPLICABLE'
  )),
  display_name text not null unique
);

insert into drx_norm.release_dictionary_v1(release_key,display_name)
values
 ('IMMEDIATE','Immediate release'),
 ('MODIFIED','Modified release'),
 ('PROLONGED','Prolonged release'),
 ('GASTRO_RESISTANT','Gastro-resistant'),
 ('DELAYED','Delayed release'),
 ('NOT_APPLICABLE','Not applicable')
on conflict (release_key) do update set display_name=excluded.display_name;

create table if not exists drx_norm.release_alias_v1 (
  source_text text primary key,
  release_key text
    references drx_norm.release_dictionary_v1(release_key) on delete restrict,
  resolution_status text not null check (resolution_status in ('EXACT','UNRESOLVED')),
  evidence_basis text not null,
  reviewed boolean not null default false,
  check (
    (resolution_status='EXACT' and release_key is not null)
    or (resolution_status='UNRESOLVED' and release_key is null)
  )
);

insert into drx_norm.release_alias_v1(
  source_text,release_key,resolution_status,evidence_basis,reviewed
)
values
 ('modified','MODIFIED','EXACT','Existing stage release classification',true),
 ('gastro_resistant','GASTRO_RESISTANT','EXACT','Existing stage release classification',true),
 ('not_applicable','NOT_APPLICABLE','EXACT','Existing stage release classification',true),
 ('unspecified',null,'UNRESOLVED','No release equivalence may be assumed',true)
on conflict (source_text) do update set
  release_key=excluded.release_key,
  resolution_status=excluded.resolution_status,
  evidence_basis=excluded.evidence_basis,
  reviewed=excluded.reviewed;

update drx_norm.population_dictionary_v1
set population_key='ADULT_AND_PEDIATRIC',
    display_name='Adult and pediatric'
where population_key='PEDIATRIC_AND_ADULT';

delete from drx_norm.population_dictionary_v1
where population_key='UNKNOWN';

insert into drx_norm.population_dictionary_v1(
  population_key,source_text,display_name,pediatric_allowed,adult_allowed,status
)
values
 ('ADULT_ONLY','Adult only','Adult only',false,true,'EXACT'),
 ('PEDIATRIC_ONLY','Pediatric only','Pediatric only',true,false,'EXACT'),
 ('ADULT_AND_PEDIATRIC','Pediatric and adult both','Adult and pediatric',true,true,'EXACT'),
 ('NEONATAL_ONLY',null,'Neonatal only',true,false,'EXACT'),
 ('PEDIATRIC_SUBGROUP',null,'Pediatric subgroup',true,false,'EXACT'),
 ('GERIATRIC_SPECIFIC',null,'Geriatric specific',false,true,'EXACT'),
 ('SPECIAL_POPULATION',null,'Special population',null,null,'EXACT'),
 ('NOT_ESTABLISHED',null,'Not established',null,null,'UNKNOWN')
on conflict (population_key) do update set
  source_text=excluded.source_text,
  display_name=excluded.display_name,
  pediatric_allowed=excluded.pediatric_allowed,
  adult_allowed=excluded.adult_allowed,
  status=excluded.status;

create or replace view drx_norm.product_normalization_v1 as
select
  p.drug_id,
  p.registry_number,
  p.trade_name,
  p.raw_form as source_form_text,
  p.effective_form,
  p.form_key as stage_form_key,
  f.form_key as normalized_form_key,
  case
    when f.form_key is null then 'UNMAPPED'
    when f.verification_status='VERIFIKUAR' then 'VERIFIED'
    else 'MAPPED_REVIEW'
  end as form_status,
  p.form_family,
  p.release_type as release_type,
  p.raw_strength as source_strength_text,
  p.effective_strength,
  drx_norm.parse_strength_v1(coalesce(p.effective_strength,p.raw_strength)) as strength_parse,
  nullif(btrim(d.source_payload->>'Rrugët e lejuara'),'') as source_route_text,
  coalesce(a.route_keys,'{}'::text[]) as normalized_route_keys,
  coalesce(a.resolution_status,'UNRESOLVED') as route_status,
  a.instruction_text as route_instruction,
  nullif(btrim(d.source_payload->>'Popullata e aprovuar'),'') as source_population_text,
  coalesce(pop.population_key,'NOT_ESTABLISHED') as population_key,
  case
    when pop.population_key is null then 'NOT_ESTABLISHED'
    else 'EXACT'
  end as population_status,
  case
    when lower(coalesce(p.effective_form,'')) like '%prolonged-release%'
      or lower(coalesce(p.effective_form,'')) like '%prolonged release%'
      then 'PROLONGED'
    when lower(coalesce(p.effective_form,'')) like '%modified-release%'
      or lower(coalesce(p.effective_form,'')) like '%modified release%'
      then 'MODIFIED'
    when lower(coalesce(p.effective_form,'')) like '%gastro-resistant%'
      or lower(coalesce(p.effective_form,'')) like '%gastro resistant%'
      then 'GASTRO_RESISTANT'
    when lower(coalesce(p.effective_form,'')) like '%delayed-release%'
      or lower(coalesce(p.effective_form,'')) like '%delayed release%'
      then 'DELAYED'
    when lower(coalesce(p.effective_form,'')) like '%immediate-release%'
      or lower(coalesce(p.effective_form,'')) like '%immediate release%'
      then 'IMMEDIATE'
    else ra.release_key
  end as normalized_release_key,
  case
    when lower(coalesce(p.effective_form,'')) ~
      '(prolonged[- ]release|modified[- ]release|gastro[- ]resistant|delayed[- ]release|immediate[- ]release)'
      then 'EXPLICIT_FORM_TEXT'
    when ra.resolution_status='EXACT' then 'EXACT_STAGE_ALIAS'
    else 'UNRESOLVED'
  end as release_status
from drx_stage.product_registry_v1 p
join public.drugs d on d.id=p.drug_id
left join drx_norm.form_dictionary_v1 f on f.form_key=p.form_key
left join drx_norm.route_alias_v1 a
  on a.alias_text=nullif(btrim(d.source_payload->>'Rrugët e lejuara'),'')
left join drx_norm.release_alias_v1 ra
  on ra.source_text=p.release_type
left join drx_norm.population_dictionary_v1 pop
  on pop.source_text=nullif(btrim(d.source_payload->>'Popullata e aprovuar'),'');

create or replace view drx_norm.normalization_review_queue_v1 as
select drug_id,registry_number,trade_name,'FORM_UNMAPPED'::text issue_type,
       source_form_text issue_value,'OPEN'::text review_status
from drx_norm.product_normalization_v1
where form_status='UNMAPPED'
union all
select drug_id,registry_number,trade_name,'STRENGTH_REVIEW',
       source_strength_text,'OPEN'
from drx_norm.product_normalization_v1
where coalesce(strength_parse->>'status','MISSING')
  in ('MISSING','UNPARSED','COMBINATION_UNPARSED')
union all
select drug_id,registry_number,trade_name,'ROUTE_REVIEW',
       source_route_text,'OPEN'
from drx_norm.product_normalization_v1
where route_status in ('UNRESOLVED','MULTI_ROUTE')
union all
select drug_id,registry_number,trade_name,'RELEASE_REVIEW',
       release_type,'OPEN'
from drx_norm.product_normalization_v1
where release_status='UNRESOLVED'
union all
select drug_id,registry_number,trade_name,'POPULATION_REVIEW',
       source_population_text,'OPEN'
from drx_norm.product_normalization_v1
where population_status='NOT_ESTABLISHED';

create or replace view drx_norm.form_alias_ambiguities_v1 as
with candidates as (
  select nullif(btrim(effective_form),'') alias_text,form_key
  from drx_stage.product_registry_v1
  union all
  select nullif(btrim(raw_form),'') alias_text,form_key
  from drx_stage.product_registry_v1
)
select
  alias_text,
  array_agg(distinct form_key order by form_key) candidate_form_keys,
  count(distinct form_key) candidate_count
from candidates
where alias_text is not null and form_key is not null
group by alias_text
having count(distinct form_key)>1;

create or replace function public.drx_phase3_status_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, drx_norm, drx_stage
as $$
with strength_status as (
  select coalesce(strength_parse->>'status','MISSING') status,count(*) cnt
  from drx_norm.product_normalization_v1
  group by 1
),
metrics as (
  select
    (select count(*) from drx_norm.product_normalization_v1) products,
    (select count(*) from drx_norm.form_dictionary_v1) form_dictionary_rows,
    (select count(distinct effective_form) from drx_stage.product_registry_v1) distinct_product_forms,
    (select count(*) from drx_norm.product_normalization_v1 where form_status='UNMAPPED') form_unmapped,
    (select count(*) from drx_norm.form_dictionary_v1 where form_key !~ '^[a-z0-9]+$') malformed_form_keys,
    (select count(*) from drx_norm.form_alias_ambiguities_v1) ambiguous_form_aliases,
    (select count(*) from drx_norm.product_normalization_v1 where route_status='EXACT') route_exact,
    (select count(*) from drx_norm.product_normalization_v1 where route_status='MULTI_ROUTE') route_multi,
    (select count(*) from drx_norm.product_normalization_v1 where route_status='UNRESOLVED') route_unresolved,
    (select count(*) from drx_norm.product_normalization_v1 where release_status='UNRESOLVED') release_unresolved,
    (select count(*) from drx_norm.product_normalization_v1 where population_status='NOT_ESTABLISHED') population_not_established,
    (select count(*) from drx_norm.product_normalization_v1
      where coalesce(strength_parse->>'status','MISSING')
        in ('MISSING','UNPARSED','COMBINATION_UNPARSED')) strength_review,
    (select count(*) from drx_norm.normalization_review_queue_v1) review_queue_open,
    (select count(*) from drx_norm.route_form_rules_v1
      where rule_status='EXACT_AUTO' and cardinality(normalized_route_keys)=0) unsafe_route_autofill
)
select jsonb_build_object(
  'products',m.products,
  'form_dictionary_rows',m.form_dictionary_rows,
  'distinct_product_forms',m.distinct_product_forms,
  'form_unmapped',m.form_unmapped,
  'malformed_normalized_form_keys',m.malformed_form_keys,
  'ambiguous_form_aliases',m.ambiguous_form_aliases,
  'route_exact_products',m.route_exact,
  'route_multi_products',m.route_multi,
  'route_unresolved_products',m.route_unresolved,
  'release_unresolved_products',m.release_unresolved,
  'population_not_established_products',m.population_not_established,
  'strength_parse_status',
    coalesce((select jsonb_object_agg(status,cnt) from strength_status),'{}'::jsonb),
  'strength_review_products',m.strength_review,
  'review_queue_open',m.review_queue_open,
  'unsafe_route_autofill_rules',m.unsafe_route_autofill,
  'auto_strength_conversions_enabled',false,
  'publication_allowed',false,
  'gate_pass',
    m.products=(select count(*) from drx_stage.product_registry_v1)
    and m.form_dictionary_rows=(select count(distinct form_key) from drx_stage.product_registry_v1)
    and m.form_unmapped=0
    and m.malformed_form_keys=0
    and m.unsafe_route_autofill=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_norm from public,anon,authenticated;
revoke all on all sequences in schema drx_norm from public,anon,authenticated;
revoke execute on all functions in schema drx_norm from public,anon,authenticated;
revoke all on schema drx_norm from public,anon,authenticated;

revoke all on function public.drx_phase3_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase3_status_v1()
  to service_role;

comment on view drx_norm.normalization_review_queue_v1 is
  'Phase 3 fail-closed review queue for unmapped/ambiguous pharmaceutical normalization.';
comment on table drx_norm.release_dictionary_v1 is
  'Canonical release namespace. Unspecified source values are not mapped to immediate release.';
