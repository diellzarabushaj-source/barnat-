-- Real PostgreSQL/service_role evidence using exclusively generated synthetic
-- accounts, products and notes. No real private user row is read or changed.
-- All generated rows, flags and receipts are discarded by the final ROLLBACK.
begin;

do $fixture$
declare
  auth_a uuid := pg_catalog.gen_random_uuid();
  auth_b uuid := pg_catalog.gen_random_uuid();
  storage_a uuid := pg_catalog.gen_random_uuid();
  storage_b uuid := pg_catalog.gen_random_uuid();
  product_a uuid := ('a' || pg_catalog.substr(pg_catalog.gen_random_uuid()::text,2))::uuid;
  product_inactive uuid := pg_catalog.gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (auth_a,'synthetic-notes-a-' || auth_a::text || '@example.invalid','{}'::jsonb),
    (auth_b,'synthetic-notes-b-' || auth_b::text || '@example.invalid','{}'::jsonb);
  insert into public.medindex_users(id,email) values
    (storage_a,'synthetic-storage-a-' || storage_a::text || '@example.invalid'),
    (storage_b,'synthetic-storage-b-' || storage_b::text || '@example.invalid');
  update public.profiles set legacy_user_id=storage_a where id=auth_a;
  update public.profiles set legacy_user_id=storage_b where id=auth_b;
  insert into public.drugs(id,trade_name,is_published,editorial_status) values
    (product_a,'Synthetic CAS product: no clinical content',true,'published'),
    (product_inactive,'Synthetic CAS inactive product: no clinical content',false,'draft');
  perform pg_catalog.set_config('drx.synthetic.note_auth_a',auth_a::text,true);
  perform pg_catalog.set_config('drx.synthetic.note_auth_b',auth_b::text,true);
  perform pg_catalog.set_config('drx.synthetic.note_storage_a',storage_a::text,true);
  perform pg_catalog.set_config('drx.synthetic.note_storage_b',storage_b::text,true);
  perform pg_catalog.set_config('drx.synthetic.note_product_a',product_a::text,true);
  perform pg_catalog.set_config('drx.synthetic.note_product_inactive',product_inactive::text,true);
end;
$fixture$;

set local role service_role;
do $check$
declare
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.note_auth_a')::uuid;
  auth_b uuid := pg_catalog.current_setting('drx.synthetic.note_auth_b')::uuid;
  storage_a uuid := pg_catalog.current_setting('drx.synthetic.note_storage_a')::uuid;
  storage_b uuid := pg_catalog.current_setting('drx.synthetic.note_storage_b')::uuid;
  product_a uuid := pg_catalog.current_setting('drx.synthetic.note_product_a')::uuid;
  product_inactive uuid := pg_catalog.current_setting('drx.synthetic.note_product_inactive')::uuid;
  w jsonb;
  initial_write jsonb;
  delete_write jsonb;
  answer jsonb;
  initial_answer jsonb;
  exact_text text := E'  Synthetic line 1\n\tline 2; Ë / ç / 🧪  ';
  version bigint;
  receipt_count bigint;
  rejected boolean;
begin
  if pg_catalog.has_function_privilege('anon','public.write_user_notes_cas(uuid,uuid,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.write_user_notes_cas(uuid,uuid,jsonb)','EXECUTE')
    or pg_catalog.has_schema_privilege('authenticated','note_write_private','USAGE')
    or pg_catalog.has_schema_privilege('anon','note_write_private','USAGE')
    or pg_catalog.has_table_privilege('authenticated','note_write_private.receipts','SELECT')
    or pg_catalog.has_table_privilege('service_role','note_write_private.control','UPDATE') then
    raise exception 'Synthetic CAS check: permissions are too broad';
  end if;
  if not pg_catalog.has_function_privilege('service_role','public.write_user_notes_cas(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'Synthetic CAS check: service execution missing';
  end if;

  -- While Phase A remains additive, old writers cannot forge/backdate versions.
  insert into public.user_notes(user_id,entity_type,entity_key,content,row_version)
    values(auth_a,'variant','synthetic-direct','old direct',999);
  update public.user_notes set content='old direct changed',row_version=999
    where user_id=auth_a and entity_type='variant' and entity_key='synthetic-direct';
  select row_version into version from public.user_notes
    where user_id=auth_a and entity_type='variant' and entity_key='synthetic-direct';
  if version<>2 then raise exception 'Synthetic CAS check: direct native versions did not increment'; end if;
  insert into public.user_favorites(user_id,entity_type,entity_key,payload,row_version)
    values(storage_a,'protocol','drug-note:synthetic-direct','{"kind":"drug-note","text":"old direct"}'::jsonb,999);
  update public.user_favorites set payload='{"kind":"drug-note","text":"changed"}'::jsonb,row_version=999
    where user_id=storage_a and entity_type='protocol' and entity_key='drug-note:synthetic-direct';
  select row_version into version from public.user_favorites
    where user_id=storage_a and entity_type='protocol' and entity_key='drug-note:synthetic-direct';
  if version<>2 then raise exception 'Synthetic CAS check: direct legacy versions did not increment'; end if;

  w := pg_catalog.jsonb_build_object('storage','native','entityType','variant','entityKey','synthetic-main',
    'expectedVersion',0,'operationId',pg_catalog.gen_random_uuid(),'content',exact_text,'deleted',false,'restore',false,
    'clientUpdatedAt','2026-10-10T12:00:00.000Z');
  initial_write := w;
  initial_answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if initial_answer->>'ok'<>'true' or initial_answer#>>'{operations,0,rowVersion}'<>'1' then
    raise exception 'Synthetic CAS check: absent expectedVersion=0 create failed';
  end if;
  if not exists(select 1 from public.user_notes where user_id=auth_a and entity_type='variant'
    and entity_key='synthetic-main' and content=exact_text and row_version=1) then
    raise exception 'Synthetic CAS check: exact whitespace/Unicode note changed';
  end if;
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer is distinct from initial_answer then raise exception 'Synthetic CAS check: lost-response retry changed receipt'; end if;
  w := pg_catalog.jsonb_set(w,'{content}','"changed same operation"'::jsonb);
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'code'<>'NOTE_OPERATION_REUSED' then raise exception 'Synthetic CAS check: reused operation accepted different content'; end if;

  -- The other owner can create the same key; the original remains untouched.
  w := pg_catalog.jsonb_set(initial_write,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{content}','"owner B"'::jsonb);
  answer := public.write_user_notes_cas(auth_b,storage_b,pg_catalog.jsonb_build_array(w));
  if answer->>'ok'<>'true' or not exists(select 1 from public.user_notes where user_id=auth_b and entity_key='synthetic-main' and content='owner B')
    or not exists(select 1 from public.user_notes where user_id=auth_a and entity_key='synthetic-main' and content=exact_text) then
    raise exception 'Synthetic CAS check: owner isolation failed';
  end if;

  -- A second stale create loses. A stale member prevents every new batch write.
  w := pg_catalog.jsonb_set(initial_write,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'code'<>'NOTE_VERSION_CONFLICT' then raise exception 'Synthetic CAS check: duplicate absent create did not conflict'; end if;
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_set(w,'{entityKey}','"synthetic-batch-new"'::jsonb),
    pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()))));
  if answer->>'code'<>'NOTE_VERSION_CONFLICT'
    or exists(select 1 from public.user_notes where user_id=auth_a and entity_key='synthetic-batch-new') then
    raise exception 'Synthetic CAS check: conflicting batch partially wrote';
  end if;

  -- Older clocks are metadata, not authority. First edit wins; stale second loses.
  w := pg_catalog.jsonb_set(initial_write,'{expectedVersion}','1'::jsonb);
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{clientUpdatedAt}','"2020-01-01T00:00:00.000Z"'::jsonb);
  w := pg_catalog.jsonb_set(w,'{content}','"winning edit"'::jsonb);
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer#>>'{operations,0,rowVersion}'<>'2' then raise exception 'Synthetic CAS check: versioned edit rejected older client clock'; end if;
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{clientUpdatedAt}','"2100-01-01T00:00:00.000Z"'::jsonb);
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'code'<>'NOTE_VERSION_CONFLICT' then raise exception 'Synthetic CAS check: stale edit won using future client clock'; end if;

  -- Delete acknowledges version3; only that exact tombstone can be restored.
  w := pg_catalog.jsonb_set(w,'{expectedVersion}','2'::jsonb);
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{deleted}','true'::jsonb);
  w := pg_catalog.jsonb_set(w,'{content}','""'::jsonb);
  delete_write := w;
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer#>>'{operations,0,rowVersion}'<>'3' or answer#>>'{operations,0,deleted}'<>'true' then
    raise exception 'Synthetic CAS check: delete receipt/tombstone incorrect';
  end if;
  w := pg_catalog.jsonb_set(w,'{expectedVersion}','3'::jsonb);
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{deleted}','false'::jsonb);
  w := pg_catalog.jsonb_set(w,'{restore}','true'::jsonb);
  w := pg_catalog.jsonb_set(w,'{content}',pg_catalog.to_jsonb(exact_text));
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer#>>'{operations,0,rowVersion}'<>'4' or not exists(select 1 from public.user_notes
    where user_id=auth_a and entity_key='synthetic-main' and content=exact_text and deleted_at is null) then
    raise exception 'Synthetic CAS check: exact tombstone restore failed';
  end if;
  -- A second restore against a live row is refused even with its current version.
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  w := pg_catalog.jsonb_set(w,'{expectedVersion}','4'::jsonb);
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'code'<>'NOTE_VERSION_CONFLICT' then raise exception 'Synthetic CAS check: restore overwrote live row'; end if;
  -- Delete again => version5. Original version3 undo must fail (ABA).
  delete_write := pg_catalog.jsonb_set(delete_write,'{expectedVersion}','4'::jsonb);
  delete_write := pg_catalog.jsonb_set(delete_write,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(delete_write));
  if answer#>>'{operations,0,rowVersion}'<>'5' then raise exception 'Synthetic CAS check: second deletion failed'; end if;
  w := pg_catalog.jsonb_set(w,'{expectedVersion}','3'::jsonb);
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'code'<>'NOTE_VERSION_CONFLICT' then raise exception 'Synthetic CAS check: stale ABA undo accepted'; end if;
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(initial_write));
  if answer is distinct from initial_answer or not exists(select 1 from public.user_notes
    where user_id=auth_a and entity_key='synthetic-main' and row_version=5 and deleted_at is not null) then
    raise exception 'Synthetic CAS check: old retry overwrote newer tombstone';
  end if;

  -- Native/legacy writes share one batch, preserving their different owner IDs.
  w := pg_catalog.jsonb_set(initial_write,'{entityKey}','"drug-note:synthetic-cas"'::jsonb);
  w := pg_catalog.jsonb_set(w,'{storage}','"legacy"'::jsonb);
  w := pg_catalog.jsonb_set(w,'{entityType}','"protocol"'::jsonb);
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w,
    pg_catalog.jsonb_set(pg_catalog.jsonb_set(initial_write,'{entityKey}','"synthetic-mixed-native"'::jsonb),
      '{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()))));
  if answer->>'ok'<>'true' or not exists(select 1 from public.user_favorites where user_id=storage_a
    and entity_key='drug-note:synthetic-cas' and payload->>'text'=exact_text and row_version=1)
    or exists(select 1 from public.user_favorites where user_id=auth_a and entity_key='drug-note:synthetic-cas') then
    raise exception 'Synthetic CAS check: legacy owner or exact text was lost';
  end if;
  select count(*) into receipt_count from note_write_private.receipts where storage_uid=storage_a;
  if exists(select 1 from note_write_private.receipts where storage_uid=storage_a
    and (result ? 'content' or result ? 'payload' or octet_length(request_hash)<>32)) then
    raise exception 'Synthetic CAS check: receipt retained note content';
  end if;

  -- Canonical product rules survive the RPC; one failed identity rolls back an
  -- earlier valid write in the same function call (not only version conflicts).
  w := pg_catalog.jsonb_set(initial_write,'{entityType}','"product"'::jsonb);
  w := pg_catalog.jsonb_set(w,'{entityKey}',pg_catalog.to_jsonb(product_a::text));
  w := pg_catalog.jsonb_set(w,'{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()));
  answer := public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w));
  if answer->>'ok'<>'true' or not exists(select 1 from public.user_notes
    where user_id=auth_a and entity_type='product' and entity_key=product_a::text and drug_id=product_a) then
    raise exception 'Synthetic CAS check: canonical product identity lost';
  end if;
  rejected := false;
  begin
    perform public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_set(pg_catalog.jsonb_set(initial_write,'{entityKey}','"synthetic-identity-batch"'::jsonb),
        '{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid())),
      pg_catalog.jsonb_set(pg_catalog.jsonb_set(w,'{entityKey}',pg_catalog.to_jsonb(product_inactive::text)),
        '{operationId}',pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()))));
  exception when check_violation then rejected := true;
  end;
  if not rejected or exists(select 1 from public.user_notes where user_id=auth_a and entity_key='synthetic-identity-batch') then
    raise exception 'Synthetic CAS check: inactive product or partial identity batch accepted';
  end if;
  rejected := false;
  begin
    perform public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_set(w,'{entityKey}',pg_catalog.to_jsonb(pg_catalog.upper(product_a::text)))));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: uppercase canonical product key accepted'; end if;
  rejected := false;
  begin
    perform public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w,w));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: duplicate batch writes accepted'; end if;
  rejected := false;
  begin
    perform public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_set(initial_write,'{content}',pg_catalog.to_jsonb(pg_catalog.repeat('x',2001)))));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: overlong note accepted'; end if;
  if coalesce(pg_catalog.current_setting('medindex.note_cas_write',true),'')='on' then
    raise exception 'Synthetic CAS check: function leaked its write fence';
  end if;
end;
$check$;

-- Activate only inside this transaction; other sessions still see fenceOFF.
reset role;
update note_write_private.control set fence_enabled=true where singleton;
set local role service_role;
do $fence$
declare
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.note_auth_a')::uuid;
  storage_a uuid := pg_catalog.current_setting('drx.synthetic.note_storage_a')::uuid;
  w jsonb;
  rejected boolean;
begin
  rejected := false;
  begin
    update public.user_notes set content='bypass'
      where user_id=auth_a and entity_key='synthetic-direct';
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: direct native write bypassed active fence'; end if;
  rejected := false;
  begin
    update public.user_favorites set payload='{}'::jsonb
      where user_id=storage_a and entity_key='drug-note:synthetic-direct';
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: direct legacy write bypassed active fence'; end if;
  rejected := false;
  begin
    delete from public.user_notes where user_id=auth_a and entity_key='synthetic-direct';
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: direct deletion removed tombstone history'; end if;
  w := pg_catalog.jsonb_build_object('storage','native','entityType','variant','entityKey','synthetic-after-fence',
    'expectedVersion',0,'operationId',pg_catalog.gen_random_uuid(),'content','CAS after fence','deleted',false,
    'restore',false,'clientUpdatedAt','2026-10-10T12:00:00.000Z');
  if (public.write_user_notes_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(w))->>'ok')<>'true' then
    raise exception 'Synthetic CAS check: legitimate RPC blocked by active fence';
  end if;
  -- Ordinary non-note favorites retain their existing write path.
  insert into public.user_favorites(user_id,entity_type,entity_key,payload)
    values(storage_a,'protocol','synthetic-normal-favorite','{}'::jsonb);
  update public.user_favorites set payload='{"label":"changed"}'::jsonb
    where user_id=storage_a and entity_key='synthetic-normal-favorite';
end;
$fence$;

-- An authenticated caller cannot spoof the private RPC's fence setting.
reset role;
select pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object(
  'sub',pg_catalog.current_setting('drx.synthetic.note_auth_a'),'role','authenticated')::text,true);
set local role authenticated;
do $untrusted$
declare rejected boolean := false;
begin
  perform pg_catalog.set_config('medindex.note_cas_write','on',true);
  begin
    insert into public.user_notes(user_id,entity_type,entity_key,content)
      values(pg_catalog.current_setting('drx.synthetic.note_auth_a')::uuid,
        'variant','synthetic-untrusted','authenticated bypass');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic CAS check: untrusted role spoofed fence'; end if;
  perform pg_catalog.set_config('medindex.note_cas_write','',true);
end;
$untrusted$;

-- Existing account deletion cascades must still remove native notes and receipts.
reset role;
do $cascade$
declare
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.note_auth_a')::uuid;
  storage_a uuid := pg_catalog.current_setting('drx.synthetic.note_storage_a')::uuid;
begin
  delete from auth.users where id=auth_a;
  if exists(select 1 from public.user_notes where user_id=auth_a)
    or exists(select 1 from note_write_private.receipts where auth_uid=auth_a) then
    raise exception 'Synthetic CAS check: auth-owner cascade or receipt cleanup failed';
  end if;
  delete from public.medindex_users where id=storage_a;
  if exists(select 1 from note_write_private.receipts where storage_uid=storage_a) then
    raise exception 'Synthetic CAS check: storage-owner receipt cleanup failed';
  end if;
end;
$cascade$;

rollback;
select 'Synthetic note CAS, owner isolation, retries, rollback, fence and cascade checks passed' as result,
  (select fence_enabled from note_write_private.control where singleton) as deployed_fence_enabled;
