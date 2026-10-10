-- One transaction for the complete personal-library upload. A later conflict
-- rolls back earlier child writes and operation receipts, preserving safe retry.
create function public.write_user_library_cas(
  p_auth_uid uuid,
  p_storage_uid uuid,
  p_note_writes jsonb,
  p_prescription_writes jsonb,
  p_favorite_records jsonb,
  p_drug_records jsonb
)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
  v_item jsonb;
  v_lock bigint;
  v_notes jsonb := '{"ok":true,"operations":[]}'::jsonb;
  v_prescriptions jsonb := '{"ok":true,"operations":[]}'::jsonb;
  v_favorites integer := 0;
  v_drugs integer := 0;
  v_detail text;
  v_message text;
begin
  if current_user <> 'service_role' or p_storage_uid is null then
    raise exception 'Invalid atomic library owner' using errcode='42501';
  end if;
  if pg_catalog.jsonb_typeof(p_note_writes) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_prescription_writes) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_favorite_records) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_drug_records) is distinct from 'array' then
    raise exception 'Invalid atomic library arrays' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_note_writes)>9000
    or pg_catalog.jsonb_array_length(p_prescription_writes)>500
    or pg_catalog.jsonb_array_length(p_favorite_records)>9000
    or pg_catalog.jsonb_array_length(p_drug_records)>500
    or pg_catalog.octet_length(p_note_writes::text || p_prescription_writes::text ||
      p_favorite_records::text || p_drug_records::text)>6291456 then
    raise exception 'Atomic library request too large' using errcode='22023';
  end if;
  -- The HTTP API normalizes these records. Validate ownership and a closed
  -- shape again so callers cannot inject IDs, row versions or note mutations.
  for v_item in select value from pg_catalog.jsonb_array_elements(p_favorite_records) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['user_id','drug_id','entity_type','entity_key','payload',
        'client_updated_at','deleted_at','updated_at'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item->'user_id') is distinct from 'string'
      or (v_item->>'user_id')::uuid is distinct from p_storage_uid
      or pg_catalog.jsonb_typeof(v_item->'entity_type') is distinct from 'string'
      or v_item->>'entity_type' not in ('drug','substance','variant','product','lab','icd','protocol')
      or pg_catalog.jsonb_typeof(v_item->'entity_key') is distinct from 'string'
      or pg_catalog.char_length(v_item->>'entity_key') not between 1 and 300
      or (v_item->>'entity_type'='protocol' and v_item->>'entity_key' like 'drug-note:%')
      or pg_catalog.jsonb_typeof(v_item->'payload') is distinct from 'object'
      or pg_catalog.octet_length((v_item->'payload')::text)>163840
      or pg_catalog.jsonb_typeof(v_item->'client_updated_at') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'updated_at') is distinct from 'string'
      or not (v_item ? 'deleted_at')
      or pg_catalog.jsonb_typeof(v_item->'deleted_at') not in ('string','null')
      or not (v_item ? 'drug_id')
      or pg_catalog.jsonb_typeof(v_item->'drug_id') not in ('string','null') then
      raise exception 'Invalid atomic favorite record' using errcode='22023';
    end if;
    perform (v_item->>'client_updated_at')::timestamptz,
      (v_item->>'updated_at')::timestamptz, (v_item->>'deleted_at')::timestamptz,
      (v_item->>'drug_id')::uuid;
  end loop;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_drug_records) loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['user_id','client_id','name','payload','client_updated_at','deleted_at','updated_at'] <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(v_item->'user_id') is distinct from 'string'
      or (v_item->>'user_id')::uuid is distinct from p_storage_uid
      or pg_catalog.jsonb_typeof(v_item->'client_id') is distinct from 'string'
      or pg_catalog.char_length(v_item->>'client_id') not between 1 and 160
      or pg_catalog.jsonb_typeof(v_item->'name') is distinct from 'string'
      or pg_catalog.char_length(v_item->>'name') not between 1 and 300
      or pg_catalog.jsonb_typeof(v_item->'payload') is distinct from 'object'
      or pg_catalog.octet_length((v_item->'payload')::text)>163840
      or pg_catalog.jsonb_typeof(v_item->'client_updated_at') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item->'updated_at') is distinct from 'string'
      or not (v_item ? 'deleted_at')
      or pg_catalog.jsonb_typeof(v_item->'deleted_at') not in ('string','null') then
      raise exception 'Invalid atomic personal drug record' using errcode='22023';
    end if;
    perform (v_item->>'client_updated_at')::timestamptz,
      (v_item->>'updated_at')::timestamptz, (v_item->>'deleted_at')::timestamptz;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_favorite_records) r
    group by r->>'entity_type',r->>'entity_key' having count(*)>1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_drug_records) r
    group by r->>'client_id' having count(*)>1) then
    raise exception 'Duplicate atomic library records' using errcode='22023';
  end if;
  -- Serialize complete snapshots for either identity before acquiring entity
  -- locks in the child RPCs. Sorting prevents crossed-owner lock ordering.
  for v_lock in select distinct pg_catalog.hashtextextended('user-library:' || owner_id,0)
    from (values (p_storage_uid::text),(p_auth_uid::text)) owners(owner_id)
    where owner_id is not null order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock);
  end loop;
  begin
    if pg_catalog.jsonb_array_length(p_note_writes)>0 then
      v_notes := public.write_user_notes_cas(p_auth_uid,p_storage_uid,p_note_writes);
      if v_notes->'ok' = 'false'::jsonb then
        raise exception 'Atomic library child conflict' using errcode='DX001', detail=
          pg_catalog.jsonb_build_object('ok',false,'source','notes',
            'code',v_notes->>'code','conflicts',coalesce(v_notes->'conflicts','[]'::jsonb))::text;
      elsif v_notes->'ok' is distinct from 'true'::jsonb then
        raise exception 'Invalid atomic note acknowledgement' using errcode='22023';
      end if;
    end if;
    if pg_catalog.jsonb_array_length(p_prescription_writes)>0 then
      v_prescriptions := public.write_user_prescriptions_cas(p_auth_uid,p_storage_uid,p_prescription_writes);
      if v_prescriptions->'ok' = 'false'::jsonb then
        raise exception 'Atomic library child conflict' using errcode='DX001', detail=
          pg_catalog.jsonb_build_object('ok',false,'source','prescriptions',
            'code',v_prescriptions->>'code','conflicts',coalesce(v_prescriptions->'conflicts','[]'::jsonb))::text;
      elsif v_prescriptions->'ok' is distinct from 'true'::jsonb then
        raise exception 'Invalid atomic prescription acknowledgement' using errcode='22023';
      end if;
    end if;
    insert into public.user_favorites as target
      (user_id,drug_id,entity_type,entity_key,payload,client_updated_at,deleted_at,updated_at)
    select p_storage_uid,r.drug_id,r.entity_type,r.entity_key,r.payload,
      r.client_updated_at,r.deleted_at,r.updated_at
    from pg_catalog.jsonb_to_recordset(p_favorite_records) as r
      (drug_id uuid,entity_type text,entity_key text,payload jsonb,client_updated_at timestamptz,
       deleted_at timestamptz,updated_at timestamptz)
    on conflict (user_id,entity_type,entity_key) do update set
      drug_id=excluded.drug_id,payload=excluded.payload,client_updated_at=excluded.client_updated_at,
      deleted_at=excluded.deleted_at,updated_at=excluded.updated_at
    where coalesce(target.client_updated_at,'-infinity'::timestamptz)<=excluded.client_updated_at;
    get diagnostics v_favorites = row_count;
    insert into public.user_drugs as target
      (user_id,client_id,name,payload,client_updated_at,deleted_at,updated_at)
    select p_storage_uid,r.client_id,r.name,r.payload,r.client_updated_at,r.deleted_at,r.updated_at
    from pg_catalog.jsonb_to_recordset(p_drug_records) as r
      (client_id text,name text,payload jsonb,client_updated_at timestamptz,deleted_at timestamptz,updated_at timestamptz)
    on conflict (user_id,client_id) do update set
      name=excluded.name,payload=excluded.payload,client_updated_at=excluded.client_updated_at,
      deleted_at=excluded.deleted_at,updated_at=excluded.updated_at
    where coalesce(target.client_updated_at,'-infinity'::timestamptz)<=excluded.client_updated_at;
    get diagnostics v_drugs = row_count;
  exception when sqlstate 'DX001' then
    -- Entering this handler rolls back the complete nested block, including
    -- note/Rx writes, receipts and transaction-local fence configuration.
    get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
    if v_message <> 'Atomic library child conflict' then raise; end if;
    return v_detail::jsonb;
  end;
  return pg_catalog.jsonb_build_object('ok',true,'notes',v_notes,'prescriptions',v_prescriptions,
    'favorites',v_favorites,'drugs',v_drugs);
end;
$function$;
revoke all on function public.write_user_library_cas(uuid,uuid,jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.write_user_library_cas(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to service_role;
comment on function public.write_user_library_cas(uuid,uuid,jsonb,jsonb,jsonb,jsonb) is
  'Service-only transaction for native/legacy notes, encrypted prescriptions and ordinary library records.';
