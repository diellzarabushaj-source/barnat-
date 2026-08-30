create table if not exists drx_dose.exact_market_product_source_captures_v1 (
  capture_id uuid primary key default gen_random_uuid(),
  discovery_id uuid not null
    references drx_dose.phase8_exact_source_discovery_v1(discovery_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_key text not null,
  source_url text not null check (source_url ~ '^https://'),
  final_url text not null check (final_url ~ '^https://'),
  external_registry_id text not null,
  trade_name text not null,
  generic_name text not null,
  atc_code text not null,
  pharmaceutical_form text not null,
  strength text not null,
  packaging text not null,
  composition_text text not null,
  dosage_text text not null,
  manufacturer_text text not null,
  ma_holder_text text not null,
  authorization_number text not null,
  authorization_date date not null,
  raw_sha256 text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null,
  capture_status text not null default 'CAPTURED'
    check (capture_status in ('CAPTURED','REJECTED')),
  automatic_verification_allowed boolean not null default false
    check (automatic_verification_allowed=false),
  created_at timestamptz not null default now(),
  unique(discovery_id,snapshot_id),
  unique(drug_id,snapshot_id),
  check (snapshot_id=raw_sha256),
  check (nullif(btrim(dosage_text),'') is not null),
  check (nullif(btrim(composition_text),'') is not null)
);

create index if not exists drx_exact_market_capture_snapshot_idx
  on drx_dose.exact_market_product_source_captures_v1(snapshot_id);

create table if not exists drx_dose.exact_market_product_source_bindings_v1 (
  binding_id uuid primary key default gen_random_uuid(),
  discovery_id uuid not null
    references drx_dose.phase8_exact_source_discovery_v1(discovery_id) on delete restrict,
  drug_id uuid not null references public.drugs(id) on delete restrict,
  snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  binding_status text not null default 'REVIEW'
    check (binding_status in ('REVIEW','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique(discovery_id,snapshot_id),
  unique(drug_id,snapshot_id),
  check (
    binding_status<>'VERIFIED'
    or (
      nullif(btrim(reviewed_by),'') is not null
      and reviewed_at is not null
      and nullif(btrim(review_note),'') is not null
    )
  )
);

create index if not exists drx_exact_market_binding_drug_idx
  on drx_dose.exact_market_product_source_bindings_v1(drug_id);
create index if not exists drx_exact_market_binding_snapshot_idx
  on drx_dose.exact_market_product_source_bindings_v1(snapshot_id);

create or replace function drx_dose.guard_exact_market_source_binding_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
begin
  if new.binding_status<>'VERIFIED' then
    return new;
  end if;

  if not exists (
    select 1
    from drx_dose.exact_market_product_source_captures_v1 c
    where c.discovery_id=new.discovery_id
      and c.drug_id=new.drug_id
      and c.snapshot_id=new.snapshot_id
      and c.capture_status='CAPTURED'
      and c.automatic_verification_allowed=false
  ) then
    raise exception 'Exact market-product binding verification blocked: immutable captured source is missing';
  end if;

  if nullif(btrim(new.reviewed_by),'') is null
     or new.reviewed_at is null
     or nullif(btrim(new.review_note),'') is null then
    raise exception 'Exact market-product binding verification blocked: explicit reviewer decision is incomplete';
  end if;

  return new;
end;
$$;

drop trigger if exists drx_exact_market_source_binding_guard
  on drx_dose.exact_market_product_source_bindings_v1;

create trigger drx_exact_market_source_binding_guard
before insert or update of
  binding_status,discovery_id,drug_id,snapshot_id,reviewed_by,reviewed_at,review_note
on drx_dose.exact_market_product_source_bindings_v1
for each row execute function drx_dose.guard_exact_market_source_binding_v1();

create or replace function public.drx_phase8_ingest_exact_source_v1(p_capture jsonb)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_discovery drx_dose.phase8_exact_source_discovery_v1%rowtype;
  v_source_key text;
  v_capture_id uuid;
  v_binding_id uuid;
  v_drug_id uuid := (p_capture->>'drugId')::uuid;
  v_source_url text := p_capture->>'sourceUrl';
  v_final_url text := p_capture->>'finalUrl';
  v_raw_sha256 text := lower(p_capture->>'rawSha256');
  v_content_length bigint := (p_capture->>'contentLength')::bigint;
  v_content_type text := p_capture->>'contentType';
  v_etag text := p_capture->>'etag';
  v_last_modified text := p_capture->>'lastModified';
  v_archive_locator text := p_capture->>'archiveLocator';
  v_fetched_at timestamptz := coalesce((p_capture->>'fetchedAt')::timestamptz,now());
  v_trade_name text := p_capture->>'tradeName';
  v_generic_name text := p_capture->>'genericName';
  v_atc_code text := p_capture->>'atcCode';
  v_form text := p_capture->>'pharmaceuticalForm';
  v_strength text := p_capture->>'strength';
  v_packaging text := p_capture->>'packaging';
  v_composition text := p_capture->>'compositionText';
  v_dosage text := p_capture->>'dosageText';
  v_manufacturer text := p_capture->>'manufacturerText';
  v_mah text := p_capture->>'maHolderText';
  v_auth_number text := p_capture->>'authorizationNumber';
  v_auth_date date := (p_capture->>'authorizationDate')::date;
  v_parser_version text := p_capture->>'parserVersion';
begin
  if coalesce(p_capture->>'captureVersion','')<>'drx-phase8-exact-registry-v1' then
    raise exception 'Phase 8 exact source ingestion blocked: unsupported capture payload version';
  end if;

  select *
  into v_discovery
  from drx_dose.phase8_exact_source_discovery_v1
  where drug_id=v_drug_id
    and lower(btrim(source_url))=lower(btrim(v_source_url))
    and identity_match_status='EXACT_PRODUCT_CANDIDATE'
  for update;

  if not found then
    raise exception 'Phase 8 exact source ingestion blocked: exact discovery row not found';
  end if;

  if v_raw_sha256 is null or v_raw_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Phase 8 exact source ingestion blocked: invalid raw SHA-256';
  end if;

  if v_content_length is null or v_content_length<=0 then
    raise exception 'Phase 8 exact source ingestion blocked: empty source body';
  end if;

  if v_final_url is null
     or v_final_url !~ '^https://lekovi[.]zdravstvo[.]gov[.]mk/' then
    raise exception 'Phase 8 exact source ingestion blocked: final URL is outside official MK medicines registry';
  end if;

  if coalesce(nullif(btrim(v_trade_name),''), '')=''
     or coalesce(nullif(btrim(v_generic_name),''), '')=''
     or coalesce(nullif(btrim(v_atc_code),''), '')=''
     or coalesce(nullif(btrim(v_form),''), '')=''
     or coalesce(nullif(btrim(v_strength),''), '')=''
     or coalesce(nullif(btrim(v_packaging),''), '')=''
     or coalesce(nullif(btrim(v_composition),''), '')=''
     or coalesce(nullif(btrim(v_dosage),''), '')=''
     or coalesce(nullif(btrim(v_manufacturer),''), '')=''
     or coalesce(nullif(btrim(v_mah),''), '')=''
     or coalesce(nullif(btrim(v_auth_number),''), '')=''
     or v_auth_date is null
     or coalesce(nullif(btrim(v_parser_version),''), '')='' then
    raise exception 'Phase 8 exact source ingestion blocked: required extracted identity/evidence field missing';
  end if;

  v_source_key := 'mk-moh-registry-' || v_discovery.external_registry_id;

  insert into public.dose_source_snapshots_v3(
    snapshot_id,source_key,source_url,final_url,source_tier,authority,jurisdiction,
    document_type,document_version,document_date,fetched_at,content_type,content_length,
    raw_sha256,etag,last_modified,parser_version,archive_locator
  )
  values(
    v_raw_sha256,v_source_key,v_discovery.source_url,v_final_url,
    'NON_EU_REGULATOR',v_discovery.source_authority,v_discovery.source_jurisdiction,
    'official_medicines_registry_product_record',
    'registry-entry-' || v_discovery.external_registry_id,
    v_auth_date,v_fetched_at,v_content_type,v_content_length,
    v_raw_sha256,v_etag,v_last_modified,v_parser_version,v_archive_locator
  )
  on conflict (snapshot_id) do nothing;

  if not exists (
    select 1
    from public.dose_source_snapshots_v3 s
    where s.snapshot_id=v_raw_sha256
      and lower(btrim(s.source_url))=lower(btrim(v_discovery.source_url))
      and s.source_tier='NON_EU_REGULATOR'
  ) then
    raise exception 'Phase 8 exact source ingestion blocked: snapshot hash already belongs to incompatible source metadata';
  end if;

  insert into drx_dose.exact_market_product_source_captures_v1(
    discovery_id,drug_id,snapshot_id,source_key,source_url,final_url,external_registry_id,
    trade_name,generic_name,atc_code,pharmaceutical_form,strength,packaging,
    composition_text,dosage_text,manufacturer_text,ma_holder_text,
    authorization_number,authorization_date,raw_sha256,parser_version,
    capture_status,automatic_verification_allowed
  )
  values(
    v_discovery.discovery_id,v_drug_id,v_raw_sha256,v_source_key,
    v_discovery.source_url,v_final_url,v_discovery.external_registry_id,
    v_trade_name,v_generic_name,v_atc_code,v_form,v_strength,v_packaging,
    v_composition,v_dosage,v_manufacturer,v_mah,
    v_auth_number,v_auth_date,v_raw_sha256,v_parser_version,
    'CAPTURED',false
  )
  on conflict (discovery_id,snapshot_id) do update set
    final_url=excluded.final_url,
    trade_name=excluded.trade_name,
    generic_name=excluded.generic_name,
    atc_code=excluded.atc_code,
    pharmaceutical_form=excluded.pharmaceutical_form,
    strength=excluded.strength,
    packaging=excluded.packaging,
    composition_text=excluded.composition_text,
    dosage_text=excluded.dosage_text,
    manufacturer_text=excluded.manufacturer_text,
    ma_holder_text=excluded.ma_holder_text,
    authorization_number=excluded.authorization_number,
    authorization_date=excluded.authorization_date,
    parser_version=excluded.parser_version,
    capture_status='CAPTURED',
    automatic_verification_allowed=false
  returning capture_id into v_capture_id;

  insert into drx_dose.exact_market_product_source_bindings_v1(
    discovery_id,drug_id,snapshot_id,binding_status
  )
  values(v_discovery.discovery_id,v_drug_id,v_raw_sha256,'REVIEW')
  on conflict (discovery_id,snapshot_id) do update set
    binding_status=case
      when drx_dose.exact_market_product_source_bindings_v1.binding_status='REJECTED'
        then 'REJECTED'
      else drx_dose.exact_market_product_source_bindings_v1.binding_status
    end
  returning binding_id into v_binding_id;

  update drx_dose.phase8_exact_source_discovery_v1
  set source_snapshot_id=v_raw_sha256,
      snapshot_status='INGESTED',
      clinical_evidence_status='REGISTRY_DOSAGE_PRESENT',
      publication_eligible=false,
      checked_at=v_fetched_at
  where discovery_id=v_discovery.discovery_id;

  return jsonb_build_object(
    'discoveryId',v_discovery.discovery_id,
    'captureId',v_capture_id,
    'bindingId',v_binding_id,
    'snapshotId',v_raw_sha256,
    'sourceKey',v_source_key,
    'snapshotStatus','INGESTED',
    'bindingStatus','REVIEW',
    'automaticVerificationAllowed',false,
    'publicationAllowed',false
  );
end;
$$;

create or replace view drx_dose.phase8_pilot_readiness_v1 as
select
  c.drug_id,
  c.product_key v2_product_key,
  c.trade_name,
  c.active_substance,
  c.pharmaceutical_form,
  c.route,
  c.patient_group,
  c.published_rule_bindings,
  c.published_rule_keys,
  d.discovery_id,
  d.v2_source_key,
  d.source_url,
  d.source_authority,
  d.source_jurisdiction,
  d.source_tier,
  d.external_registry_id,
  d.identity_match_status,
  d.identity_match_dimensions,
  d.snapshot_status,
  d.source_snapshot_id,
  d.clinical_evidence_status,
  exists (
    select 1
    from drx_dose.exact_market_product_source_bindings_v1 b
    where b.discovery_id=d.discovery_id
      and b.drug_id=c.drug_id
      and b.snapshot_id=d.source_snapshot_id
      and b.binding_status='VERIFIED'
  ) exact_product_binding_verified,
  case
    when d.discovery_id is null then 'NO_EXACT_SOURCE_DISCOVERY'
    when d.identity_match_status<>'EXACT_PRODUCT_CANDIDATE' then 'IDENTITY_REVIEW_REQUIRED'
    when d.snapshot_status<>'INGESTED' then 'SOURCE_SNAPSHOT_MISSING'
    when not exists (
      select 1
      from drx_dose.exact_market_product_source_bindings_v1 b
      where b.discovery_id=d.discovery_id
        and b.drug_id=c.drug_id
        and b.snapshot_id=d.source_snapshot_id
        and b.binding_status='VERIFIED'
    ) then 'EXACT_PRODUCT_REVIEW_PENDING'
    else 'READY_FOR_V3_BUILD'
  end pilot_status,
  false::boolean automatic_publication_allowed
from drx_dose.phase8_published_v2_comparator_v1 c
left join drx_dose.phase8_exact_source_discovery_v1 d
  on d.drug_id=c.drug_id
 and d.v2_product_key=c.product_key;

create or replace function drx_dose.guard_v3_product_publication_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose,drx_clinical,drx_variant
as $$
declare
  v_expected_variant uuid;
begin
  if new.editorial_status not in ('verified','published') then
    return new;
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

  if exists (
    select 1
    from drx_dose.exact_market_product_source_bindings_v1 b
    join drx_dose.exact_market_product_source_captures_v1 c
      on c.discovery_id=b.discovery_id
     and c.drug_id=b.drug_id
     and c.snapshot_id=b.snapshot_id
    join public.dose_source_snapshots_v3 s on s.snapshot_id=b.snapshot_id
    where b.drug_id=new.drug_id
      and b.snapshot_id=new.source_snapshot_id
      and b.binding_status='VERIFIED'
      and c.capture_status='CAPTURED'
      and c.automatic_verification_allowed=false
      and s.source_key=new.source_key
      and s.source_tier='NON_EU_REGULATOR'
      and nullif(btrim(b.reviewed_by),'') is not null
      and b.reviewed_at is not null
  ) then
    return new;
  end if;

  if exists (
    select 1
    from drx_clinical.source_documents_v1 d
    join drx_dose.product_source_bindings_v1 b on b.source_document_id=d.source_document_id
    join drx_dose.product_source_exact_evidence_v1 e on e.binding_id=b.binding_id
    where d.snapshot_id=new.source_snapshot_id
      and d.source_key=new.source_key
      and b.drug_id=new.drug_id
      and b.clinical_variant_id=v_expected_variant
      and b.binding_status='VERIFIED'
      and b.binding_scope='EXACT_MARKET_PRODUCT'
      and nullif(btrim(b.decided_by),'') is not null
      and b.reviewed_at is not null
      and nullif(btrim(e.reviewed_by),'') is not null
      and e.reviewed_at is not null
  ) then
    return new;
  end if;

  raise exception 'DRx V3 product publication blocked: no verified exact market-product source binding';
end;
$$;

revoke all on all tables in schema drx_dose from public,anon,authenticated;
revoke execute on all functions in schema drx_dose from public,anon,authenticated;
revoke all on schema drx_dose from public,anon,authenticated;

revoke all on function public.drx_phase8_ingest_exact_source_v1(jsonb)
  from public,anon,authenticated;
grant execute on function public.drx_phase8_ingest_exact_source_v1(jsonb)
  to service_role;

comment on table drx_dose.exact_market_product_source_captures_v1 is
  'Immutable Phase 8 exact-market-product source capture metadata/extractions linked to raw SHA-256 snapshots. Capture never implies verification.';
comment on table drx_dose.exact_market_product_source_bindings_v1 is
  'Explicit review state for exact market-product source binding. VERIFIED requires immutable capture plus reviewer decision.';
comment on function public.drx_phase8_ingest_exact_source_v1(jsonb) is
  'Service-only exact-source ingestion RPC. Stores raw snapshot metadata and review-only capture/binding; never auto-verifies or publishes.';
