-- DRx Phase 6B: exact product/variant classification.
-- ATC parents are syntactic code ancestors only; names are never invented.

create table if not exists drx_clinical.market_product_classification_v1 (
  product_id uuid primary key
    references drx_variant.market_products_v1(product_id) on delete restrict,
  atc_source_text text,
  atc_status text not null check (
    atc_status in ('VALID','PARTIAL','NOT_APPLICABLE','MISSING','MALFORMED')
  ),
  atc_level_1 text,
  atc_level_2 text,
  atc_level_3 text,
  atc_level_4 text,
  atc_level_5 text,
  source_class_text text,
  classification_source text not null default 'public.drugs',
  publication_eligible boolean not null default false,
  check (publication_eligible=false)
);

delete from drx_clinical.market_product_classification_v1;

insert into drx_clinical.market_product_classification_v1(
  product_id,atc_source_text,atc_status,
  atc_level_1,atc_level_2,atc_level_3,atc_level_4,atc_level_5,
  source_class_text,classification_source,publication_eligible
)
select
  m.product_id,
  nullif(btrim(d.atc_code),''),
  case
    when nullif(btrim(d.atc_code),'') is null then 'MISSING'
    when upper(btrim(d.atc_code))='N/A' then 'NOT_APPLICABLE'
    when btrim(d.atc_code) ~ '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$' then 'VALID'
    when btrim(d.atc_code) ~ '^[A-Z]([0-9]{2}([A-Z]([A-Z])?)?)?$' then 'PARTIAL'
    else 'MALFORMED'
  end,
  case when btrim(coalesce(d.atc_code,'')) ~ '^[A-Z]' then left(btrim(d.atc_code),1) end,
  case when btrim(coalesce(d.atc_code,'')) ~ '^[A-Z][0-9]{2}' then left(btrim(d.atc_code),3) end,
  case when btrim(coalesce(d.atc_code,'')) ~ '^[A-Z][0-9]{2}[A-Z]' then left(btrim(d.atc_code),4) end,
  case when btrim(coalesce(d.atc_code,'')) ~ '^[A-Z][0-9]{2}[A-Z]{2}' then left(btrim(d.atc_code),5) end,
  case when btrim(coalesce(d.atc_code,'')) ~ '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$'
    then btrim(d.atc_code) end,
  nullif(btrim(d.drug_class),''),
  'public.drugs',
  false
from drx_variant.market_products_v1 m
join public.drugs d on d.id=m.product_id;

create table if not exists drx_clinical.variant_classification_v1 (
  clinical_variant_id uuid primary key
    references drx_variant.clinical_variants_v1(clinical_variant_id) on delete restrict,
  atc_codes text[] not null default '{}'::text[],
  atc_status text not null check (atc_status in ('EXACT','CONFLICT','MISSING')),
  atc_level_1 text,
  atc_level_2 text,
  atc_level_3 text,
  atc_level_4 text,
  atc_level_5 text,
  source_class_values text[] not null default '{}'::text[],
  class_status text not null check (class_status in ('EXACT','CONFLICT','MISSING')),
  source_class_text text,
  publication_eligible boolean not null default false,
  check (publication_eligible=false)
);

delete from drx_clinical.variant_classification_v1;

with per as (
  select
    m.clinical_variant_id,
    coalesce(
      array_agg(distinct c.atc_source_text order by c.atc_source_text)
        filter(where c.atc_source_text is not null and c.atc_status in ('VALID','PARTIAL')),
      '{}'::text[]
    ) atcs,
    coalesce(
      array_agg(distinct c.source_class_text order by c.source_class_text)
        filter(where c.source_class_text is not null),
      '{}'::text[]
    ) classes
  from drx_variant.market_products_v1 m
  join drx_clinical.market_product_classification_v1 c on c.product_id=m.product_id
  where m.binding_status='BOUND'
  group by m.clinical_variant_id
),
resolved as (
  select
    *,
    cardinality(atcs) atc_count,
    cardinality(classes) class_count,
    case when cardinality(atcs)=1 then atcs[1] end exact_atc
  from per
)
insert into drx_clinical.variant_classification_v1(
  clinical_variant_id,atc_codes,atc_status,
  atc_level_1,atc_level_2,atc_level_3,atc_level_4,atc_level_5,
  source_class_values,class_status,source_class_text,publication_eligible
)
select
  clinical_variant_id,
  atcs,
  case
    when atc_count=1 then 'EXACT'
    when atc_count>1 then 'CONFLICT'
    else 'MISSING'
  end,
  case when exact_atc ~ '^[A-Z]' then left(exact_atc,1) end,
  case when exact_atc ~ '^[A-Z][0-9]{2}' then left(exact_atc,3) end,
  case when exact_atc ~ '^[A-Z][0-9]{2}[A-Z]' then left(exact_atc,4) end,
  case when exact_atc ~ '^[A-Z][0-9]{2}[A-Z]{2}' then left(exact_atc,5) end,
  case when exact_atc ~ '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$' then exact_atc end,
  classes,
  case
    when class_count=1 then 'EXACT'
    when class_count>1 then 'CONFLICT'
    else 'MISSING'
  end,
  case when class_count=1 then classes[1] end,
  false
from resolved;

create or replace view drx_clinical.atc_conflict_review_v1 as
select
  v.clinical_variant_id,
  v.atc_codes,
  v.atc_status,
  v.source_class_values,
  v.class_status,
  array_agg(m.product_id order by m.product_id) product_ids
from drx_clinical.variant_classification_v1 v
join drx_variant.market_products_v1 m
  on m.clinical_variant_id=v.clinical_variant_id
where v.atc_status='CONFLICT' or v.class_status='CONFLICT'
group by
  v.clinical_variant_id,v.atc_codes,v.atc_status,v.source_class_values,v.class_status;

revoke all on all tables in schema drx_clinical from public,anon,authenticated;
revoke all on schema drx_clinical from public,anon,authenticated;
