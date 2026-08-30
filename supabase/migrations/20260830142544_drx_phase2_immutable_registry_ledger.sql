-- DRx strict Phase 2: immutable registry source ledger, correction ledger,
-- anomaly queue, deterministic reconstruction, and service-only ingestion RPCs.
-- Raw source rows are append-only. Existing enriched public.drugs rows are
-- snapshotted immutably beside the exact source payload so the Phase 2 baseline
-- can be reconstructed without pretending editorial/enrichment data came from
-- the source workbook.

create schema if not exists drx_raw;
revoke all on schema drx_raw from public, anon, authenticated;

create table if not exists drx_raw.registry_import_batches_v1 (
  batch_id uuid primary key default gen_random_uuid(),
  batch_kind text not null check (batch_kind in ('REGISTRY_RAW','LEGACY_EDITORIAL','CORRECTION_SHEET')),
  source_type text not null,
  source_ref text not null,
  source_revision text,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_count integer not null check (source_row_count >= 0),
  preserved_row_count integer not null default 0 check (preserved_row_count >= 0),
  anomaly_row_count integer not null default 0 check (anomaly_row_count >= 0),
  status text not null default 'OPEN' check (status in ('OPEN','FINALIZED','FAILED')),
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (batch_kind, source_ref, source_sha256)
);

create table if not exists drx_raw.registry_rows_v1 (
  raw_row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references drx_raw.registry_import_batches_v1(batch_id) on delete restrict,
  source_row_number integer not null check (source_row_number >= 1),
  source_drug_id uuid,
  raw_registry_number text,
  raw_pdid text,
  raw_protocol_no text,
  raw_trade_name text,
  raw_active_substance text,
  raw_atc_code text,
  raw_strength text,
  raw_pharmaceutical_form text,
  raw_packaging text,
  raw_marketing_authorization_holder text,
  raw_manufacturer text,
  raw_ma_certificate text,
  raw_payload jsonb not null,
  baseline_drug_payload jsonb,
  raw_sha256 text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  unique (batch_id, source_row_number)
);

create index if not exists registry_rows_v1_batch_idx
  on drx_raw.registry_rows_v1(batch_id);
create index if not exists registry_rows_v1_source_drug_idx
  on drx_raw.registry_rows_v1(source_drug_id);
create index if not exists registry_rows_v1_registry_number_idx
  on drx_raw.registry_rows_v1(raw_registry_number);
create index if not exists registry_rows_v1_pdid_idx
  on drx_raw.registry_rows_v1(raw_pdid);

create table if not exists drx_raw.registry_correction_source_rows_v1 (
  source_row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references drx_raw.registry_import_batches_v1(batch_id) on delete restrict,
  source_row_number integer not null check (source_row_number >= 1),
  correction_id text not null,
  raw_payload jsonb not null,
  source_metadata jsonb not null default '{}'::jsonb,
  raw_sha256 text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  unique (batch_id, source_row_number)
);

create index if not exists registry_correction_source_rows_v1_batch_idx
  on drx_raw.registry_correction_source_rows_v1(batch_id);
create index if not exists registry_correction_source_rows_v1_correction_idx
  on drx_raw.registry_correction_source_rows_v1(correction_id);

create table if not exists drx_raw.registry_corrections_v1 (
  correction_id text primary key,
  source_row_id uuid not null references drx_raw.registry_correction_source_rows_v1(source_row_id) on delete restrict,
  target_raw_row_id uuid not null references drx_raw.registry_rows_v1(raw_row_id) on delete restrict,
  source_drug_id uuid not null,
  field_name text not null,
  field_code text not null check (field_code in (
    'ACTIVE_SUBSTANCE','TRADE_NAME','STRENGTH','ATC_CODE','PHARMACEUTICAL_FORM',
    'SUBSTANCE_STRENGTH_ORDER','ACTIVE_SUBSTANCE_AND_STRENGTH'
  )),
  raw_value text not null,
  corrected_value text not null,
  corrected_patch jsonb not null,
  reason text not null,
  evidence_urls text[] not null default '{}'::text[],
  status text not null,
  reviewer text not null,
  reviewed_at date not null,
  match_score integer not null check (match_score > 0),
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default now(),
  check (status <> 'VERIFIKUAR' or cardinality(evidence_urls) > 0)
);

create index if not exists registry_corrections_v1_source_drug_idx
  on drx_raw.registry_corrections_v1(source_drug_id);
create index if not exists registry_corrections_v1_target_raw_idx
  on drx_raw.registry_corrections_v1(target_raw_row_id);

create table if not exists drx_raw.registry_anomalies_v1 (
  anomaly_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references drx_raw.registry_import_batches_v1(batch_id) on delete restrict,
  raw_row_id uuid not null references drx_raw.registry_rows_v1(raw_row_id) on delete restrict,
  anomaly_code text not null check (anomaly_code in (
    'MISSING_PDID','MISSING_REGISTRY_NUMBER','MISSING_TRADE_NAME','DUPLICATE_PDID','UNBOUND_SOURCE_ROW'
  )),
  state text not null default 'OPEN' check (state in ('OPEN','RESOLVED','ACCEPTED')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  unique (raw_row_id, anomaly_code)
);

create index if not exists registry_anomalies_v1_state_idx
  on drx_raw.registry_anomalies_v1(state, anomaly_code);
create index if not exists registry_anomalies_v1_batch_idx
  on drx_raw.registry_anomalies_v1(batch_id);

create or replace function drx_raw.reject_immutable_row_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, drx_raw
as $$
begin
  raise exception 'DRx Phase 2 immutable ledger rows cannot be updated or deleted'
    using errcode='55000';
end;
$$;

drop trigger if exists registry_rows_v1_immutable on drx_raw.registry_rows_v1;
create trigger registry_rows_v1_immutable
before update or delete on drx_raw.registry_rows_v1
for each row execute function drx_raw.reject_immutable_row_mutation_v1();

drop trigger if exists registry_correction_source_rows_v1_immutable on drx_raw.registry_correction_source_rows_v1;
create trigger registry_correction_source_rows_v1_immutable
before update or delete on drx_raw.registry_correction_source_rows_v1
for each row execute function drx_raw.reject_immutable_row_mutation_v1();

drop trigger if exists registry_corrections_v1_immutable on drx_raw.registry_corrections_v1;
create trigger registry_corrections_v1_immutable
before update or delete on drx_raw.registry_corrections_v1
for each row execute function drx_raw.reject_immutable_row_mutation_v1();

create or replace function public.drx_registry_begin_import_v1(
  p_batch_kind text,
  p_source_type text,
  p_source_ref text,
  p_source_revision text,
  p_source_sha256 text,
  p_source_row_count integer,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, drx_raw, extensions
as $$
declare
  v_batch_id uuid;
begin
  if p_batch_kind not in ('REGISTRY_RAW','LEGACY_EDITORIAL') then
    raise exception 'Unsupported registry batch kind: %', p_batch_kind;
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'source_sha256 must be a lowercase SHA-256 hex digest';
  end if;
  if p_source_row_count is null or p_source_row_count < 0 then
    raise exception 'source_row_count must be non-negative';
  end if;

  select batch_id into v_batch_id
  from drx_raw.registry_import_batches_v1
  where batch_kind=p_batch_kind
    and source_ref=p_source_ref
    and source_sha256=p_source_sha256;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  insert into drx_raw.registry_import_batches_v1(
    batch_kind,source_type,source_ref,source_revision,source_sha256,source_row_count,metadata
  ) values (
    p_batch_kind,p_source_type,p_source_ref,p_source_revision,p_source_sha256,p_source_row_count,
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning batch_id into v_batch_id;

  return v_batch_id;
end;
$$;

create or replace function public.drx_registry_append_rows_v1(
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_raw, extensions
as $$
declare
  v_kind text;
  v_status text;
  v_item jsonb;
  v_payload jsonb;
  v_row_number integer;
  v_hash text;
  v_existing_hash text;
  v_registry text;
  v_source_drug_id uuid;
  v_baseline jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  select batch_kind,status into v_kind,v_status
  from drx_raw.registry_import_batches_v1
  where batch_id=p_batch_id;

  if v_kind is null then
    raise exception 'Unknown registry import batch %', p_batch_id;
  end if;
  if v_kind not in ('REGISTRY_RAW','LEGACY_EDITORIAL') then
    raise exception 'Batch % is not a registry-row batch', p_batch_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_item->>'source_row_number','')::integer;
    v_payload := v_item->'raw_payload';
    if v_row_number is null or v_payload is null or jsonb_typeof(v_payload) <> 'object' then
      raise exception 'Each row requires source_row_number and raw_payload object';
    end if;

    v_hash := encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');

    select raw_sha256 into v_existing_hash
    from drx_raw.registry_rows_v1
    where batch_id=p_batch_id and source_row_number=v_row_number;

    if v_existing_hash is not null then
      if v_existing_hash <> v_hash then
        raise exception 'Immutable raw row conflict in batch %, source row %', p_batch_id,v_row_number;
      end if;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_registry := nullif(btrim(coalesce(v_payload->>'Nr rendor',v_item->>'raw_registry_number','')),'');
    v_source_drug_id := null;
    v_baseline := null;

    if v_registry ~ '^[0-9]+$' then
      select d.id,to_jsonb(d) into v_source_drug_id,v_baseline
      from public.drugs d
      where d.registry_number=v_registry::integer;
    elsif nullif(v_item->>'source_drug_id','') is not null then
      select d.id,to_jsonb(d) into v_source_drug_id,v_baseline
      from public.drugs d
      where d.id=(v_item->>'source_drug_id')::uuid;
    end if;

    insert into drx_raw.registry_rows_v1(
      batch_id,source_row_number,source_drug_id,
      raw_registry_number,raw_pdid,raw_protocol_no,raw_trade_name,
      raw_active_substance,raw_atc_code,raw_strength,raw_pharmaceutical_form,
      raw_packaging,raw_marketing_authorization_holder,raw_manufacturer,raw_ma_certificate,
      raw_payload,baseline_drug_payload,raw_sha256
    ) values (
      p_batch_id,v_row_number,v_source_drug_id,
      v_registry,
      nullif(btrim(coalesce(v_payload->>'PDID',v_item->>'raw_pdid','')),''),
      nullif(btrim(coalesce(v_payload->>'ProtocolNo',v_item->>'raw_protocol_no','')),''),
      nullif(btrim(coalesce(v_payload->>'Emri tregtar',v_item->>'raw_trade_name','')),''),
      nullif(btrim(coalesce(v_payload->>'Substanca aktive',v_item->>'raw_active_substance','')),''),
      nullif(btrim(coalesce(v_payload->>'ATC Code',v_item->>'raw_atc_code','')),''),
      nullif(btrim(coalesce(v_payload->>'Fortësia',v_item->>'raw_strength','')),''),
      nullif(btrim(coalesce(v_payload->>'Forma farmaceutike',v_item->>'raw_pharmaceutical_form','')),''),
      nullif(btrim(coalesce(v_payload->>'Madhësia e paketimit',v_item->>'raw_packaging','')),''),
      nullif(btrim(coalesce(v_payload->>'Bartësi i Autorizim Marketingut',v_item->>'raw_marketing_authorization_holder','')),''),
      nullif(btrim(coalesce(v_payload->>'Prodhuesi',v_item->>'raw_manufacturer','')),''),
      nullif(btrim(coalesce(v_payload->>'MA certifikata',v_item->>'raw_ma_certificate','')),''),
      v_payload,v_baseline,v_hash
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted',v_inserted,'skipped',v_skipped);
end;
$$;

create or replace function public.drx_registry_finalize_import_v1(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_raw
as $$
declare
  v_kind text;
  v_status text;
  v_expected integer;
  v_actual integer;
  v_anomalies integer;
begin
  select batch_kind,status,source_row_count into v_kind,v_status,v_expected
  from drx_raw.registry_import_batches_v1
  where batch_id=p_batch_id;

  if v_kind is null then
    raise exception 'Unknown import batch %', p_batch_id;
  end if;

  if v_kind in ('REGISTRY_RAW','LEGACY_EDITORIAL') then
    select count(*) into v_actual
    from drx_raw.registry_rows_v1 where batch_id=p_batch_id;

    if v_actual <> v_expected then
      raise exception 'Raw registry row count mismatch for batch %: expected %, preserved %',
        p_batch_id,v_expected,v_actual;
    end if;

    insert into drx_raw.registry_anomalies_v1(batch_id,raw_row_id,anomaly_code,details)
    select p_batch_id,r.raw_row_id,'MISSING_PDID',
      jsonb_build_object('source_row_number',r.source_row_number,'trade_name',r.raw_trade_name)
    from drx_raw.registry_rows_v1 r
    where r.batch_id=p_batch_id and nullif(btrim(coalesce(r.raw_pdid,'')),'') is null
    on conflict (raw_row_id,anomaly_code) do nothing;

    insert into drx_raw.registry_anomalies_v1(batch_id,raw_row_id,anomaly_code,details)
    select p_batch_id,r.raw_row_id,'MISSING_REGISTRY_NUMBER',
      jsonb_build_object('source_row_number',r.source_row_number,'trade_name',r.raw_trade_name)
    from drx_raw.registry_rows_v1 r
    where r.batch_id=p_batch_id and nullif(btrim(coalesce(r.raw_registry_number,'')),'') is null
    on conflict (raw_row_id,anomaly_code) do nothing;

    insert into drx_raw.registry_anomalies_v1(batch_id,raw_row_id,anomaly_code,details)
    select p_batch_id,r.raw_row_id,'MISSING_TRADE_NAME',
      jsonb_build_object('source_row_number',r.source_row_number,'pdid',r.raw_pdid)
    from drx_raw.registry_rows_v1 r
    where r.batch_id=p_batch_id and nullif(btrim(coalesce(r.raw_trade_name,'')),'') is null
    on conflict (raw_row_id,anomaly_code) do nothing;

    insert into drx_raw.registry_anomalies_v1(batch_id,raw_row_id,anomaly_code,details)
    select p_batch_id,r.raw_row_id,'UNBOUND_SOURCE_ROW',
      jsonb_build_object('source_row_number',r.source_row_number,'registry_number',r.raw_registry_number,'trade_name',r.raw_trade_name)
    from drx_raw.registry_rows_v1 r
    where r.batch_id=p_batch_id and r.source_drug_id is null
      and nullif(btrim(coalesce(r.raw_registry_number,'')),'') is not null
    on conflict (raw_row_id,anomaly_code) do nothing;

    insert into drx_raw.registry_anomalies_v1(batch_id,raw_row_id,anomaly_code,details)
    select p_batch_id,r.raw_row_id,'DUPLICATE_PDID',
      jsonb_build_object('pdid',r.raw_pdid,'duplicate_count',d.cnt,'source_row_number',r.source_row_number)
    from drx_raw.registry_rows_v1 r
    join (
      select raw_pdid,count(*) cnt
      from drx_raw.registry_rows_v1
      where batch_id=p_batch_id and nullif(btrim(coalesce(raw_pdid,'')),'') is not null
      group by raw_pdid having count(*)>1
    ) d on d.raw_pdid=r.raw_pdid
    where r.batch_id=p_batch_id
    on conflict (raw_row_id,anomaly_code) do nothing;
  elsif v_kind='CORRECTION_SHEET' then
    select count(*) into v_actual
    from drx_raw.registry_correction_source_rows_v1 where batch_id=p_batch_id;
    if v_actual <> v_expected then
      raise exception 'Correction source row count mismatch for batch %: expected %, preserved %',
        p_batch_id,v_expected,v_actual;
    end if;
  else
    raise exception 'Unsupported batch kind %',v_kind;
  end if;

  select count(*) into v_anomalies
  from drx_raw.registry_anomalies_v1 where batch_id=p_batch_id;

  update drx_raw.registry_import_batches_v1
  set preserved_row_count=v_actual,
      anomaly_row_count=v_anomalies,
      status='FINALIZED',
      finalized_at=coalesce(finalized_at,now())
  where batch_id=p_batch_id and status<>'FINALIZED';

  return jsonb_build_object(
    'batch_id',p_batch_id,'batch_kind',v_kind,'source_row_count',v_expected,
    'preserved_row_count',v_actual,'anomaly_row_count',v_anomalies,'status','FINALIZED'
  );
end;
$$;

create or replace function public.drx_registry_import_corrections_v1(
  p_source_ref text,
  p_source_revision text,
  p_source_sha256 text,
  p_source_row_count integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_raw, extensions
as $$
declare
  v_batch_id uuid;
  v_item jsonb;
  v_payload jsonb;
  v_metadata jsonb;
  v_row_number integer;
  v_correction_id text;
  v_field_name text;
  v_field_code text;
  v_raw_value text;
  v_corrected_value text;
  v_reason text;
  v_status text;
  v_reviewer text;
  v_reviewed_at date;
  v_evidence_urls text[];
  v_patch jsonb;
  v_hash text;
  v_existing_hash text;
  v_source_row_id uuid;
  v_target_raw_row_id uuid;
  v_source_drug_id uuid;
  v_match_score integer;
  v_top_count integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'source_sha256 must be a lowercase SHA-256 hex digest';
  end if;

  select batch_id into v_batch_id
  from drx_raw.registry_import_batches_v1
  where batch_kind='CORRECTION_SHEET'
    and source_ref=p_source_ref
    and source_sha256=p_source_sha256;

  if v_batch_id is null then
    insert into drx_raw.registry_import_batches_v1(
      batch_kind,source_type,source_ref,source_revision,source_sha256,source_row_count,metadata
    ) values (
      'CORRECTION_SHEET','google_sheets',p_source_ref,p_source_revision,p_source_sha256,p_source_row_count,
      jsonb_build_object('sheet','KORRIGJIMET_E_REGJISTRIT')
    )
    returning batch_id into v_batch_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := nullif(v_item->>'source_row_number','')::integer;
    v_payload := v_item->'raw_payload';
    v_metadata := jsonb_build_object('evidence_urls',coalesce(v_item->'evidence_urls','[]'::jsonb));
    if v_row_number is null or v_payload is null or jsonb_typeof(v_payload)<>'object' then
      raise exception 'Each correction row requires source_row_number and raw_payload object';
    end if;

    v_correction_id := nullif(btrim(v_payload->>'CorrectionID'),'');
    if v_correction_id is null then
      raise exception 'Correction row % has no CorrectionID',v_row_number;
    end if;

    v_hash := encode(digest(convert_to(jsonb_build_object('raw_payload',v_payload,'source_metadata',v_metadata)::text,'UTF8'),'sha256'),'hex');

    select raw_sha256 into v_existing_hash
    from drx_raw.registry_correction_source_rows_v1
    where batch_id=v_batch_id and source_row_number=v_row_number;

    if v_existing_hash is not null then
      if v_existing_hash<>v_hash then
        raise exception 'Immutable correction source row conflict in batch %, row %',v_batch_id,v_row_number;
      end if;
      select source_row_id into v_source_row_id
      from drx_raw.registry_correction_source_rows_v1
      where batch_id=v_batch_id and source_row_number=v_row_number;
    else
      insert into drx_raw.registry_correction_source_rows_v1(
        batch_id,source_row_number,correction_id,raw_payload,source_metadata,raw_sha256
      ) values (v_batch_id,v_row_number,v_correction_id,v_payload,v_metadata,v_hash)
      returning source_row_id into v_source_row_id;
    end if;

    select row_sha256 into v_existing_hash
    from drx_raw.registry_corrections_v1 where correction_id=v_correction_id;
    if v_existing_hash is not null then
      if v_existing_hash<>v_hash then
        raise exception 'Correction % already exists with different immutable content',v_correction_id;
      end if;
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_field_name := nullif(btrim(v_payload->>'Fusha'),'');
    v_raw_value := nullif(btrim(v_payload->>'Vlera në burim'),'');
    v_corrected_value := nullif(btrim(v_payload->>'Vlera e korrigjuar'),'');
    v_reason := nullif(btrim(v_payload->>'Arsyeja'),'');
    v_status := upper(coalesce(nullif(btrim(v_payload->>'Statusi'),''),''));
    v_reviewer := nullif(btrim(v_payload->>'Verifikuar nga'),'');
    v_reviewed_at := nullif(btrim(v_payload->>'Verifikuar më'),'')::date;

    select coalesce(array_agg(value order by ordinality),'{}'::text[])
      into v_evidence_urls
    from jsonb_array_elements_text(coalesce(v_item->'evidence_urls','[]'::jsonb))
      with ordinality as e(value,ordinality)
    where value ~ '^https://';

    if v_status<>'VERIFIKUAR' or v_reviewer is null or v_reviewed_at is null
       or v_raw_value is null or v_corrected_value is null or v_reason is null
       or cardinality(v_evidence_urls)=0 then
      raise exception 'Correction % is missing verified audit evidence',v_correction_id;
    end if;

    v_field_code := case v_field_name
      when 'Substanca aktive' then 'ACTIVE_SUBSTANCE'
      when 'Emri tregtar' then 'TRADE_NAME'
      when 'Fortësia' then 'STRENGTH'
      when 'ATC' then 'ATC_CODE'
      when 'Forma' then 'PHARMACEUTICAL_FORM'
      when 'Renditja e substancave/fortësisë' then 'SUBSTANCE_STRENGTH_ORDER'
      when 'Substanca aktive dhe Fortësia' then 'ACTIVE_SUBSTANCE_AND_STRENGTH'
      else null end;
    if v_field_code is null then
      raise exception 'Unsupported correction field % in %',v_field_name,v_correction_id;
    end if;

    v_patch := case v_field_code
      when 'ACTIVE_SUBSTANCE' then jsonb_build_object('active_substance',v_corrected_value)
      when 'TRADE_NAME' then jsonb_build_object('trade_name',v_corrected_value)
      when 'STRENGTH' then jsonb_build_object('strength',v_corrected_value)
      when 'ATC_CODE' then jsonb_build_object('atc_code',v_corrected_value)
      when 'PHARMACEUTICAL_FORM' then jsonb_build_object('pharmaceutical_form',v_corrected_value)
      when 'SUBSTANCE_STRENGTH_ORDER' then
        case when v_correction_id='REG-2026-055' then jsonb_build_object(
          'active_substance','Paracetamol; Chlorpheniramine maleate; Pseudoephedrine HCl',
          'strength','(160 mg+1 mg+15 mg)/5 mL'
        ) else null end
      when 'ACTIVE_SUBSTANCE_AND_STRENGTH' then
        case when v_correction_id='REG-2026-056' then jsonb_build_object(
          'active_substance','Mepyramine maleate; Lidocaine HCl; Dexpanthenol',
          'strength','15 mg/g + 15 mg/g + 50 mg/g'
        ) else null end
      else null end;

    if v_patch is null then
      raise exception 'Composite correction % needs an explicit reviewed patch',v_correction_id;
    end if;

    with latest_raw as (
      select distinct on (r.source_drug_id)
        r.raw_row_id,r.source_drug_id,r.raw_pdid,r.raw_protocol_no,r.raw_trade_name,
        r.raw_active_substance,r.raw_atc_code,r.raw_strength,r.raw_pharmaceutical_form,
        b.finalized_at,b.captured_at
      from drx_raw.registry_rows_v1 r
      join drx_raw.registry_import_batches_v1 b on b.batch_id=r.batch_id
      where b.status='FINALIZED' and r.source_drug_id is not null
      order by r.source_drug_id,b.finalized_at desc nulls last,b.captured_at desc,r.raw_row_id
    ),
    candidates as (
      select l.raw_row_id,l.source_drug_id,
        (
          case when nullif(btrim(v_payload->>'PDID'),'') is not null
                    and btrim(v_payload->>'PDID')=coalesce(l.raw_pdid,'') then 120 else 0 end +
          case when nullif(btrim(v_payload->>'ProtocolNo'),'') is not null
                    and btrim(v_payload->>'ProtocolNo')=coalesce(l.raw_protocol_no,'') then 110 else 0 end +
          case when nullif(btrim(v_payload->>'PDID'),'') is not null
                    and btrim(v_payload->>'PDID')=coalesce(l.raw_protocol_no,'') then 100 else 0 end +
          case when nullif(btrim(v_payload->>'ProtocolNo'),'') is not null
                    and btrim(v_payload->>'ProtocolNo')=coalesce(l.raw_pdid,'') then 90 else 0 end +
          case when nullif(regexp_replace(coalesce(v_payload->>'Emri tregtar',''),'[^[:alnum:]]','','g'),'') is not null
                    and lower(regexp_replace(coalesce(v_payload->>'Emri tregtar',''),'[^[:alnum:]]','','g'))
                      = lower(regexp_replace(coalesce(l.raw_trade_name,''),'[^[:alnum:]]','','g')) then 50 else 0 end +
          case
            when v_field_code='ACTIVE_SUBSTANCE' and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_active_substance,''))) then 80
            when v_field_code='ATC_CODE' and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_atc_code,''))) then 80
            when v_field_code='PHARMACEUTICAL_FORM' and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_pharmaceutical_form,''))) then 80
            when v_field_code='TRADE_NAME' and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_trade_name,''))) then 80
            when v_field_code='STRENGTH' and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_strength,''))) then 80
            else 0 end +
          case when nullif(btrim(v_payload->>'ATC'),'') is not null
                    and btrim(v_payload->>'ATC')=coalesce(l.raw_atc_code,'') then 20 else 0 end
        ) as score
      from latest_raw l
    ),
    mx as (select max(score) max_score from candidates)
    select count(*),
           min(c.raw_row_id::text)::uuid,
           min(c.source_drug_id::text)::uuid,
           max(c.score)
      into v_top_count,v_target_raw_row_id,v_source_drug_id,v_match_score
    from candidates c cross join mx
    where c.score=mx.max_score and c.score>0;

    if v_top_count<>1 or v_target_raw_row_id is null or v_source_drug_id is null then
      raise exception 'Correction % did not resolve to exactly one raw registry row (top candidates=%)',
        v_correction_id,v_top_count;
    end if;

    insert into drx_raw.registry_corrections_v1(
      correction_id,source_row_id,target_raw_row_id,source_drug_id,
      field_name,field_code,raw_value,corrected_value,corrected_patch,reason,
      evidence_urls,status,reviewer,reviewed_at,match_score,row_sha256
    ) values (
      v_correction_id,v_source_row_id,v_target_raw_row_id,v_source_drug_id,
      v_field_name,v_field_code,v_raw_value,v_corrected_value,v_patch,v_reason,
      v_evidence_urls,v_status,v_reviewer,v_reviewed_at,v_match_score,v_hash
    );
    v_inserted := v_inserted+1;
  end loop;

  perform public.drx_registry_finalize_import_v1(v_batch_id);

  return jsonb_build_object(
    'batch_id',v_batch_id,'source_rows',p_source_row_count,
    'corrections_inserted',v_inserted,'corrections_idempotent',v_skipped
  );
end;
$$;

create or replace view drx_raw.registry_correction_patch_v1 as
with entries as (
  select c.source_drug_id,c.correction_id,c.reviewed_at,e.key,e.value,
         row_number() over (
           partition by c.source_drug_id,e.key
           order by c.reviewed_at desc,c.correction_id desc
         ) rn
  from drx_raw.registry_corrections_v1 c
  cross join lateral jsonb_each(c.corrected_patch) e
  where c.status='VERIFIKUAR'
)
select source_drug_id,jsonb_object_agg(key,value order by key) patch
from entries where rn=1
group by source_drug_id;

create or replace view drx_raw.registry_effective_v1 as
with latest_raw as (
  select distinct on (r.source_drug_id)
    r.*,b.batch_kind,b.source_ref,b.source_sha256,b.finalized_at
  from drx_raw.registry_rows_v1 r
  join drx_raw.registry_import_batches_v1 b on b.batch_id=r.batch_id
  where b.status='FINALIZED' and r.source_drug_id is not null
  order by r.source_drug_id,b.finalized_at desc nulls last,b.captured_at desc,r.raw_row_id
)
select
  r.raw_row_id,r.batch_id,r.batch_kind,r.source_ref,r.source_sha256,r.source_drug_id,
  r.source_row_number,r.raw_registry_number,r.raw_pdid,r.raw_protocol_no,
  r.raw_trade_name,r.raw_active_substance,r.raw_atc_code,r.raw_strength,
  r.raw_pharmaceutical_form,r.raw_packaging,r.raw_marketing_authorization_holder,
  r.raw_manufacturer,r.raw_ma_certificate,r.raw_payload,r.baseline_drug_payload,
  coalesce(p.patch,'{}'::jsonb) correction_patch,
  coalesce(p.patch->>'trade_name',r.raw_trade_name) source_effective_trade_name,
  coalesce(p.patch->>'active_substance',r.raw_active_substance) source_effective_active_substance,
  coalesce(p.patch->>'atc_code',r.raw_atc_code) source_effective_atc_code,
  coalesce(p.patch->>'strength',r.raw_strength) source_effective_strength,
  coalesce(p.patch->>'pharmaceutical_form',r.raw_pharmaceutical_form) source_effective_pharmaceutical_form,
  (
    (coalesce(r.baseline_drug_payload,'{}'::jsonb)-'updated_at')
    || case
      when coalesce((r.baseline_drug_payload->>'editorial_override')::boolean,false)
        then '{}'::jsonb
      else jsonb_strip_nulls(jsonb_build_object(
        'registry_number',case when r.raw_registry_number ~ '^[0-9]+$' then to_jsonb(r.raw_registry_number::integer) else null end,
        'pdid',to_jsonb(r.raw_pdid),
        'protocol_no',to_jsonb(r.raw_protocol_no),
        'trade_name',to_jsonb(r.raw_trade_name),
        'active_substance',to_jsonb(r.raw_active_substance),
        'atc_code',to_jsonb(r.raw_atc_code),
        'strength',to_jsonb(r.raw_strength),
        'pharmaceutical_form',to_jsonb(r.raw_pharmaceutical_form),
        'packaging',to_jsonb(r.raw_packaging),
        'marketing_authorization_holder',to_jsonb(r.raw_marketing_authorization_holder),
        'manufacturer',to_jsonb(r.raw_manufacturer),
        'ma_certificate',to_jsonb(r.raw_ma_certificate)
      )) end
    || coalesce(p.patch,'{}'::jsonb)
  ) reconstructed_drug_payload
from latest_raw r
left join drx_raw.registry_correction_patch_v1 p using(source_drug_id);

create or replace view drx_raw.registry_reconstruction_diff_v1 as
select e.source_drug_id,e.raw_row_id,
       ((to_jsonb(d)-'updated_at') is distinct from e.reconstructed_drug_payload) as differs,
       encode(digest(convert_to((to_jsonb(d)-'updated_at')::text,'UTF8'),'sha256'),'hex') current_sha256,
       encode(digest(convert_to(e.reconstructed_drug_payload::text,'UTF8'),'sha256'),'hex') reconstructed_sha256
from drx_raw.registry_effective_v1 e
join public.drugs d on d.id=e.source_drug_id;

create or replace function public.drx_registry_apply_corrections_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_raw
as $$
declare
  v_affected integer;
begin
  with patches as (
    select source_drug_id,patch from drx_raw.registry_correction_patch_v1
  )
  update public.drugs d
  set trade_name=coalesce(p.patch->>'trade_name',d.trade_name),
      active_substance=coalesce(p.patch->>'active_substance',d.active_substance),
      atc_code=coalesce(p.patch->>'atc_code',d.atc_code),
      strength=coalesce(p.patch->>'strength',d.strength),
      pharmaceutical_form=coalesce(p.patch->>'pharmaceutical_form',d.pharmaceutical_form)
  from patches p
  where d.id=p.source_drug_id
    and (
      d.trade_name is distinct from coalesce(p.patch->>'trade_name',d.trade_name)
      or d.active_substance is distinct from coalesce(p.patch->>'active_substance',d.active_substance)
      or d.atc_code is distinct from coalesce(p.patch->>'atc_code',d.atc_code)
      or d.strength is distinct from coalesce(p.patch->>'strength',d.strength)
      or d.pharmaceutical_form is distinct from coalesce(p.patch->>'pharmaceutical_form',d.pharmaceutical_form)
    );

  get diagnostics v_affected=row_count;
  return jsonb_build_object('updated_drugs',v_affected);
end;
$$;

create or replace function public.drx_registry_phase2_status_v1()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, drx_raw
as $$
  select jsonb_build_object(
    'batches',coalesce((select jsonb_agg(jsonb_build_object(
      'batch_id',batch_id,'batch_kind',batch_kind,'source_ref',source_ref,'source_sha256',source_sha256,
      'source_row_count',source_row_count,'preserved_row_count',preserved_row_count,
      'anomaly_row_count',anomaly_row_count,'status',status
    ) order by captured_at,batch_id) from drx_raw.registry_import_batches_v1),'[]'::jsonb),
    'raw_registry_rows',(select count(*) from drx_raw.registry_rows_v1),
    'correction_source_rows',(select count(*) from drx_raw.registry_correction_source_rows_v1),
    'corrections',(select count(*) from drx_raw.registry_corrections_v1),
    'verified_corrections',(select count(*) from drx_raw.registry_corrections_v1 where status='VERIFIKUAR'),
    'corrections_with_evidence',(select count(*) from drx_raw.registry_corrections_v1 where cardinality(evidence_urls)>0),
    'open_anomalies',(select count(*) from drx_raw.registry_anomalies_v1 where state='OPEN'),
    'anomalies_by_code',coalesce((select jsonb_object_agg(anomaly_code,cnt) from (
      select anomaly_code,count(*) cnt from drx_raw.registry_anomalies_v1
      where state='OPEN' group by anomaly_code
    ) x),'{}'::jsonb),
    'reconstruction_rows',(select count(*) from drx_raw.registry_reconstruction_diff_v1),
    'reconstruction_diffs',(select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs),
    'publication_allowed',false
  );
$$;

-- Internal schema stays outside the Data API. RPC entrypoints are service-role only.
revoke all on all tables in schema drx_raw from public,anon,authenticated;
revoke all on all sequences in schema drx_raw from public,anon,authenticated;
revoke execute on all functions in schema drx_raw from public,anon,authenticated;
revoke all on schema drx_raw from public,anon,authenticated;

alter default privileges for role postgres in schema drx_raw
  revoke all on tables from public,anon,authenticated;
alter default privileges for role postgres in schema drx_raw
  revoke all on sequences from public,anon,authenticated;
alter default privileges for role postgres in schema drx_raw
  revoke execute on functions from public,anon,authenticated;

revoke all on function public.drx_registry_begin_import_v1(text,text,text,text,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.drx_registry_append_rows_v1(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.drx_registry_finalize_import_v1(uuid) from public,anon,authenticated;
revoke all on function public.drx_registry_import_corrections_v1(text,text,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.drx_registry_apply_corrections_v1() from public,anon,authenticated;
revoke all on function public.drx_registry_phase2_status_v1() from public,anon,authenticated;

grant execute on function public.drx_registry_begin_import_v1(text,text,text,text,text,integer,jsonb) to service_role;
grant execute on function public.drx_registry_append_rows_v1(uuid,jsonb) to service_role;
grant execute on function public.drx_registry_finalize_import_v1(uuid) to service_role;
grant execute on function public.drx_registry_import_corrections_v1(text,text,text,integer,jsonb) to service_role;
grant execute on function public.drx_registry_apply_corrections_v1() to service_role;
grant execute on function public.drx_registry_phase2_status_v1() to service_role;

comment on schema drx_raw is
  'DRx Phase 2 internal append-only source ledger. Not exposed through the client Data API.';
comment on table drx_raw.registry_rows_v1 is
  'Exact immutable source rows plus an immutable Phase-2 baseline public.drugs snapshot for deterministic reconstruction.';
comment on table drx_raw.registry_corrections_v1 is
  'Immutable reviewed correction decisions. Verified rows require authoritative evidence URL(s), reviewer, and review date.';

-- Capture the 9 existing non-workbook rows as a separate, explicitly classified
-- legacy/editorial source batch. The official registry XLSX contains rows 1..4006.
do $$
declare
  v_batch_id uuid;
  v_hash text;
  v_count integer;
begin
  select count(*) into v_count
  from public.drugs
  where registry_number>4006 or registry_number is null;

  select encode(digest(convert_to(coalesce(string_agg(payload,E'\n' order by sort_key),''),'UTF8'),'sha256'),'hex')
    into v_hash
  from (
    select coalesce(registry_number::text,'NULL')||':'||id::text sort_key,
           to_jsonb(d)::text payload
    from public.drugs d
    where registry_number>4006 or registry_number is null
  ) x;

  select public.drx_registry_begin_import_v1(
    'LEGACY_EDITORIAL','supabase_phase2_baseline','public.drugs:non_registry_source_rows',
    'phase2-baseline-2026-08-30',v_hash,v_count,
    jsonb_build_object(
      'classification','manual/editorial/external rows not present in official registry XLSX',
      'official_registry_source_rows',4006
    )
  ) into v_batch_id;

  if not exists(select 1 from drx_raw.registry_rows_v1 where batch_id=v_batch_id) then
    insert into drx_raw.registry_rows_v1(
      batch_id,source_row_number,source_drug_id,
      raw_registry_number,raw_pdid,raw_protocol_no,raw_trade_name,
      raw_active_substance,raw_atc_code,raw_strength,raw_pharmaceutical_form,
      raw_packaging,raw_marketing_authorization_holder,raw_manufacturer,raw_ma_certificate,
      raw_payload,baseline_drug_payload,raw_sha256
    )
    select
      v_batch_id,
      row_number() over(order by registry_number nulls last,trade_name,id)::integer,
      id,registry_number::text,pdid,protocol_no,trade_name,active_substance,atc_code,strength,
      pharmaceutical_form,packaging,marketing_authorization_holder,manufacturer,ma_certificate,
      coalesce(source_payload,'{}'::jsonb),to_jsonb(d),
      encode(digest(convert_to(coalesce(source_payload,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex')
    from public.drugs d
    where registry_number>4006 or registry_number is null;
  end if;

  perform public.drx_registry_finalize_import_v1(v_batch_id);
end;
$$;
