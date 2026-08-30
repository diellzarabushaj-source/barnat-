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
      jsonb_build_object(
        'sheet','KORRIGJIMET_E_REGJISTRIT',
        'matcher','trade-first-v2',
        'matcher_policy','exact/prefix trade name or raw-field+ATC, then identity signals for disambiguation'
      )
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

    v_hash := encode(digest(convert_to(
      jsonb_build_object('raw_payload',v_payload,'source_metadata',v_metadata)::text,
      'UTF8'
    ),'sha256'),'hex');

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
    signals as (
      select l.*,
        lower(regexp_replace(coalesce(v_payload->>'Emri tregtar',''),'[^[:alnum:]]','','g')) ctrade,
        lower(regexp_replace(coalesce(l.raw_trade_name,''),'[^[:alnum:]]','','g')) dtrade,
        case
          when v_field_code='ACTIVE_SUBSTANCE'
            and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_active_substance,''))) then true
          when v_field_code='ATC_CODE'
            and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_atc_code,''))) then true
          when v_field_code='PHARMACEUTICAL_FORM'
            and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_pharmaceutical_form,''))) then true
          when v_field_code='TRADE_NAME'
            and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_trade_name,''))) then true
          when v_field_code='STRENGTH'
            and lower(btrim(v_raw_value))=lower(btrim(coalesce(l.raw_strength,''))) then true
          else false
        end field_match,
        (
          nullif(btrim(v_payload->>'ATC'),'') is not null
          and btrim(v_payload->>'ATC')=coalesce(l.raw_atc_code,'')
        ) atc_match
      from latest_raw l
    ),
    candidates as (
      select s.*,
        (
          case when ctrade=dtrade and ctrade<>'' then 300 else 0 end +
          case when ctrade<>'' and dtrade<>'' and least(length(ctrade),length(dtrade))>=6
                     and (ctrade like dtrade||'%' or dtrade like ctrade||'%')
                     and ctrade<>dtrade then 180 else 0 end +
          case when field_match then 200 else 0 end +
          case when atc_match then 50 else 0 end +
          case when nullif(btrim(v_payload->>'PDID'),'') is not null
                     and btrim(v_payload->>'PDID')=coalesce(raw_pdid,'') then 120 else 0 end +
          case when nullif(btrim(v_payload->>'ProtocolNo'),'') is not null
                     and btrim(v_payload->>'ProtocolNo')=coalesce(raw_protocol_no,'') then 110 else 0 end +
          case when nullif(btrim(v_payload->>'PDID'),'') is not null
                     and btrim(v_payload->>'PDID')=coalesce(raw_protocol_no,'') then 80 else 0 end +
          case when nullif(btrim(v_payload->>'ProtocolNo'),'') is not null
                     and btrim(v_payload->>'ProtocolNo')=coalesce(raw_pdid,'') then 70 else 0 end
        ) score
      from signals s
      where
        (ctrade=dtrade and ctrade<>'')
        or (
          ctrade<>'' and dtrade<>'' and least(length(ctrade),length(dtrade))>=6
          and (ctrade like dtrade||'%' or dtrade like ctrade||'%')
        )
        or (field_match and atc_match)
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

revoke all on function public.drx_registry_import_corrections_v1(text,text,text,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.drx_registry_import_corrections_v1(text,text,text,integer,jsonb)
to service_role;
