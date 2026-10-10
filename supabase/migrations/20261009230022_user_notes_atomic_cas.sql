-- Phase A: add atomic note writes while old deployed clients keep working.
-- Phase B activates the direct-write fence only after the CAS API is deployed.
-- No clinical text is migrated, decrypted, normalized or copied here.

create schema if not exists note_write_private;
revoke all on schema note_write_private from public, anon, authenticated;
grant usage on schema note_write_private to service_role;

create table note_write_private.control (
  singleton boolean primary key default true check (singleton),
  fence_enabled boolean not null default false
);
insert into note_write_private.control(singleton,fence_enabled) values (true,false);
alter table note_write_private.control enable row level security;
revoke all on note_write_private.control from public, anon, authenticated, service_role;
grant select on note_write_private.control to service_role;

-- One receipt per owner and client operation. Store a digest and acknowledgement,
-- never a second copy of the note text. Retain receipts until owner deletion;
-- pruning would need an explicit bounded-retry contract, so is not implicit here.
create table note_write_private.receipts (
  storage_uid uuid not null,
  operation_id uuid not null,
  auth_uid uuid,
  request_hash bytea not null check (octet_length(request_hash)=32),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(storage_uid,operation_id)
);
create index note_write_receipts_auth_uid_idx
  on note_write_private.receipts(auth_uid) where auth_uid is not null;
alter table note_write_private.receipts enable row level security;
revoke all on note_write_private.receipts from public, anon, authenticated, service_role;
grant select,insert on note_write_private.receipts to service_role;

alter table public.user_notes
  add column row_version bigint not null default 1
    check (row_version between 1 and 9007199254740991);
alter table public.user_favorites
  add column row_version bigint not null default 1
    check (row_version between 1 and 9007199254740991);

-- This narrow definer is needed because existing authenticated table writers
-- have no access to the private flag during the additive rollout. It reads only
-- that flag; it neither selects user content nor changes permissions/ownership.
create function note_write_private.guard_note_write()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_old_note boolean := false;
  v_new_note boolean := false;
  v_fence boolean;
  v_cas boolean;
begin
  if tg_table_name='user_favorites' then
    if tg_op<>'INSERT' then
      v_old_note := old.entity_type='protocol' and old.entity_key like 'drug-note:%';
    end if;
    if tg_op<>'DELETE' then
      v_new_note := new.entity_type='protocol' and new.entity_key like 'drug-note:%';
    end if;
    if not v_old_note and not v_new_note then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  end if;

  select fence_enabled into strict v_fence from note_write_private.control where singleton;
  v_cas := pg_catalog.current_setting('medindex.note_cas_write',true)='on'
    and pg_catalog.current_setting('role',true)='service_role';

  if tg_op='DELETE' then
    -- Keep existing auth.users ON DELETE CASCADE cleanup working. This exception
    -- applies only to a nested trigger; ordinary HTTP table DELETE stays fenced.
    if pg_catalog.pg_trigger_depth()>1 then return old; end if;
    if v_fence then
      raise exception 'Use atomic note tombstones' using errcode='42501';
    end if;
    return old;
  end if;
  if v_fence and not coalesce(v_cas,false) then
    raise exception 'Use atomic note writes' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.entity_type is distinct from old.entity_type
    or new.entity_key is distinct from old.entity_key
  ) then
    raise exception 'Note identity is immutable' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    new.row_version := 1;
  else
    if old.row_version>=9007199254740991 then
      raise exception 'Note version exhausted' using errcode='22003';
    end if;
    new.row_version := old.row_version+1;
  end if;
  return new;
end;
$function$;
revoke all on function note_write_private.guard_note_write() from public, anon, authenticated, service_role;

create trigger aaa_guard_atomic_user_notes
before insert or update or delete on public.user_notes
for each row execute function note_write_private.guard_note_write();
create trigger aaa_guard_atomic_legacy_notes
before insert or update or delete on public.user_favorites
for each row execute function note_write_private.guard_note_write();

-- Receipt cleanup contains no clinical content. The existing owner deletion
-- semantics must not leave identifiers/digests behind after account deletion.
create function note_write_private.cleanup_note_receipts()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_table_schema='auth' then
    delete from note_write_private.receipts where auth_uid=old.id or storage_uid=old.id;
  else
    delete from note_write_private.receipts where storage_uid=old.id;
  end if;
  return old;
end;
$function$;
revoke all on function note_write_private.cleanup_note_receipts() from public, anon, authenticated, service_role;
create trigger cleanup_atomic_note_receipts_auth_owner
after delete on auth.users for each row execute function note_write_private.cleanup_note_receipts();
create trigger cleanup_atomic_note_receipts_storage_owner
after delete on public.medindex_users for each row execute function note_write_private.cleanup_note_receipts();

create function public.write_user_notes_cas(
  p_auth_uid uuid,
  p_storage_uid uuid,
  p_writes jsonb
)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
  v_write jsonb;
  v_storage text;
  v_type text;
  v_key text;
  v_operation uuid;
  v_expected bigint;
  v_content text;
  v_deleted boolean;
  v_restore boolean;
  v_client_stamp timestamptz;
  v_owner uuid;
  v_hash bytea;
  v_receipt note_write_private.receipts%rowtype;
  v_version bigint;
  v_was_deleted boolean;
  v_lock bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_previous_fence text;
  v_result jsonb;
  v_conflicts jsonb[] := array[]::jsonb[];
  v_operations jsonb[] := array[]::jsonb[];
begin
  if current_user<>'service_role' then
    raise exception 'Service role required for atomic note writes' using errcode='42501';
  end if;
  if p_storage_uid is null or p_writes is null
    or pg_catalog.jsonb_typeof(p_writes)<>'array' then
    raise exception 'Invalid atomic note request' using errcode='22023';
  end if;
  if pg_catalog.jsonb_array_length(p_writes)>9000
    or pg_catalog.octet_length(p_writes::text)>2097152 then
    raise exception 'Atomic note request too large' using errcode='22023';
  end if;

  -- Validate every input before locks or mutations. Versions are integers within
  -- JavaScript's exact-number range. Content is preserved byte-for-byte as text.
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    if pg_catalog.jsonb_typeof(v_write)<>'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(v_write) k
        where k not in ('storage','entityType','entityKey','expectedVersion','operationId','content','deleted','restore','clientUpdatedAt'))
      or pg_catalog.jsonb_typeof(v_write->'storage') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'entityType') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'entityKey') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'operationId') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_write->'expectedVersion') is distinct from 'number'
      or (v_write->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,15})$'
      or (v_write->>'expectedVersion')::numeric>9007199254740990
      or pg_catalog.jsonb_typeof(v_write->'content') is distinct from 'string'
      or pg_catalog.char_length(v_write->>'content')>2000
      or pg_catalog.jsonb_typeof(v_write->'deleted') is distinct from 'boolean'
      or (v_write ? 'restore' and pg_catalog.jsonb_typeof(v_write->'restore') is distinct from 'boolean')
      or (v_write ? 'clientUpdatedAt' and pg_catalog.jsonb_typeof(v_write->'clientUpdatedAt') not in ('string','null')) then
      raise exception 'Invalid atomic note write' using errcode='22023';
    end if;
    v_storage := v_write->>'storage';
    v_type := v_write->>'entityType';
    v_key := v_write->>'entityKey';
    if pg_catalog.char_length(v_key) not between 1 and 300
      or (v_write->>'operationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or ((v_write->>'deleted')::boolean and v_write->>'content'<>'')
      or (coalesce((v_write->>'restore')::boolean,false) and (v_write->>'deleted')::boolean) then
      raise exception 'Invalid atomic note identity or action' using errcode='22023';
    end if;
    if v_storage='native' then
      if p_auth_uid is null or v_type not in ('drug','product','substance','variant') then
        raise exception 'Invalid native note owner or type' using errcode='22023';
      end if;
      if v_type in ('drug','product') and (
        v_key<>pg_catalog.lower(v_key)
        or v_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ) then
        raise exception 'Invalid canonical note key' using errcode='22023';
      end if;
    elsif v_storage='legacy' then
      if v_type<>'protocol' or v_key not like 'drug-note:%' then
        raise exception 'Invalid legacy note identity' using errcode='22023';
      end if;
    else
      raise exception 'Invalid note storage' using errcode='22023';
    end if;
    if v_write->>'clientUpdatedAt' is not null then
      if pg_catalog.char_length(v_write->>'clientUpdatedAt')>40
        or (v_write->>'clientUpdatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
        raise exception 'Invalid note client timestamp' using errcode='22023';
      end if;
      v_client_stamp := (v_write->>'clientUpdatedAt')::timestamptz;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_writes) w
    group by w->>'storage',w->>'entityType',w->>'entityKey' having count(*)>1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_writes) w
      group by (w->>'operationId')::uuid having count(*)>1) then
    raise exception 'Duplicate note entity or operation in batch' using errcode='22023';
  end if;

  -- Acquire all entity and receipt locks in one numeric order. Entity locks
  -- cover absent rows too, so concurrent expectedVersion=0 creates have one
  -- winner. Hash collisions only serialize unrelated operations safely.
  for v_lock in
    select lock_id from (
      select pg_catalog.hashtextextended('note-entity:' || (w->>'storage') || ':' ||
        case when w->>'storage'='native' then p_auth_uid::text else p_storage_uid::text end || ':' ||
        (w->>'entityType') || ':' || (w->>'entityKey'),0) lock_id
      from pg_catalog.jsonb_array_elements(p_writes) w
      union
      select pg_catalog.hashtextextended('note-operation:' || p_storage_uid::text || ':' || (w->>'operationId')::uuid::text,0)
      from pg_catalog.jsonb_array_elements(p_writes) w
    ) locks order by lock_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock);
  end loop;

  -- Receipts and versions for the entire batch are checked before any write.
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    v_storage := v_write->>'storage'; v_type := v_write->>'entityType'; v_key := v_write->>'entityKey';
    v_operation := (v_write->>'operationId')::uuid; v_expected := (v_write->>'expectedVersion')::bigint;
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'authUid',p_auth_uid,'storageUid',p_storage_uid,'storage',v_storage,'entityType',v_type,'entityKey',v_key,
      'expectedVersion',v_expected,'content',v_write->>'content','deleted',(v_write->>'deleted')::boolean,
      'restore',coalesce((v_write->>'restore')::boolean,false),'clientUpdatedAt',v_write->>'clientUpdatedAt'
    )::text,'UTF8'));
    select * into v_receipt from note_write_private.receipts
      where storage_uid=p_storage_uid and operation_id=v_operation;
    if found then
      if v_receipt.request_hash is distinct from v_hash then
        return pg_catalog.jsonb_build_object('ok',false,'code','NOTE_OPERATION_REUSED');
      end if;
      continue;
    end if;
    v_version := null; v_was_deleted := false;
    if v_storage='native' then
      select row_version,deleted_at is not null into v_version,v_was_deleted
      from public.user_notes where user_id=p_auth_uid and entity_type=v_type and entity_key=v_key for update;
    else
      select row_version,deleted_at is not null into v_version,v_was_deleted
      from public.user_favorites where user_id=p_storage_uid and entity_type=v_type and entity_key=v_key for update;
    end if;
    if coalesce(v_version,0)<>v_expected
      or (coalesce((v_write->>'restore')::boolean,false) and not coalesce(v_was_deleted,false)) then
      v_conflicts := pg_catalog.array_append(v_conflicts,pg_catalog.jsonb_build_object(
        'storage',v_storage,'entityType',v_type,'entityKey',v_key,
        'rowVersion',coalesce(v_version,0),'deleted',coalesce(v_was_deleted,false)
      ));
    end if;
  end loop;
  if pg_catalog.cardinality(v_conflicts)>0 then
    return pg_catalog.jsonb_build_object('ok',false,'code','NOTE_VERSION_CONFLICT','conflicts',pg_catalog.to_jsonb(v_conflicts));
  end if;

  v_previous_fence := pg_catalog.current_setting('medindex.note_cas_write',true);
  perform pg_catalog.set_config('medindex.note_cas_write','on',true);
  for v_write in select value from pg_catalog.jsonb_array_elements(p_writes) loop
    v_storage := v_write->>'storage'; v_type := v_write->>'entityType'; v_key := v_write->>'entityKey';
    v_operation := (v_write->>'operationId')::uuid; v_expected := (v_write->>'expectedVersion')::bigint;
    v_content := v_write->>'content'; v_deleted := (v_write->>'deleted')::boolean;
    v_client_stamp := (v_write->>'clientUpdatedAt')::timestamptz;
    select * into v_receipt from note_write_private.receipts
      where storage_uid=p_storage_uid and operation_id=v_operation;
    if found then
      v_operations := pg_catalog.array_append(v_operations,v_receipt.result);
      continue;
    end if;
    if v_storage='native' then
      if v_expected=0 then
        insert into public.user_notes(user_id,drug_id,entity_type,entity_key,content,client_updated_at,deleted_at,updated_at,row_version)
        values(p_auth_uid,case when v_type in ('drug','product') then v_key::uuid else null end,
          v_type,v_key,v_content,v_client_stamp,case when v_deleted then v_now else null end,v_now,1)
        returning row_version into v_version;
      else
        update public.user_notes set content=v_content,client_updated_at=v_client_stamp,
          deleted_at=case when v_deleted then v_now else null end,updated_at=v_now
        where user_id=p_auth_uid and entity_type=v_type and entity_key=v_key and row_version=v_expected
        returning row_version into v_version;
      end if;
    else
      if v_expected=0 then
        insert into public.user_favorites(user_id,entity_type,entity_key,payload,client_updated_at,deleted_at,updated_at,row_version)
        values(p_storage_uid,v_type,v_key,pg_catalog.jsonb_build_object('kind','drug-note','text',v_content),
          v_client_stamp,case when v_deleted then v_now else null end,v_now,1)
        returning row_version into v_version;
      else
        update public.user_favorites set payload=pg_catalog.jsonb_build_object('kind','drug-note','text',v_content),
          client_updated_at=v_client_stamp,deleted_at=case when v_deleted then v_now else null end,updated_at=v_now
        where user_id=p_storage_uid and entity_type=v_type and entity_key=v_key and row_version=v_expected
        returning row_version into v_version;
      end if;
    end if;
    if v_version is null then
      raise exception 'Atomic note version changed after preflight' using errcode='40001';
    end if;
    v_result := pg_catalog.jsonb_build_object('operationId',v_operation,'storage',v_storage,
      'entityType',v_type,'entityKey',v_key,'rowVersion',v_version,'deleted',v_deleted);
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'authUid',p_auth_uid,'storageUid',p_storage_uid,'storage',v_storage,'entityType',v_type,'entityKey',v_key,
      'expectedVersion',v_expected,'content',v_content,'deleted',v_deleted,
      'restore',coalesce((v_write->>'restore')::boolean,false),'clientUpdatedAt',v_write->>'clientUpdatedAt'
    )::text,'UTF8'));
    insert into note_write_private.receipts(storage_uid,operation_id,auth_uid,request_hash,result)
      values(p_storage_uid,v_operation,p_auth_uid,v_hash,v_result);
    v_operations := pg_catalog.array_append(v_operations,v_result);
  end loop;
  perform pg_catalog.set_config('medindex.note_cas_write',coalesce(v_previous_fence,''),true);
  return pg_catalog.jsonb_build_object('ok',true,'operations',pg_catalog.to_jsonb(v_operations));
end;
$function$;
revoke all on function public.write_user_notes_cas(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.write_user_notes_cas(uuid,uuid,jsonb) to service_role;

comment on function public.write_user_notes_cas(uuid,uuid,jsonb) is
  'Service-only atomic native/legacy note batch. Owners come from verified server sessions; exact content is not normalized. Per-operation idempotency and version CAS include tombstones.';
