-- DRx Phase 8F: explicit exact-market-product evidence gate and review packets.
-- Reference SmPC evidence is never sufficient by itself to verify a market product.

alter table drx_dose.product_source_bindings_v1
  add column if not exists binding_scope text not null default 'REFERENCE_SUBSTANCE_LABEL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='product_source_bindings_v1_scope_check'
      and conrelid='drx_dose.product_source_bindings_v1'::regclass
  ) then
    alter table drx_dose.product_source_bindings_v1
      add constraint product_source_bindings_v1_scope_check
      check (binding_scope in (
        'REFERENCE_SUBSTANCE_LABEL',
        'EXACT_MARKET_PRODUCT'
      ));
  end if;
end
$$;

update drx_dose.product_source_bindings_v1
set binding_scope='REFERENCE_SUBSTANCE_LABEL'
where match_note='AUTO_CANDIDATE_EXACT_SOURCE_IDENTITY; NOT_VERIFIED'
  and binding_status='REVIEW';

create table if not exists drx_dose.product_source_exact_evidence_v1 (
  evidence_id uuid primary key default gen_random_uuid(),
  binding_id uuid not null unique
    references drx_dose.product_source_bindings_v1(binding_id) on delete cascade,
  source_raw_sha256 text not null check (source_raw_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_url text not null check (evidence_url ~ '^https://'),
  source_product_identifier text not null check (nullif(btrim(source_product_identifier),'') is not null),
  source_trade_name text not null check (nullif(btrim(source_trade_name),'') is not null),
  source_authorization_holder text,
  source_manufacturer text,
  evidence_note text not null check (nullif(btrim(evidence_note),'') is not null),
  reviewed_by text not null check (nullif(btrim(reviewed_by),'') is not null),
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists drx_dose_exact_evidence_binding_idx
  on drx_dose.product_source_exact_evidence_v1(binding_id);

create or replace function drx_dose.guard_exact_product_evidence_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical
as $$
declare
  v_source_document_id uuid;
  v_raw_sha256 text;
  v_source_url text;
  v_final_url text;
begin
  select
    b.source_document_id,
    d.raw_sha256,
    d.source_url,
    d.final_url
  into
    v_source_document_id,
    v_raw_sha256,
    v_source_url,
    v_final_url
  from drx_dose.product_source_bindings_v1 b
  join drx_clinical.source_documents_v1 d
    on d.source_document_id=b.source_document_id
  where b.binding_id=new.binding_id;

  if v_source_document_id is null then
    raise exception 'Exact product evidence blocked: binding/source document not found';
  end if;

  if new.source_raw_sha256 is distinct from v_raw_sha256 then
    raise exception 'Exact product evidence blocked: source raw hash mismatch';
  end if;

  if lower(btrim(new.evidence_url)) is distinct from lower(btrim(v_source_url))
     and (
       v_final_url is null
       or lower(btrim(new.evidence_url)) is distinct from lower(btrim(v_final_url))
     ) then
    raise exception 'Exact product evidence blocked: evidence URL is not the bound source document URL';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_exact_product_evidence_guard
  on drx_dose.product_source_exact_evidence_v1;

create trigger drx_exact_product_evidence_guard
before insert or update
on drx_dose.product_source_exact_evidence_v1
for each row execute function drx_dose.guard_exact_product_evidence_v1();

create or replace function drx_dose.guard_product_source_binding_verification_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  if new.binding_status<>'VERIFIED' then
    return new;
  end if;

  if new.binding_scope<>'EXACT_MARKET_PRODUCT' then
    raise exception 'Product-source verification blocked: binding scope is not EXACT_MARKET_PRODUCT';
  end if;

  if new.clinical_variant_id is null
     or nullif(btrim(new.decided_by),'') is null
     or new.reviewed_at is null
     or nullif(btrim(new.match_note),'') is null then
    raise exception 'Product-source verification blocked: explicit reviewer decision is incomplete';
  end if;

  if not exists (
    select 1
    from drx_dose.product_source_exact_evidence_v1 e
    where e.binding_id=new.binding_id
      and nullif(btrim(e.reviewed_by),'') is not null
      and e.reviewed_at is not null
  ) then
    raise exception 'Product-source verification blocked: exact market-product evidence is missing';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_product_source_binding_verification_guard
  on drx_dose.product_source_bindings_v1;

create trigger drx_product_source_binding_verification_guard
before insert or update of
  binding_status,binding_scope,clinical_variant_id,decided_by,reviewed_at,match_note
on drx_dose.product_source_bindings_v1
for each row execute function drx_dose.guard_product_source_binding_verification_v1();

-- Defense in depth for V3 product verification/publication.
create or replace function drx_dose.guard_v3_product_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical,drx_variant
as $$
declare
  v_source_document_id uuid;
  v_expected_variant uuid;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
  end if;

  select d.source_document_id
  into v_source_document_id
  from drx_clinical.source_documents_v1 d
  where d.snapshot_id=new.source_snapshot_id
    and d.source_key=new.source_key
  limit 1;

  if v_source_document_id is null then
    raise exception 'DRx V3 product publication blocked: source snapshot is not in current regulatory provenance';
  end if;

  select m.clinical_variant_id
  into v_expected_variant
  from drx_variant.market_products_v1 m
  where m.product_id=new.drug_id
    and m.binding_status='BOUND'
  limit 1;

  if v_expected_variant is null then
    raise exception 'DRx V3 product publication blocked: market product is not bound to a strict clinical variant';
  end if;

  if not exists (
    select 1
    from drx_dose.product_source_bindings_v1 b
    join drx_dose.product_source_exact_evidence_v1 e
      on e.binding_id=b.binding_id
    where b.drug_id=new.drug_id
      and b.source_document_id=v_source_document_id
      and b.clinical_variant_id=v_expected_variant
      and b.binding_status='VERIFIED'
      and b.binding_scope='EXACT_MARKET_PRODUCT'
      and nullif(btrim(b.decided_by),'') is not null
      and b.reviewed_at is not null
      and nullif(btrim(e.reviewed_by),'') is not null
      and e.reviewed_at is not null
  ) then
    raise exception 'DRx V3 product publication blocked: no exact-market-product verified source binding';
  end if;

  return new;
end;
$$;

create or replace view drx_dose.product_source_review_packet_v1 as
select
  b.binding_id,
  b.binding_status,
  b.binding_scope,
  b.match_note,
  b.decided_by,
  b.reviewed_at,

  m.product_id drug_id,
  m.clinical_variant_id,
  m.registry_number,
  m.pdid_raw pdid,
  m.brand_name trade_name,
  m.manufacturer,
  m.marketing_authorization_holder,
  m.packaging,
  m.product_status,
  m.strength_payload,
  m.form_key,
  m.route_key,

  r.approved_population,
  r.active_substance,
  r.atc_code,
  r.pharmaceutical_form,

  d.source_document_id,
  d.source_key,
  d.snapshot_id,
  d.authority_key,
  d.source_url,
  d.final_url,
  d.document_version,
  d.document_date,
  d.raw_sha256,
  d.section_2_sha256,
  d.section_4_1_sha256,
  d.section_4_2_sha256,

  ev.evidence_tier,
  ev.strength_literal_match,
  ev.route_literal_match,
  ev.form_literal_match,

  s2.section_text section_2_text,
  s41.section_text section_4_1_text,
  s42.section_text section_4_2_text,

  exact.evidence_id exact_evidence_id,
  exact.source_product_identifier,
  exact.source_trade_name exact_source_trade_name,
  exact.source_authorization_holder exact_source_authorization_holder,
  exact.source_manufacturer exact_source_manufacturer,
  exact.evidence_note exact_evidence_note,
  exact.reviewed_by exact_evidence_reviewed_by,
  exact.reviewed_at exact_evidence_reviewed_at,

  case
    when exact.evidence_id is not null
      then 'EXACT_PRODUCT_EVIDENCE_PRESENT'
    when ev.evidence_tier='SUBSTANCE_STRENGTH_ROUTE_FORM'
      then 'STRONG_REFERENCE_PRESENTATION_MATCH'
    when ev.evidence_tier in ('SUBSTANCE_STRENGTH_ROUTE','SUBSTANCE_STRENGTH_FORM')
      then 'PARTIAL_REFERENCE_PRESENTATION_MATCH'
    else 'REFERENCE_LABEL_ONLY'
  end review_readiness,

  (exact.evidence_id is not null)::boolean exact_product_evidence_present,
  false::boolean automatic_verification_allowed

from drx_dose.product_source_bindings_v1 b
join drx_variant.market_products_v1 m
  on m.product_id=b.drug_id
join public.drugs r
  on r.id=b.drug_id
join drx_clinical.source_documents_v1 d
  on d.source_document_id=b.source_document_id
left join drx_dose.product_source_review_evidence_v1 ev
  on ev.binding_id=b.binding_id
left join drx_clinical.source_section_evidence_v1 s2
  on s2.source_document_id=d.source_document_id
 and s2.section_key='qualitative_and_quantitative_composition'
left join drx_clinical.source_section_evidence_v1 s41
  on s41.source_document_id=d.source_document_id
 and s41.section_key='therapeutic_indications'
left join drx_clinical.source_section_evidence_v1 s42
  on s42.source_document_id=d.source_document_id
 and s42.section_key='posology_and_method_of_administration'
left join drx_dose.product_source_exact_evidence_v1 exact
  on exact.binding_id=b.binding_id;

create or replace view drx_dose.phase8_pilot_review_queue_v1 as
select *
from drx_dose.product_source_review_packet_v1
where binding_status='REVIEW'
order by
  case review_readiness
    when 'EXACT_PRODUCT_EVIDENCE_PRESENT' then 1
    when 'STRONG_REFERENCE_PRESENTATION_MATCH' then 2
    when 'PARTIAL_REFERENCE_PRESENTATION_MATCH' then 3
    else 4
  end,
  source_key,
  registry_number nulls last,
  drug_id;

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke execute on all functions in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

comment on column drx_dose.product_source_bindings_v1.binding_scope is
  'REFERENCE_SUBSTANCE_LABEL is review evidence only. VERIFIED requires EXACT_MARKET_PRODUCT plus exact evidence.';
comment on table drx_dose.product_source_exact_evidence_v1 is
  'Explicit reviewer evidence that the bound regulatory source is the exact marketed product; raw hash and URL must match the source snapshot.';
comment on view drx_dose.product_source_review_packet_v1 is
  'Private Phase 8 review packet: product metadata + exact source sections + literal presentation evidence. Never auto-verifies.';
