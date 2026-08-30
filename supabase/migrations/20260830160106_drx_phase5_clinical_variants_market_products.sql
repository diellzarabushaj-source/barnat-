-- DRx strict Phase 5: clinical variants + market products.
-- Separates clinical identity from commercial product identity.
-- Additive/private/fail-closed; no IDs are invented for market products.

create schema if not exists drx_variant;
revoke all on schema drx_variant from public,anon,authenticated;

create or replace function drx_variant.normalized_strength_atom_v1(p jsonb)
returns jsonb
language sql
immutable
set search_path=pg_catalog
as $$
select case p->>'status'
  when 'PARSED_AMOUNT' then jsonb_build_object(
    'kind','amount',
    'value',p->'value',
    'unit',p->>'unit'
  )
  when 'PARSED_PERCENT' then jsonb_build_object(
    'kind','percent',
    'value',p->'value',
    'unit','%'
  )
  when 'PARSED_CONCENTRATION' then jsonb_build_object(
    'kind','concentration',
    'numerator',jsonb_build_object(
      'value',p->'numerator'->'value',
      'unit',p->'numerator'->>'unit'
    ),
    'denominator',jsonb_build_object(
      'value',p->'denominator'->'value',
      'unit',p->'denominator'->>'unit'
    )
  )
  else null
end
$$;

create or replace function drx_variant.jsonb_sha256_v1(p jsonb)
returns text
language sql
immutable
strict
set search_path=pg_catalog,extensions
as $$
select encode(extensions.digest(convert_to(p::text,'UTF8'),'sha256'),'hex')
$$;

create table if not exists drx_variant.clinical_variants_v1 (
  clinical_variant_id uuid primary key,
  variant_signature text not null unique,
  composition_concept_id uuid not null
    references drx_identity.canonical_concepts_v1(concept_id) on delete restrict,
  strength_hash text not null check (strength_hash ~ '^[0-9a-f]{64}$'),
  strength_payload jsonb not null,
  form_key text not null
    references drx_norm.form_dictionary_v1(form_key) on delete restrict,
  release_key text not null
    references drx_norm.release_dictionary_v1(release_key) on delete restrict,
  route_key text not null
    references drx_norm.route_dictionary_v1(route_key) on delete restrict,
  source_version text not null default 'phase5-v1',
  publication_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  check (publication_eligible=false)
);

create table if not exists drx_variant.market_products_v1 (
  product_id uuid primary key,
  product_identity_id uuid,
  clinical_variant_id uuid
    references drx_variant.clinical_variants_v1(clinical_variant_id) on delete restrict,

  binding_status text not null check (binding_status in ('BOUND','ANOMALY')),
  anomaly_codes text[] not null default '{}'::text[],

  composition_concept_id uuid,
  strength_hash text,
  strength_payload jsonb,
  form_key text,
  release_key text,
  route_key text,

  pdid_raw text,
  pdid_valid boolean not null,
  protocol_no text,
  registry_number integer,
  brand_name text,
  manufacturer text,
  marketing_authorization_holder text,
  packaging text,
  wholesale_price numeric,
  wholesale_with_margin numeric,
  retail_price numeric,
  ma_certificate text,
  product_status text,
  source_hash text,
  source_ref text not null default 'public.drugs + drx_stage.product_registry_v1',
  modeled_at timestamptz not null default now(),

  check (
    (binding_status='BOUND'
      and clinical_variant_id is not null
      and cardinality(anomaly_codes)=0)
    or
    (binding_status='ANOMALY'
      and clinical_variant_id is null
      and cardinality(anomaly_codes)>0)
  )
);

create index if not exists drx_variant_market_variant_idx
  on drx_variant.market_products_v1(clinical_variant_id)
  where clinical_variant_id is not null;

create index if not exists drx_variant_market_registry_idx
  on drx_variant.market_products_v1(registry_number);

create index if not exists drx_variant_market_pdid_idx
  on drx_variant.market_products_v1(pdid_raw)
  where pdid_valid=true;

create or replace view drx_variant.product_model_input_v1 as
with base as (
  select
    p.drug_id,
    p.product_identity_id,
    p.pdid_raw,
    p.pdid_valid,
    p.registry_number,
    p.trade_name,

    im.canonical_concept_id composition_concept_id,
    ic.concept_kind,

    n.normalized_form_key form_key,
    n.normalized_route_keys,
    n.route_status,
    n.normalized_release_key release_key,
    n.release_status,
    n.strength_parse,

    exists (
      select 1
      from drx_identity.combination_components_v1 cc
      join drx_identity.canonical_concepts_v1 c
        on c.concept_id=cc.component_concept_id
      where cc.combination_concept_id=im.canonical_concept_id
        and c.identity_status='REVIEW'
    ) composition_has_review_component,

    (select count(*)
     from public.product_ingredients_v1 pi
     where pi.source_drug_id=p.drug_id) ingredient_rows,

    (select count(*)
     from drx_identity.product_component_strength_v1 pcs
     where pcs.source_drug_id=p.drug_id) component_strength_rows,

    case
      when ic.concept_kind='COMBINATION' then (
        select jsonb_agg(
          jsonb_build_object(
            'ordinal',pcs.ingredient_ordinal,
            'concept_id',pcs.canonical_concept_id,
            'strength',drx_variant.normalized_strength_atom_v1(pcs.parsed_component_strength)
          )
          order by pcs.ingredient_ordinal
        )
        from drx_identity.product_component_strength_v1 pcs
        where pcs.source_drug_id=p.drug_id
      )
      else drx_variant.normalized_strength_atom_v1(n.strength_parse)
    end strength_payload,

    case
      when ic.concept_kind='COMBINATION' then (
        select count(*)
        from drx_identity.product_component_strength_v1 pcs
        where pcs.source_drug_id=p.drug_id
          and drx_variant.normalized_strength_atom_v1(pcs.parsed_component_strength) is null
      )
      else case
        when drx_variant.normalized_strength_atom_v1(n.strength_parse) is null then 1
        else 0
      end
    end unparsed_strength_atoms

  from drx_stage.product_registry_v1 p
  join drx_norm.product_normalization_v1 n on n.drug_id=p.drug_id
  left join drx_identity.source_concept_map_v1 im
    on im.source_namespace='STAGE'
   and im.source_concept_id=p.substance_concept_id
  left join drx_identity.canonical_concepts_v1 ic
    on ic.concept_id=im.canonical_concept_id
),
flags as (
  select
    b.*,
    case
      when b.route_status='EXACT' and cardinality(b.normalized_route_keys)=1
        then b.normalized_route_keys[1]
      else null
    end route_key,

    array_remove(array[
      case when b.composition_concept_id is null
        then 'IDENTITY_MAP_MISSING' end,

      case when b.composition_has_review_component
        then 'COMPOSITION_REVIEW_COMPONENT' end,

      case when b.form_key is null
        then 'FORM_UNMAPPED' end,

      case
        when b.route_status='MULTI_ROUTE' then 'ROUTE_MULTI'
        when b.route_status<>'EXACT' or cardinality(b.normalized_route_keys)<>1
          then 'ROUTE_UNRESOLVED'
      end,

      case
        when b.release_status='UNRESOLVED' or b.release_key is null
          then 'RELEASE_UNRESOLVED'
      end,

      case
        when b.concept_kind='COMBINATION' and b.ingredient_rows<2
          then 'COMBINATION_INGREDIENT_SET_INCOMPLETE'
      end,

      case
        when b.concept_kind='COMBINATION'
         and b.ingredient_rows>=2
         and b.component_strength_rows<>b.ingredient_rows
          then 'COMBINATION_STRENGTH_UNALIGNED'
      end,

      case
        when coalesce(b.unparsed_strength_atoms,1)>0
          then case
            when b.concept_kind='COMBINATION'
              then 'COMBINATION_STRENGTH_UNPARSED'
            else 'STRENGTH_UNPARSED'
          end
      end,

      case when not b.pdid_valid
        then 'PDID_INVALID' end,

      case when b.registry_number is null
        then 'REGISTRY_NUMBER_MISSING' end
    ],null)::text[] anomaly_codes
  from base b
),
hashed as (
  select
    f.*,
    case
      when f.strength_payload is not null
        then drx_variant.jsonb_sha256_v1(f.strength_payload)
      else null
    end strength_hash
  from flags f
)
select
  h.*,
  case
    when cardinality(h.anomaly_codes)=0 then
      h.composition_concept_id::text || '|' ||
      h.strength_hash || '|' ||
      h.form_key || '|' ||
      h.release_key || '|' ||
      h.route_key
    else null
  end variant_signature,
  cardinality(h.anomaly_codes)=0 eligible
from hashed h;

create or replace function public.drx_phase5_refresh_v1()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_variant,drx_identity,drx_norm,drx_stage,extensions
as $$
declare
  v_variants integer;
  v_products integer;
  v_bound integer;
  v_anomaly integer;
begin
  delete from drx_variant.market_products_v1;
  delete from drx_variant.clinical_variants_v1;

  insert into drx_variant.clinical_variants_v1(
    clinical_variant_id,
    variant_signature,
    composition_concept_id,
    strength_hash,
    strength_payload,
    form_key,
    release_key,
    route_key,
    source_version,
    publication_eligible
  )
  select
    extensions.uuid_generate_v5(
      extensions.uuid_ns_url(),
      'https://drx.local/clinical-variant/v1/' || i.variant_signature
    ),
    i.variant_signature,
    i.composition_concept_id,
    i.strength_hash,
    i.strength_payload,
    i.form_key,
    i.release_key,
    i.route_key,
    'phase5-v1',
    false
  from drx_variant.product_model_input_v1 i
  where i.eligible
  group by
    i.variant_signature,
    i.composition_concept_id,
    i.strength_hash,
    i.strength_payload,
    i.form_key,
    i.release_key,
    i.route_key;

  insert into drx_variant.market_products_v1(
    product_id,
    product_identity_id,
    clinical_variant_id,
    binding_status,
    anomaly_codes,
    composition_concept_id,
    strength_hash,
    strength_payload,
    form_key,
    release_key,
    route_key,
    pdid_raw,
    pdid_valid,
    protocol_no,
    registry_number,
    brand_name,
    manufacturer,
    marketing_authorization_holder,
    packaging,
    wholesale_price,
    wholesale_with_margin,
    retail_price,
    ma_certificate,
    product_status,
    source_hash,
    source_ref
  )
  select
    i.drug_id,
    i.product_identity_id,
    case when i.eligible then v.clinical_variant_id else null end,
    case when i.eligible then 'BOUND' else 'ANOMALY' end,
    i.anomaly_codes,
    i.composition_concept_id,
    i.strength_hash,
    i.strength_payload,
    i.form_key,
    i.release_key,
    i.route_key,
    i.pdid_raw,
    i.pdid_valid,
    d.protocol_no,
    i.registry_number,
    d.trade_name,
    d.manufacturer,
    d.marketing_authorization_holder,
    d.packaging,
    d.wholesale_price,
    d.wholesale_with_margin,
    d.retail_price,
    d.ma_certificate,
    d.product_status,
    d.source_hash,
    'public.drugs + drx_stage.product_registry_v1'
  from drx_variant.product_model_input_v1 i
  join public.drugs d on d.id=i.drug_id
  left join drx_variant.clinical_variants_v1 v
    on v.variant_signature=i.variant_signature;

  select count(*) into v_variants
  from drx_variant.clinical_variants_v1;

  select count(*) into v_products
  from drx_variant.market_products_v1;

  select count(*) into v_bound
  from drx_variant.market_products_v1
  where binding_status='BOUND';

  select count(*) into v_anomaly
  from drx_variant.market_products_v1
  where binding_status='ANOMALY';

  return jsonb_build_object(
    'variants',v_variants,
    'market_products',v_products,
    'bound_products',v_bound,
    'anomaly_products',v_anomaly,
    'publication_allowed',false
  );
end;
$$;

create or replace view drx_variant.product_anomaly_queue_v1 as
select
  m.product_id,
  m.registry_number,
  m.pdid_raw,
  m.brand_name,
  m.anomaly_codes,
  m.composition_concept_id,
  m.strength_payload,
  m.form_key,
  m.release_key,
  m.route_key
from drx_variant.market_products_v1 m
where m.binding_status='ANOMALY';

create or replace view drx_variant.variant_product_binding_v1 as
select
  m.product_id,
  m.clinical_variant_id,
  m.registry_number,
  m.pdid_raw,
  m.brand_name
from drx_variant.market_products_v1 m
where m.binding_status='BOUND';

create or replace view drx_variant.binding_mismatches_v1 as
select
  m.product_id,
  m.clinical_variant_id,
  (m.composition_concept_id is distinct from v.composition_concept_id) composition_mismatch,
  (m.strength_hash is distinct from v.strength_hash) strength_mismatch,
  (m.form_key is distinct from v.form_key) form_mismatch,
  (m.release_key is distinct from v.release_key) release_mismatch,
  (m.route_key is distinct from v.route_key) route_mismatch
from drx_variant.market_products_v1 m
join drx_variant.clinical_variants_v1 v
  on v.clinical_variant_id=m.clinical_variant_id
where m.binding_status='BOUND'
  and (
    m.composition_concept_id is distinct from v.composition_concept_id
    or m.strength_hash is distinct from v.strength_hash
    or m.form_key is distinct from v.form_key
    or m.release_key is distinct from v.release_key
    or m.route_key is distinct from v.route_key
  );

create or replace view drx_variant.clinical_variant_summary_v1 as
select
  v.clinical_variant_id,
  v.composition_concept_id,
  v.strength_payload,
  v.form_key,
  v.release_key,
  v.route_key,
  count(m.product_id) product_count,
  array_agg(m.product_id order by m.product_id) product_ids
from drx_variant.clinical_variants_v1 v
left join drx_variant.market_products_v1 m
  on m.clinical_variant_id=v.clinical_variant_id
group by
  v.clinical_variant_id,
  v.composition_concept_id,
  v.strength_payload,
  v.form_key,
  v.release_key,
  v.route_key;

create or replace function public.drx_phase5_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_variant,drx_stage,drx_raw
as $$
with metrics as (
  select
    (select count(*) from drx_stage.product_registry_v1) source_products,
    (select count(*) from drx_variant.market_products_v1) market_products,
    (select count(*) from drx_variant.market_products_v1 where binding_status='BOUND') bound_products,
    (select count(*) from drx_variant.market_products_v1 where binding_status='ANOMALY') anomaly_products,
    (select count(*) from drx_variant.clinical_variants_v1) clinical_variants,

    (select count(*) from (
      select variant_signature
      from drx_variant.clinical_variants_v1
      group by variant_signature
      having count(*)>1
    ) x) duplicate_variant_signatures,

    (select count(*)
     from drx_variant.market_products_v1 m
     left join drx_variant.clinical_variants_v1 v
       on v.clinical_variant_id=m.clinical_variant_id
     where m.binding_status='BOUND'
       and v.clinical_variant_id is null) orphan_product_bindings,

    (select count(*) from drx_variant.binding_mismatches_v1) binding_mismatches,

    (select count(*)
     from drx_stage.product_registry_v1 p
     left join drx_variant.market_products_v1 m on m.product_id=p.drug_id
     where m.product_id is null) unaccounted_source_products,

    (select count(*)
     from drx_variant.market_products_v1 m
     left join drx_stage.product_registry_v1 p on p.drug_id=m.product_id
     where p.drug_id is null) invented_market_product_ids,

    (select count(*)
     from drx_variant.clinical_variant_summary_v1
     where product_count=0) variants_without_products,

    (select count(*)
     from drx_variant.market_products_v1
     where binding_status='BOUND'
       and not pdid_valid) invalid_pdid_bound,

    (select count(*)
     from drx_variant.market_products_v1
     where binding_status='BOUND'
       and cardinality(anomaly_codes)>0) bound_with_anomalies,

    (select count(*)
     from drx_variant.market_products_v1
     where binding_status='ANOMALY'
       and cardinality(anomaly_codes)=0) anomaly_without_reason,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,

    (select count(*)
     from drx_raw.registry_generated_projection_diff_v1
     where active_substance_key_differs
        or global_search_text_differs
        or registry_search_text_differs) generated_true_diffs
)
select jsonb_build_object(
  'source_products',m.source_products,
  'market_products',m.market_products,
  'bound_products',m.bound_products,
  'anomaly_products',m.anomaly_products,
  'clinical_variants',m.clinical_variants,
  'duplicate_variant_signatures',m.duplicate_variant_signatures,
  'orphan_product_bindings',m.orphan_product_bindings,
  'binding_mismatches',m.binding_mismatches,
  'unaccounted_source_products',m.unaccounted_source_products,
  'invented_market_product_ids',m.invented_market_product_ids,
  'variants_without_products',m.variants_without_products,
  'invalid_pdid_bound',m.invalid_pdid_bound,
  'bound_with_anomalies',m.bound_with_anomalies,
  'anomaly_without_reason',m.anomaly_without_reason,
  'reconstruction_true_diffs',m.reconstruction_true_diffs,
  'generated_true_diffs',m.generated_true_diffs,
  'publication_allowed',false,
  'gate_pass',
    m.market_products=m.source_products
    and m.bound_products+m.anomaly_products=m.source_products
    and m.duplicate_variant_signatures=0
    and m.orphan_product_bindings=0
    and m.binding_mismatches=0
    and m.unaccounted_source_products=0
    and m.invented_market_product_ids=0
    and m.variants_without_products=0
    and m.invalid_pdid_bound=0
    and m.bound_with_anomalies=0
    and m.anomaly_without_reason=0
    and m.reconstruction_true_diffs=0
    and m.generated_true_diffs=0
)
from metrics m;
$$;

revoke all on all tables in schema drx_variant from public,anon,authenticated;
revoke all on all sequences in schema drx_variant from public,anon,authenticated;
revoke execute on all functions in schema drx_variant from public,anon,authenticated;
revoke all on schema drx_variant from public,anon,authenticated;

alter default privileges for role postgres in schema drx_variant
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_variant
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_variant
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_phase5_refresh_v1() from public,anon,authenticated;
revoke all on function public.drx_phase5_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase5_refresh_v1() to service_role;
grant execute on function public.drx_phase5_status_v1() to service_role;

comment on schema drx_variant is
  'DRx Phase 5 private clinical variant and market product layer.';
comment on table drx_variant.clinical_variants_v1 is
  'Clinical identity only: composition + normalized strength + exact form + release + route.';
comment on table drx_variant.market_products_v1 is
  'Commercial product layer; product_id always reuses the real public.drugs UUID.';
