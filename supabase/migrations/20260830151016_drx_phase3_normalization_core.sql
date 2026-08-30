-- DRx strict Phase 3 — pharmaceutical normalization core
-- Live migration version: 20260830151016
-- Additive only. Raw registry/provenance remain untouched. Publication stays closed.
-- Rollback: stop consuming drx_norm and return to drx_stage/V2; do not DROP evidence.

create schema if not exists drx_norm;
revoke all on schema drx_norm from public, anon, authenticated;

create table if not exists drx_norm.form_dictionary_v1 (
  form_key text primary key check (form_key ~ '^[a-z0-9]+$'),
  source_form_text text not null,
  category text,
  medindex_prefix text,
  default_route_text text,
  dose_unit text,
  auto_fill_route boolean not null default false,
  safety_note text,
  verification_status text not null,
  publish_prefix boolean not null default false,
  publish_route boolean not null default false,
  source_version text,
  reviewed_at date,
  source_ref text not null,
  source_row_number integer,
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  check (verification_status <> 'VERIFIKUAR' or reviewed_at is not null)
);

create table if not exists drx_norm.route_dictionary_v1 (
  route_key text primary key check (route_key ~ '^[A-Z][A-Z0-9_]*$'),
  display_name text not null,
  route_family text not null,
  is_administration_route boolean not null default true,
  status text not null default 'VERIFIED' check (status in ('VERIFIED','REVIEW')),
  unique(display_name)
);

create table if not exists drx_norm.route_alias_v1 (
  alias_text text primary key,
  route_keys text[] not null default '{}'::text[],
  resolution_status text not null
    check (resolution_status in ('EXACT','MULTI_ROUTE','UNRESOLVED','NOT_APPLICABLE')),
  instruction_text text,
  source_scope text not null,
  reviewed boolean not null default false,
  check (
    (resolution_status='EXACT' and cardinality(route_keys)=1)
    or (resolution_status='MULTI_ROUTE' and cardinality(route_keys)>1)
    or (resolution_status in ('UNRESOLVED','NOT_APPLICABLE') and cardinality(route_keys)=0)
  )
);

create table if not exists drx_norm.route_form_rules_v1 (
  form_key text primary key
    references drx_norm.form_dictionary_v1(form_key) on delete restrict,
  default_route_text text,
  normalized_route_keys text[] not null default '{}'::text[],
  rule_status text not null
    check (rule_status in ('EXACT_AUTO','REVIEW_REQUIRED','NO_ROUTE')),
  evidence_source_ref text not null,
  evidence_row_number integer,
  reviewed_at date,
  check (
    (rule_status='EXACT_AUTO' and cardinality(normalized_route_keys)>=1)
    or (rule_status in ('REVIEW_REQUIRED','NO_ROUTE') and cardinality(normalized_route_keys)=0)
  )
);

create table if not exists drx_norm.population_dictionary_v1 (
  population_key text primary key check (population_key ~ '^[A-Z][A-Z0-9_]*$'),
  source_text text unique,
  display_name text not null,
  pediatric_allowed boolean,
  adult_allowed boolean,
  status text not null check (status in ('EXACT','UNKNOWN'))
);

insert into drx_norm.population_dictionary_v1
  (population_key,source_text,display_name,pediatric_allowed,adult_allowed,status)
values
 ('PEDIATRIC_ONLY','Pediatric only','Pediatric only',true,false,'EXACT'),
 ('ADULT_ONLY','Adult only','Adult only',false,true,'EXACT'),
 ('PEDIATRIC_AND_ADULT','Pediatric and adult both','Pediatric and adult both',true,true,'EXACT'),
 ('UNKNOWN',null,'Unknown',null,null,'UNKNOWN')
on conflict (population_key) do update set
 source_text=excluded.source_text,
 display_name=excluded.display_name,
 pediatric_allowed=excluded.pediatric_allowed,
 adult_allowed=excluded.adult_allowed,
 status=excluded.status;

insert into drx_norm.route_dictionary_v1
  (route_key,display_name,route_family,is_administration_route,status)
values
 ('PO','Oral','ENTERAL',true,'VERIFIED'),
 ('IV','Intravenous','PARENTERAL',true,'VERIFIED'),
 ('IM','Intramuscular','PARENTERAL',true,'VERIFIED'),
 ('SC','Subcutaneous','PARENTERAL',true,'VERIFIED'),
 ('ID','Intradermal','PARENTERAL',true,'VERIFIED'),
 ('IA','Intra-arterial','PARENTERAL',true,'VERIFIED'),
 ('INH','Inhalation','INHALATION',true,'VERIFIED'),
 ('NEB','Nebulised inhalation','INHALATION',true,'VERIFIED'),
 ('TOP','Topical cutaneous','TOPICAL_LOCAL',true,'VERIFIED'),
 ('OPH','Ophthalmic','TOPICAL_LOCAL',true,'VERIFIED'),
 ('OTIC','Otic','TOPICAL_LOCAL',true,'VERIFIED'),
 ('NASAL','Intranasal','TOPICAL_LOCAL',true,'VERIFIED'),
 ('PR','Rectal','TOPICAL_LOCAL',true,'VERIFIED'),
 ('VAGINAL','Vaginal','TOPICAL_LOCAL',true,'VERIFIED'),
 ('BUCCAL','Buccal/oromucosal','TOPICAL_LOCAL',true,'VERIFIED'),
 ('SL','Sublingual','TOPICAL_LOCAL',true,'VERIFIED'),
 ('TD','Transdermal','TOPICAL_LOCAL',true,'VERIFIED'),
 ('INTRAVESICAL','Intravesical','TOPICAL_LOCAL',true,'VERIFIED'),
 ('INTRAPERITONEAL','Intraperitoneal','PARENTERAL',true,'VERIFIED'),
 ('INTRAARTICULAR','Intra-articular','PARENTERAL',true,'VERIFIED'),
 ('ENDOCERVICAL','Endocervical','TOPICAL_LOCAL',true,'VERIFIED')
on conflict (route_key) do update set
 display_name=excluded.display_name,
 route_family=excluded.route_family,
 is_administration_route=excluded.is_administration_route,
 status=excluded.status;

insert into drx_norm.route_alias_v1
  (alias_text,route_keys,resolution_status,instruction_text,source_scope,reviewed)
values
 ('PO',array['PO'],'EXACT',null,'product_source',true),
 ('IV',array['IV'],'EXACT',null,'product_source',true),
 ('IM',array['IM'],'EXACT',null,'product_source',true),
 ('SC',array['SC'],'EXACT',null,'product_source',true),
 ('TOP',array['TOP'],'EXACT',null,'product_source',true),
 ('CUTANEOUS',array['TOP'],'EXACT',null,'product_source',true),
 ('OPH',array['OPH'],'EXACT',null,'product_source',true),
 ('OTIC',array['OTIC'],'EXACT',null,'product_source',true),
 ('NASAL',array['NASAL'],'EXACT',null,'product_source',true),
 ('PR',array['PR'],'EXACT',null,'product_source',true),
 ('INH',array['INH'],'EXACT',null,'product_source',true),
 ('NEB',array['NEB'],'EXACT',null,'product_source',true),
 ('VAGINAL',array['VAGINAL'],'EXACT',null,'product_source',true),
 ('BUCCAL',array['BUCCAL'],'EXACT',null,'product_source',true),
 ('OROMUCOSAL',array['BUCCAL'],'EXACT',null,'product_source',true),
 ('SL',array['SL'],'EXACT',null,'product_source',true),
 ('TD',array['TD'],'EXACT',null,'product_source',true),
 ('IV; IM',array['IV','IM'],'MULTI_ROUTE',null,'product_source',true),
 ('IV/IM',array['IV','IM'],'MULTI_ROUTE',null,'product_source',true),
 ('KËRKON VERIFIKIM','{}','UNRESOLVED',null,'product_source',true),
 ('IV/IM BOLUS','{}','UNRESOLVED','BOLUS qualifier must remain product-specific','product_source',true),
 ('TOPICAL/MUCOSAL','{}','UNRESOLVED','Ambiguous between cutaneous and mucosal local administration','product_source',true)
on conflict (alias_text) do update set
 route_keys=excluded.route_keys,
 resolution_status=excluded.resolution_status,
 instruction_text=excluded.instruction_text,
 source_scope=excluded.source_scope,
 reviewed=excluded.reviewed;

create or replace function drx_norm.parse_strength_v1(p_strength text)
returns jsonb
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  s text := btrim(p_strength);
  m text[];
  numerator_value numeric;
  denominator_value numeric;
begin
  if s='' then
    return jsonb_build_object('status','MISSING','raw',p_strength);
  end if;

  m := regexp_match(s, '^([0-9]+(?:[.,][0-9]+)?)\s*%$','i');
  if m is not null then
    return jsonb_build_object(
      'status','PARSED_PERCENT','raw',p_strength,
      'value',replace(m[1],',','.')::numeric,'unit','%','semantic','percentage'
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
      'value',replace(m[1],',','.')::numeric,'unit',lower(m[2]),'semantic','amount'
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
      'status','PARSED_CONCENTRATION','raw',p_strength,
      'numerator',jsonb_build_object('value',numerator_value,'unit',lower(m[2])),
      'denominator',jsonb_build_object('value',denominator_value,'unit',lower(m[4])),
      'semantic','concentration_not_dose'
    );
  end if;

  if s ~ '[+;]' then
    return jsonb_build_object(
      'status','COMBINATION_UNPARSED','raw',p_strength,
      'semantic','multi_component_requires_component_alignment'
    );
  end if;

  return jsonb_build_object(
    'status','UNPARSED','raw',p_strength,'semantic','preserved_no_inference'
  );
end;
$$;

create or replace function public.drx_phase3_import_form_dictionary_v1(
  p_source_ref text,
  p_source_sha256 text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_norm, extensions
as $$
declare
  r jsonb;
  v_count integer := 0;
  v_key text;
  v_auto boolean;
  v_publish_route boolean;
begin
  if p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid SHA-256';
  end if;
  if jsonb_typeof(p_rows)<>'array' then
    raise exception 'p_rows must be an array';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_key := lower(regexp_replace(coalesce(r->>'FormaKey',''),'[^a-zA-Z0-9]+','','g'));
    if v_key='' or v_key !~ '^[a-z0-9]+$' then
      raise exception 'Malformed form key at source row %: %',
        r->>'source_row_number', r->>'FormaKey';
    end if;

    v_auto := upper(coalesce(r->>'Auto-plotëso rrugën?','JO'))='PO';
    v_publish_route := upper(coalesce(r->>'Publiko rrugën?','JO'))='PO';

    insert into drx_norm.form_dictionary_v1(
      form_key,source_form_text,category,medindex_prefix,default_route_text,dose_unit,
      auto_fill_route,safety_note,verification_status,publish_prefix,publish_route,
      source_version,reviewed_at,source_ref,source_row_number,source_sha256
    ) values (
      v_key,
      r->>'Forma në databazë',
      nullif(r->>'Kategoria',''),
      nullif(r->>'Parashtesa MedIndex',''),
      nullif(r->>'Rruga default',''),
      nullif(r->>'Njësia e dozës',''),
      v_auto,
      nullif(r->>'Vërejtje sigurie',''),
      coalesce(nullif(r->>'Statusi',''),'UNVERIFIED'),
      upper(coalesce(r->>'Publiko parashtesën?','JO'))='PO',
      v_publish_route,
      nullif(r->>'Versioni',''),
      nullif(r->>'Kontrolluar më','')::date,
      p_source_ref,
      nullif(r->>'source_row_number','')::integer,
      p_source_sha256
    )
    on conflict (form_key) do update set
      source_form_text=excluded.source_form_text,
      category=excluded.category,
      medindex_prefix=excluded.medindex_prefix,
      default_route_text=excluded.default_route_text,
      dose_unit=excluded.dose_unit,
      auto_fill_route=excluded.auto_fill_route,
      safety_note=excluded.safety_note,
      verification_status=excluded.verification_status,
      publish_prefix=excluded.publish_prefix,
      publish_route=excluded.publish_route,
      source_version=excluded.source_version,
      reviewed_at=excluded.reviewed_at,
      source_ref=excluded.source_ref,
      source_row_number=excluded.source_row_number,
      source_sha256=excluded.source_sha256,
      imported_at=now();

    v_count := v_count + 1;
  end loop;

  insert into drx_norm.route_form_rules_v1(
    form_key,default_route_text,normalized_route_keys,rule_status,
    evidence_source_ref,evidence_row_number,reviewed_at
  )
  select
    f.form_key,
    f.default_route_text,
    case
      when f.auto_fill_route and f.publish_route and a.resolution_status='EXACT'
        then a.route_keys
      else '{}'::text[]
    end,
    case
      when not f.auto_fill_route or not f.publish_route then 'REVIEW_REQUIRED'
      when a.resolution_status='EXACT' then 'EXACT_AUTO'
      else 'REVIEW_REQUIRED'
    end,
    f.source_ref,
    f.source_row_number,
    f.reviewed_at
  from drx_norm.form_dictionary_v1 f
  left join drx_norm.route_alias_v1 a
    on a.alias_text = case f.default_route_text
      when 'PO' then 'PO'
      when 'IV' then 'IV'
      when 'Topike' then 'TOP'
      when 'Oftalmike' then 'OPH'
      when 'Otike' then 'OTIC'
      when 'Intranazale' then 'NASAL'
      when 'Inhalatore' then 'INH'
      when 'Oromukozale' then 'OROMUCOSAL'
      when 'Sublinguale' then 'SL'
      when 'Vaginale' then 'VAGINAL'
      when 'Transdermale' then 'TD'
      else f.default_route_text
    end
  on conflict (form_key) do update set
    default_route_text=excluded.default_route_text,
    normalized_route_keys=excluded.normalized_route_keys,
    rule_status=excluded.rule_status,
    evidence_source_ref=excluded.evidence_source_ref,
    evidence_row_number=excluded.evidence_row_number,
    reviewed_at=excluded.reviewed_at;

  return jsonb_build_object('imported',v_count);
end;
$$;

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
    else 'REVIEW'
  end as form_status,
  p.form_family,
  p.release_type,
  p.raw_strength as source_strength_text,
  p.effective_strength,
  drx_norm.parse_strength_v1(coalesce(p.effective_strength,p.raw_strength)) as strength_parse,
  nullif(btrim(d.source_payload->>'Rrugët e lejuara'),'') as source_route_text,
  coalesce(a.route_keys,'{}'::text[]) as normalized_route_keys,
  coalesce(a.resolution_status,'UNRESOLVED') as route_status,
  a.instruction_text as route_instruction,
  nullif(btrim(d.source_payload->>'Popullata e aprovuar'),'') as source_population_text,
  coalesce(pop.population_key,'UNKNOWN') as population_key,
  coalesce(pop.status,'UNKNOWN') as population_status
from drx_stage.product_registry_v1 p
join public.drugs d on d.id=p.drug_id
left join drx_norm.form_dictionary_v1 f on f.form_key=p.form_key
left join drx_norm.route_alias_v1 a
  on a.alias_text=nullif(btrim(d.source_payload->>'Rrugët e lejuara'),'')
left join drx_norm.population_dictionary_v1 pop
  on pop.source_text=nullif(btrim(d.source_payload->>'Popullata e aprovuar'),'');

create or replace function public.drx_phase3_status_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, drx_norm, drx_stage
as $$
select jsonb_build_object(
  'products',(select count(*) from drx_norm.product_normalization_v1),
  'form_dictionary_rows',(select count(*) from drx_norm.form_dictionary_v1),
  'distinct_product_forms',(select count(distinct effective_form) from drx_stage.product_registry_v1),
  'form_unmapped',(select count(*) from drx_norm.product_normalization_v1 where form_status='UNMAPPED'),
  'malformed_normalized_form_keys',(select count(*) from drx_norm.form_dictionary_v1 where form_key !~ '^[a-z0-9]+$'),
  'route_exact_products',(select count(*) from drx_norm.product_normalization_v1 where route_status='EXACT'),
  'route_multi_products',(select count(*) from drx_norm.product_normalization_v1 where route_status='MULTI_ROUTE'),
  'route_unresolved_products',(select count(*) from drx_norm.product_normalization_v1 where route_status='UNRESOLVED'),
  'population_unknown_products',(select count(*) from drx_norm.product_normalization_v1 where population_status='UNKNOWN'),
  'unsafe_route_autofill_rules',(select count(*) from drx_norm.route_form_rules_v1
     where rule_status='EXACT_AUTO' and cardinality(normalized_route_keys)=0),
  'publication_allowed',false
);
$$;

revoke all on all tables in schema drx_norm from public,anon,authenticated;
revoke all on all sequences in schema drx_norm from public,anon,authenticated;
revoke execute on all functions in schema drx_norm from public,anon,authenticated;
revoke all on schema drx_norm from public,anon,authenticated;

alter default privileges for role postgres in schema drx_norm
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_norm
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_norm
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_phase3_import_form_dictionary_v1(text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.drx_phase3_status_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase3_import_form_dictionary_v1(text,text,jsonb)
  to service_role;
grant execute on function public.drx_phase3_status_v1()
  to service_role;

comment on schema drx_norm is
  'DRx Phase 3 private normalization layer. Raw source text is preserved and unsafe inference is fail-closed.';
comment on function drx_norm.parse_strength_v1(text) is
  'Strict parser: parses only exact safe patterns and never converts concentration into dose.';
