-- Only generated fixture owners are queried. No real personal row is accessed.
-- Changes to rows, receipts and rollout flags are discarded by ROLLBACK.
begin;
update prescription_write_private.control set fence_enabled=false where singleton;
do $fixture$
declare
  auth_a uuid := pg_catalog.gen_random_uuid();
  auth_b uuid := pg_catalog.gen_random_uuid();
  storage_a uuid := pg_catalog.gen_random_uuid();
  storage_b uuid := pg_catalog.gen_random_uuid();
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (auth_a,'synthetic-library-a-' || auth_a::text || '@example.invalid','{}'::jsonb),
    (auth_b,'synthetic-library-b-' || auth_b::text || '@example.invalid','{}'::jsonb);
  insert into public.medindex_users(id,email) values
    (storage_a,'synthetic-library-storage-a-' || storage_a::text || '@example.invalid'),
    (storage_b,'synthetic-library-storage-b-' || storage_b::text || '@example.invalid');
  update public.profiles set legacy_user_id=storage_a where id=auth_a;
  update public.profiles set legacy_user_id=storage_b where id=auth_b;
  perform pg_catalog.set_config('drx.synthetic.library_auth_a',auth_a::text,true);
  perform pg_catalog.set_config('drx.synthetic.library_auth_b',auth_b::text,true);
  perform pg_catalog.set_config('drx.synthetic.library_storage_a',storage_a::text,true);
  perform pg_catalog.set_config('drx.synthetic.library_storage_b',storage_b::text,true);
end;
$fixture$;
set local role service_role;
do $check$
declare
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.library_auth_a')::uuid;
  auth_b uuid := pg_catalog.current_setting('drx.synthetic.library_auth_b')::uuid;
  storage_a uuid := pg_catalog.current_setting('drx.synthetic.library_storage_a')::uuid;
  storage_b uuid := pg_catalog.current_setting('drx.synthetic.library_storage_b')::uuid;
  rx jsonb;
  note jsonb;
  fav jsonb;
  drug jsonb;
  initial_rx jsonb;
  answer jsonb;
  initial_answer jsonb;
  bad jsonb;
  rejected boolean;
  initial_version bigint;
  ciphertext jsonb := '{"v":2,"kid":"kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk","alg":"A256GCM","iv":"dD0bZuFu4EoATAS1","tag":"1m-sJOHtFMCRsoUHG4Taew","ciphertext":"LyiNOgmQ4PMC8m7A4WKSqgNoKfwMhTm857z6zUdUhbf4WHTYPr5fEp-Y86WBn0Dqvg22Ko0lLuZ_I-YvxyVRD4lKDH9aOrZRtVF09xkDRuGdOq6pSkbTH1tk7sGvkPBIvRx3hyXHgcNfCFgO-cWa1qx3iouJDf8jLMwKUxtXQFnKxHU"}'::jsonb;
begin
  -- An actual encryptJson synthetic envelope proves byte-exact persistence;
  -- API tests separately use actual encryptJson/decryptJson and owner AAD.
  if pg_catalog.has_function_privilege('anon','public.write_user_library_cas(uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.write_user_prescriptions_cas(uuid,uuid,jsonb)','EXECUTE')
    or pg_catalog.has_schema_privilege('authenticated','prescription_write_private','USAGE')
    or pg_catalog.has_table_privilege('service_role','prescription_write_private.control','UPDATE')
    or pg_catalog.has_table_privilege('authenticated','prescription_write_private.receipts','SELECT') then
    raise exception 'Synthetic library check: excessive permissions';
  end if;
  if not pg_catalog.has_function_privilege('service_role','public.write_user_library_cas(uuid,uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Synthetic library check: service privilege absent';
  end if;
  -- Existing direct writers receive server versions while Phase A is off.
  insert into public.user_prescriptions(user_id,client_id,payload,row_version)
    values(storage_a,'synthetic-direct',ciphertext,999);
  update public.user_prescriptions set payload=ciphertext,row_version=999
    where user_id=storage_a and client_id='synthetic-direct';
  if (select row_version from public.user_prescriptions where user_id=storage_a and client_id='synthetic-direct')<>2 then
    raise exception 'Synthetic library check: direct versions not server controlled';
  end if;
  note := pg_catalog.jsonb_build_object('storage','native','entityType','variant','entityKey','synthetic-note',
    'expectedVersion',0,'operationId',pg_catalog.gen_random_uuid(),'content',E'  Ë / ç / 🧪\nsource exact  ',
    'deleted',false,'restore',false,'clientUpdatedAt','2026-10-10T11:00:00.000Z');
  rx := pg_catalog.jsonb_build_object('clientId','synthetic-rx','expectedVersion',0,
    'operationId',pg_catalog.gen_random_uuid(),'payload',ciphertext,'payloadDigest',pg_catalog.repeat('a',64),
    'chapterKey',null,'deleted',false,'restore',false,'clientUpdatedAt','2026-10-10T11:00:00.000Z');
  fav := pg_catalog.jsonb_build_object('user_id',storage_a,'drug_id',null,'entity_type','protocol',
    'entity_key','synthetic-favorite','payload','{}'::jsonb,'client_updated_at','2026-10-10T11:00:00.000Z',
    'deleted_at',null,'updated_at','2026-10-10T11:00:00.000Z');
  drug := pg_catalog.jsonb_build_object('user_id',storage_a,'client_id','synthetic-personal-drug',
    'name','Synthetic personal drug','payload','{}'::jsonb,'client_updated_at','2026-10-10T11:00:00.000Z',
    'deleted_at',null,'updated_at','2026-10-10T11:00:00.000Z');
  initial_rx := rx;
  answer := public.write_user_library_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(note),
    pg_catalog.jsonb_build_array(rx),pg_catalog.jsonb_build_array(fav),pg_catalog.jsonb_build_array(drug));
  if answer->'ok' is distinct from 'true'::jsonb or answer#>>'{prescriptions,operations,0,rowVersion}'<>'1'
    or (select payload from public.user_prescriptions where user_id=storage_a and client_id='synthetic-rx') is distinct from ciphertext
    or (select content from public.user_notes where user_id=auth_a and entity_key='synthetic-note') is distinct from note->>'content' then
    raise exception 'Synthetic library check: initial atomic write or exact content failed';
  end if;
  initial_answer := answer;
  answer := public.write_user_library_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(note),
    pg_catalog.jsonb_build_array(rx),pg_catalog.jsonb_build_array(fav),pg_catalog.jsonb_build_array(drug));
  if answer#>'{notes,operations}' is distinct from initial_answer#>'{notes,operations}'
    or answer#>'{prescriptions,operations}' is distinct from initial_answer#>'{prescriptions,operations}'
    or (select row_version from public.user_prescriptions where user_id=storage_a and client_id='synthetic-rx')<>1 then
    raise exception 'Synthetic library check: lost response retry changed acknowledgement';
  end if;
  -- The same client key in another owner is independently absent.
  rx := initial_rx || pg_catalog.jsonb_build_object('operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_b,storage_b,pg_catalog.jsonb_build_array(rx));
  if answer->'ok' is distinct from 'true'::jsonb then raise exception 'Synthetic library check: owner isolation failed'; end if;
  -- Immutable receipts reject changed semantic payload even with fresh ciphertext.
  rx := initial_rx || pg_catalog.jsonb_build_object('payloadDigest',pg_catalog.repeat('b',64));
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx));
  if answer->>'code'<>'PRESCRIPTION_OPERATION_REUSED' then raise exception 'Synthetic library check: operation reuse accepted'; end if;
  -- A later Rx conflict must roll back earlier note writes AND receipts.
  note := note || pg_catalog.jsonb_build_object('entityKey','synthetic-rollback-note','operationId',pg_catalog.gen_random_uuid());
  rx := initial_rx || pg_catalog.jsonb_build_object('operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_library_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(note),
    pg_catalog.jsonb_build_array(rx),'[]'::jsonb,'[]'::jsonb);
  if answer->>'source'<>'prescriptions' or answer->>'code'<>'PRESCRIPTION_VERSION_CONFLICT'
    or exists(select 1 from public.user_notes where user_id=auth_a and entity_key='synthetic-rollback-note')
    or exists(select 1 from note_write_private.receipts where storage_uid=storage_a and operation_id=(note->>'operationId')::uuid) then
    raise exception 'Synthetic library check: later Rx conflict retained earlier note or receipt';
  end if;
  -- SQL failure after BOTH child writes must likewise roll back both receipts.
  rx := initial_rx || pg_catalog.jsonb_build_object('clientId','synthetic-rollback-rx','operationId',pg_catalog.gen_random_uuid());
  bad := fav || pg_catalog.jsonb_build_object('entity_type','drug','entity_key','synthetic-missing-product','drug_id',pg_catalog.gen_random_uuid());
  rejected := false;
  begin
    perform public.write_user_library_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(note),
      pg_catalog.jsonb_build_array(rx),pg_catalog.jsonb_build_array(bad),'[]'::jsonb);
  exception when foreign_key_violation or check_violation then rejected := true;
  end;
  if not rejected or exists(select 1 from public.user_notes where user_id=auth_a and entity_key='synthetic-rollback-note')
    or exists(select 1 from public.user_prescriptions where user_id=storage_a and client_id='synthetic-rollback-rx')
    or exists(select 1 from note_write_private.receipts where storage_uid=storage_a and operation_id=(note->>'operationId')::uuid)
    or exists(select 1 from prescription_write_private.receipts where storage_uid=storage_a and operation_id=(rx->>'operationId')::uuid) then
    raise exception 'Synthetic library check: later ordinary failure retained protected writes';
  end if;
  -- A retried operation rolled back above is still free to commit exactly once.
  answer := public.write_user_library_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(note),
    pg_catalog.jsonb_build_array(rx),'[]'::jsonb,'[]'::jsonb);
  if answer->'ok' is distinct from 'true'::jsonb then raise exception 'Synthetic library check: rollback poisoned retry'; end if;
  -- Child whole-batch preflight: valid first edit cannot commit with stale second.
  rx := initial_rx || pg_catalog.jsonb_build_object('expectedVersion',1,'operationId',pg_catalog.gen_random_uuid(),'payloadDigest',pg_catalog.repeat('c',64));
  bad := rx || pg_catalog.jsonb_build_object('clientId','synthetic-rollback-rx','expectedVersion',0,'operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx,bad));
  if answer->>'code'<>'PRESCRIPTION_VERSION_CONFLICT'
    or (select row_version from public.user_prescriptions where user_id=storage_a and client_id='synthetic-rx')<>1 then
    raise exception 'Synthetic library check: child conflicting batch partially wrote';
  end if;
  -- Exact-version delete / Undo / later delete forms an ABA history.
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx));
  if answer#>>'{operations,0,rowVersion}'<>'2' then raise exception 'Synthetic library check: fresh edit failed'; end if;
  rx := rx || pg_catalog.jsonb_build_object('expectedVersion',2,'deleted',true,'operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx));
  if answer#>>'{operations,0,rowVersion}'<>'3' or answer#>>'{operations,0,deleted}'<>'true' then raise exception 'Synthetic library check: deletion failed'; end if;
  bad := rx || pg_catalog.jsonb_build_object('expectedVersion',3,'deleted',false,'restore',false,'operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(bad));
  if answer->>'code'<>'PRESCRIPTION_VERSION_CONFLICT' then raise exception 'Synthetic library check: implicit deleted-row restore accepted'; end if;
  rx := bad || pg_catalog.jsonb_build_object('restore',true,'operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx));
  if answer#>>'{operations,0,rowVersion}'<>'4' then raise exception 'Synthetic library check: exact tombstone restore failed'; end if;
  bad := rx;
  rx := rx || pg_catalog.jsonb_build_object('expectedVersion',4,'deleted',true,'restore',false,'operationId',pg_catalog.gen_random_uuid());
  perform public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(rx));
  bad := bad || pg_catalog.jsonb_build_object('operationId',pg_catalog.gen_random_uuid());
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(bad));
  if answer->>'code'<>'PRESCRIPTION_VERSION_CONFLICT' then raise exception 'Synthetic library check: stale ABA Undo accepted'; end if;
  answer := public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(initial_rx));
  if answer#>>'{operations,0,rowVersion}'<>'1'
    or (select row_version from public.user_prescriptions where user_id=storage_a and client_id='synthetic-rx')<>5 then
    raise exception 'Synthetic library check: old receipt retry overwrote tombstone';
  end if;
  -- Ordinary timestamps are checked under the same transaction, preventing a
  -- stale pre-read from overwriting a newer ordinary record on another device.
  bad := drug || pg_catalog.jsonb_build_object('name','Stale overwrite','client_updated_at','2020-01-01T00:00:00.000Z');
  perform public.write_user_library_cas(null,storage_a,'[]','[]','[]',pg_catalog.jsonb_build_array(bad));
  if (select name from public.user_drugs where user_id=storage_a and client_id='synthetic-personal-drug')<>'Synthetic personal drug' then
    raise exception 'Synthetic library check: stale ordinary record overwrote newer';
  end if;
  rejected := false;
  begin
    perform public.write_user_library_cas(auth_a,storage_a,'[]','[]',pg_catalog.jsonb_build_array(fav || pg_catalog.jsonb_build_object('user_id',storage_b)),'[]');
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic library check: foreign ordinary owner accepted'; end if;
  rejected := false;
  begin
    perform public.write_user_library_cas(auth_a,storage_a,'[]','[]',pg_catalog.jsonb_build_array(fav || '{"row_version":999}'::jsonb),'[]');
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic library check: row version injection accepted'; end if;
  rejected := false;
  begin
    perform public.write_user_prescriptions_cas(auth_a,storage_a,pg_catalog.jsonb_build_array(initial_rx || pg_catalog.jsonb_build_object('payload',ciphertext-'tag')));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Synthetic library check: missing envelope tag accepted'; end if;
  if coalesce(pg_catalog.current_setting('medindex.note_cas_write',true),'')<>''
    or coalesce(pg_catalog.current_setting('medindex.prescription_cas_write',true),'')<>'' then
    raise exception 'Synthetic library check: RPC leaked write fence';
  end if;
end;
$check$;
-- The committed fence stays untouched. Other sessions continue observing its
-- original value while this transaction tests the protected path.
reset role;
update prescription_write_private.control set fence_enabled=true where singleton;
set local role service_role;
do $fence$
declare
  owner_a uuid := pg_catalog.current_setting('drx.synthetic.library_storage_a')::uuid;
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.library_auth_a')::uuid;
  rejected boolean := false;
  answer jsonb;
begin
  begin update public.user_prescriptions set name='forbidden' where user_id=owner_a and client_id='synthetic-rx';
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Synthetic library check: direct update bypassed active fence'; end if;
  rejected := false;
  begin delete from public.user_prescriptions where user_id=owner_a and client_id='synthetic-rx';
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Synthetic library check: direct delete bypassed active fence'; end if;
  answer := public.write_user_prescriptions_cas(auth_a,owner_a,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'clientId','synthetic-fenced','expectedVersion',0,'operationId',pg_catalog.gen_random_uuid(),
    'payload','{"v":1,"alg":"A256GCM","iv":"abcdefghijklmnop","tag":"abcdefghijklmnopqrstuv","ciphertext":"YQ"}'::jsonb,
    'payloadDigest',pg_catalog.repeat('a',64),'chapterKey',null,'deleted',false,'restore',false,'clientUpdatedAt','2026-10-10T11:00:00.000Z')));
  if answer->'ok' is distinct from 'true'::jsonb then raise exception 'Synthetic library check: service RPC refused active fence'; end if;
end;
$fence$;
set local role authenticated;
do $untrusted$
declare rejected boolean := false;
begin
  perform pg_catalog.set_config('medindex.prescription_cas_write','on',true);
  begin
    update public.user_prescriptions set name='forbidden' where user_id=pg_catalog.current_setting('drx.synthetic.library_storage_a')::uuid;
    -- RLS can hide every row, but execute privilege must also be denied.
    perform public.write_user_prescriptions_cas(null,pg_catalog.current_setting('drx.synthetic.library_storage_a')::uuid,'[]');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Synthetic library check: untrusted role spoofed protected RPC'; end if;
end;
$untrusted$;
reset role;
do $cascade$
declare
  auth_a uuid := pg_catalog.current_setting('drx.synthetic.library_auth_a')::uuid;
  storage_a uuid := pg_catalog.current_setting('drx.synthetic.library_storage_a')::uuid;
begin
  delete from auth.users where id=auth_a;
  if exists(select 1 from prescription_write_private.receipts where auth_uid=auth_a) then
    raise exception 'Synthetic library check: auth-owner receipt cleanup failed';
  end if;
  delete from public.medindex_users where id=storage_a;
  if exists(select 1 from prescription_write_private.receipts where storage_uid=storage_a) then
    raise exception 'Synthetic library check: storage-owner receipt cleanup failed';
  end if;
end;
$cascade$;
rollback;
select 'Synthetic library CAS, whole-snapshot rollback, retries, owner isolation, ABA and fences passed' as result,
  (select fence_enabled from prescription_write_private.control where singleton) as deployed_prescription_fence_enabled;
