-- Phase A is additive. Activate the fence only after the CAS API/client deploy.
-- Existing ciphertext is neither decrypted nor rewritten by this migration.
create schema if not exists prescription_write_private;
revoke all on schema prescription_write_private from public, anon, authenticated;
grant usage on schema prescription_write_private to service_role;

create table prescription_write_private.control (
  singleton boolean primary key default true check (singleton),
  fence_enabled boolean not null default false
);
insert into prescription_write_private.control(singleton,fence_enabled) values (true,false);
alter table prescription_write_private.control enable row level security;
revoke all on prescription_write_private.control from public, anon, authenticated, service_role;
grant select on prescription_write_private.control to service_role;

-- Receipts contain only identity, a digest, and acknowledgement. No plaintext
-- or second ciphertext copy. Keep them until owner deletion for offline retry.
create table prescription_write_private.receipts (
  storage_uid uuid not null,
  operation_id uuid not null,
  auth_uid uuid,
  request_hash bytea not null check (octet_length(request_hash)=32),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(storage_uid,operation_id)
);
create index prescription_write_receipts_auth_uid_idx
  on prescription_write_private.receipts(auth_uid) where auth_uid is not null;
alter table prescription_write_private.receipts enable row level security;
revoke all on prescription_write_private.receipts from public, anon, authenticated, service_role;
grant select,insert on prescription_write_private.receipts to service_role;

alter table public.user_prescriptions
  add column row_version bigint not null default 1
    check (row_version between 1 and 9007199254740991);

-- Existing authenticated writers cannot read the private rollout flag. This
-- definer reads that flag only and never selects or decrypts user content.
create function prescription_write_private.guard_prescription_write()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_fence boolean;
  v_cas boolean;
begin
  select fence_enabled into strict v_fence from prescription_write_private.control where singleton;
  v_cas := pg_catalog.current_setting('medindex.prescription_cas_write',true)='on'
    and pg_catalog.current_setting('role',true)='service_role';
  if tg_op='DELETE' then
    -- Preserve account ON DELETE CASCADE cleanup. HTTP DELETE stays fenced.
    if pg_catalog.pg_trigger_depth()>1 then return old; end if;
    if v_fence then raise exception 'Use atomic prescription tombstones' using errcode='42501'; end if;
    return old;
  end if;
  if v_fence and not coalesce(v_cas,false) then
    raise exception 'Use atomic prescription writes' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or new.client_id is distinct from old.client_id) then
    raise exception 'Prescription identity is immutable' using errcode='23514';
  end if;
  if tg_op='INSERT' then new.row_version := 1;
  else
    if old.row_version>=9007199254740991 then raise exception 'Prescription version exhausted' using errcode='22003'; end if;
    new.row_version := old.row_version+1;
  end if;
  return new;
end;
$function$;
revoke all on function prescription_write_private.guard_prescription_write() from public, anon, authenticated, service_role;
create trigger aaa_guard_atomic_user_prescriptions
before insert or update or delete on public.user_prescriptions
for each row execute function prescription_write_private.guard_prescription_write();

create function prescription_write_private.cleanup_prescription_receipts()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_table_schema='auth' then
    delete from prescription_write_private.receipts where auth_uid=old.id or storage_uid=old.id;
  else delete from prescription_write_private.receipts where storage_uid=old.id;
  end if;
  return old;
end;
$function$;
revoke all on function prescription_write_private.cleanup_prescription_receipts() from public, anon, authenticated, service_role;
create trigger cleanup_atomic_prescription_receipts_auth_owner
after delete on auth.users for each row execute function prescription_write_private.cleanup_prescription_receipts();
create trigger cleanup_atomic_prescription_receipts_storage_owner
after delete on public.medindex_users for each row execute function prescription_write_private.cleanup_prescription_receipts();

create function public.write_user_prescriptions_cas(p_auth_uid uuid,p_storage_uid uuid,p_writes jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
  v_write jsonb;
  v_key text;
  v_operation uuid;
  v_expected bigint;
  v_deleted boolean;
  v_restore boolean;
  v_client_stamp timestamptz;
  v_hash bytea;
  v_receipt prescription_write_private.receipts%rowtype;
  v_version bigint;
  v_was_deleted boolean;
  v_lock bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_previous_fence text;
  v_result jsonb;
  v_conflicts jsonb[] := array[]::jsonb[];
  v_operations jsonb[] := array[]::jsonb[];
begin
  if current_user<>'service_role' then raise exception 'Service role required for atomic prescription writes' using errcode='42501'; end if;
  if p_storage_uid is null or p_writes is null or pg_catalog.jsonb_typeof(p_writes)<>'array' then
    raise exception 'Invalid atomic prescription request' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_writes)>500 or pg_catalog.octet_length(p_writes::text)>3145728 then
    raise exception 'Atomic prescription request too large' using errcode='22023';
  end if;
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    if pg_catalog.jsonb_typeof(v_write)<>'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(v_write) k where k not in
        ('clientId','expectedVersion','operationId','payload','payloadDigest','chapterKey','deleted','restore','clientUpdatedAt'))
      or pg_catalog.jsonb_typeof(v_write->'clientId') is distinct from 'string'
      or pg_catalog.char_length(v_write->>'clientId') not between 1 and 160
      or pg_catalog.jsonb_typeof(v_write->'operationId') is distinct from 'string'
      or (v_write->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(v_write->'expectedVersion') is distinct from 'number'
      or (v_write->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,15})$'
      or (v_write->>'expectedVersion')::numeric>9007199254740990
      or pg_catalog.jsonb_typeof(v_write->'deleted') is distinct from 'boolean'
      or pg_catalog.jsonb_typeof(v_write->'restore') is distinct from 'boolean'
      or ((v_write->>'restore')::boolean and (v_write->>'deleted')::boolean)
      or pg_catalog.jsonb_typeof(v_write->'payloadDigest') is distinct from 'string'
      or (v_write->>'payloadDigest') !~ '^[0-9a-f]{64}$'
      or pg_catalog.jsonb_typeof(v_write->'payload') is distinct from 'object'
      or pg_catalog.octet_length((v_write->'payload')::text)>225280
      or (pg_catalog.jsonb_typeof(v_write->'chapterKey') is distinct from 'string' and pg_catalog.jsonb_typeof(v_write->'chapterKey') is distinct from 'null')
      or (v_write->>'chapterKey' is not null and (pg_catalog.char_length(v_write->>'chapterKey')>64 or (v_write->>'chapterKey') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
      or pg_catalog.jsonb_typeof(v_write->'clientUpdatedAt') is distinct from 'string'
      or pg_catalog.char_length(v_write->>'clientUpdatedAt')>40
      or (v_write->>'clientUpdatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'Invalid atomic prescription write' using errcode='22023';
    end if;
    -- Only the existing encrypted storage envelope is accepted. The API alone
    -- computes payloadDigest from canonical plaintext, before random encryption.
    if exists (select 1 from pg_catalog.jsonb_object_keys(v_write->'payload') k where k not in ('v','kid','alg','iv','tag','ciphertext'))
      or pg_catalog.jsonb_typeof(v_write->'payload'->'v') is distinct from 'number'
      or (v_write->'payload'->>'v') not in ('1','2')
      or pg_catalog.jsonb_typeof(v_write->'payload'->'alg') is distinct from 'string'
      or (v_write->'payload'->>'alg') is distinct from 'A256GCM'
      or ((v_write->'payload'->>'v')='1' and (v_write->'payload') ? 'kid')
      or pg_catalog.jsonb_typeof(v_write->'payload'->'iv') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'payload'->'tag') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'payload'->'ciphertext') is distinct from 'string'
      or (v_write->'payload'->>'iv') !~ '^[A-Za-z0-9_-]{16}$'
      or (v_write->'payload'->>'tag') !~ '^[A-Za-z0-9_-]{22}$'
      or (v_write->'payload'->>'ciphertext') !~ '^[A-Za-z0-9_-]+$'
      or ((v_write->'payload'->>'v')='2' and (pg_catalog.jsonb_typeof(v_write->'payload'->'kid') is distinct from 'string' or (v_write->'payload'->>'kid') !~ '^[A-Za-z0-9_-]{1,64}$')) then
      raise exception 'Invalid encrypted prescription envelope' using errcode='22023';
    end if;
    v_client_stamp := (v_write->>'clientUpdatedAt')::timestamptz;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_writes) w group by w->>'clientId' having count(*)>1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_writes) w group by (w->>'operationId')::uuid having count(*)>1) then
    raise exception 'Duplicate prescription or operation in batch' using errcode='22023';
  end if;
  -- A shared numeric lock order covers absent rows and cross-entity UUID reuse.
  for v_lock in select lock_id from (
    select pg_catalog.hashtextextended('prescription-entity:'||p_storage_uid::text||':'||(w->>'clientId'),0) lock_id
    from pg_catalog.jsonb_array_elements(p_writes) w
    union
    select pg_catalog.hashtextextended('prescription-operation:'||p_storage_uid::text||':'||(w->>'operationId')::uuid::text,0)
    from pg_catalog.jsonb_array_elements(p_writes) w
  ) locks order by lock_id loop perform pg_catalog.pg_advisory_xact_lock(v_lock); end loop;

  -- Check all receipts and all versions before mutating any prescription.
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    v_key := v_write->>'clientId'; v_operation := (v_write->>'operationId')::uuid; v_expected := (v_write->>'expectedVersion')::bigint;
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'authUid',p_auth_uid,'storageUid',p_storage_uid,'clientId',v_key,'expectedVersion',v_expected,
      'payloadDigest',v_write->>'payloadDigest','chapterKey',v_write->>'chapterKey',
      'deleted',(v_write->>'deleted')::boolean,'restore',(v_write->>'restore')::boolean,'clientUpdatedAt',v_write->>'clientUpdatedAt'
    )::text,'UTF8'));
    select * into v_receipt from prescription_write_private.receipts where storage_uid=p_storage_uid and operation_id=v_operation;
    if found then
      if v_receipt.request_hash is distinct from v_hash then return pg_catalog.jsonb_build_object('ok',false,'code','PRESCRIPTION_OPERATION_REUSED'); end if;
      continue;
    end if;
    v_version := null; v_was_deleted := false;
    select row_version,deleted_at is not null into v_version,v_was_deleted from public.user_prescriptions
      where user_id=p_storage_uid and client_id=v_key for update;
    if coalesce(v_version,0)<>v_expected
      or ((v_write->>'restore')::boolean and not coalesce(v_was_deleted,false))
      or (not (v_write->>'deleted')::boolean and coalesce(v_was_deleted,false) and not (v_write->>'restore')::boolean) then
      v_conflicts := pg_catalog.array_append(v_conflicts,pg_catalog.jsonb_build_object(
        'clientId',v_key,'rowVersion',coalesce(v_version,0),'deleted',coalesce(v_was_deleted,false)));
    end if;
  end loop;
  if pg_catalog.cardinality(v_conflicts)>0 then
    return pg_catalog.jsonb_build_object('ok',false,'code','PRESCRIPTION_VERSION_CONFLICT','conflicts',pg_catalog.to_jsonb(v_conflicts));
  end if;
  v_previous_fence := pg_catalog.current_setting('medindex.prescription_cas_write',true);
  perform pg_catalog.set_config('medindex.prescription_cas_write','on',true);
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    v_key := v_write->>'clientId'; v_operation := (v_write->>'operationId')::uuid; v_expected := (v_write->>'expectedVersion')::bigint;
    v_deleted := (v_write->>'deleted')::boolean; v_client_stamp := (v_write->>'clientUpdatedAt')::timestamptz;
    select * into v_receipt from prescription_write_private.receipts where storage_uid=p_storage_uid and operation_id=v_operation;
    if found then v_operations := pg_catalog.array_append(v_operations,v_receipt.result); continue; end if;
    if v_expected=0 then
      insert into public.user_prescriptions(user_id,client_id,name,diagnosis,chapter_key,payload,client_updated_at,deleted_at,updated_at,row_version)
      values(p_storage_uid,v_key,null,null,v_write->>'chapterKey',v_write->'payload',v_client_stamp,case when v_deleted then v_now else null end,v_now,1)
      returning row_version into v_version;
    else
      update public.user_prescriptions set name=null,diagnosis=null,chapter_key=v_write->>'chapterKey',payload=v_write->'payload',
        client_updated_at=v_client_stamp,deleted_at=case when v_deleted then v_now else null end,updated_at=v_now
      where user_id=p_storage_uid and client_id=v_key and row_version=v_expected returning row_version into v_version;
    end if;
    if v_version is null then raise exception 'Atomic prescription version changed after preflight' using errcode='40001'; end if;
    v_result := pg_catalog.jsonb_build_object('operationId',v_operation,'clientId',v_key,'rowVersion',v_version,'deleted',v_deleted);
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'authUid',p_auth_uid,'storageUid',p_storage_uid,'clientId',v_key,'expectedVersion',v_expected,
      'payloadDigest',v_write->>'payloadDigest','chapterKey',v_write->>'chapterKey',
      'deleted',v_deleted,'restore',(v_write->>'restore')::boolean,'clientUpdatedAt',v_write->>'clientUpdatedAt'
    )::text,'UTF8'));
    insert into prescription_write_private.receipts(storage_uid,operation_id,auth_uid,request_hash,result) values(p_storage_uid,v_operation,p_auth_uid,v_hash,v_result);
    v_operations := pg_catalog.array_append(v_operations,v_result);
  end loop;
  perform pg_catalog.set_config('medindex.prescription_cas_write',coalesce(v_previous_fence,''),true);
  return pg_catalog.jsonb_build_object('ok',true,'operations',pg_catalog.to_jsonb(v_operations));
end;
$function$;
revoke all on function public.write_user_prescriptions_cas(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.write_user_prescriptions_cas(uuid,uuid,jsonb) to service_role;
comment on function public.write_user_prescriptions_cas(uuid,uuid,jsonb) is
  'Service-only encrypted prescription batch CAS, including tombstones and explicit restore. Source payload digest excludes random encryption IV; verified owner comes only from server session.';
