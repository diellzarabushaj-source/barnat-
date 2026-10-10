'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const migrations = fs.readdirSync(migrationDirectory).filter(name => /^\d+_user_notes_atomic_cas\.sql$/.test(name));
assert.equal(migrations.length, 1, 'Atomic notes must have one authoritative additive migration.');
const sql = fs.readFileSync(path.join(migrationDirectory, migrations[0]), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'supabase', 'tests', 'user-notes-atomic-cas-rollback.sql'), 'utf8');

function body(name, source = sql) {
  const declaration = `create function ${name}(`;
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `${name} must exist.`);
  const begin = source.indexOf('as $function$', start);
  const end = source.indexOf('$function$;', begin + 14);
  assert.ok(begin > start && end > begin, `${name} must have a bounded function body.`);
  return { declaration:source.slice(start, begin), body:source.slice(begin, end) };
}

const rpc = body('public.write_user_notes_cas');
assert.match(rpc.declaration, /security invoker set search_path = ''/);
assert.doesNotMatch(rpc.declaration, /security definer/);
assert.match(rpc.body, /current_user<>'service_role'/);
assert.match(sql, /revoke all on function public\.write_user_notes_cas\(uuid,uuid,jsonb\) from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.write_user_notes_cas\(uuid,uuid,jsonb\) to service_role;/);
assert.match(sql, /revoke all on schema note_write_private from public, anon, authenticated;/);
assert.match(sql, /alter table note_write_private\.control enable row level security;/);
assert.match(sql, /alter table note_write_private\.receipts enable row level security;/);
assert.match(sql, /grant select on note_write_private\.control to service_role;/);
assert.doesNotMatch(sql, /grant[^;]*\b(update|all)\b[^;]*note_write_private\.control[^;]*service_role/i);

// A new deployment must not fence the old API before the new API goes live.
assert.match(sql, /insert into note_write_private\.control\(singleton,fence_enabled\) values \(true,false\);/);
assert.doesNotMatch(sql, /update note_write_private\.control set fence_enabled=true/i);
assert.doesNotMatch(sql, /revoke insert,update,delete on public\.user_notes/i);

const receiptDeclaration = sql.slice(sql.indexOf('create table note_write_private.receipts'), sql.indexOf('create index note_write_receipts_auth_uid_idx'));
assert.match(receiptDeclaration, /request_hash bytea not null check \(octet_length\(request_hash\)=32\)/);
assert.match(receiptDeclaration, /primary key\(storage_uid,operation_id\)/);
assert.doesNotMatch(receiptDeclaration, /\b(content|payload)\s+(text|jsonb)\b/i);
assert.match(rpc.body, /v_receipt\.request_hash is distinct from v_hash/);
assert.match(rpc.body, /NOTE_OPERATION_REUSED/);
assert.match(rpc.body, /pg_catalog\.sha256\(pg_catalog\.convert_to\(pg_catalog\.jsonb_build_object/);

// Both the preflight and the actual SQL update enforce the same owner/version.
assert.match(rpc.body, /pg_advisory_xact_lock\(v_lock\)/);
assert.match(rpc.body, /locks order by lock_id/);
assert.match(rpc.body, /coalesce\(v_version,0\)<>v_expected/);
assert.match(rpc.body, /coalesce\(\(v_write->>'restore'\)::boolean,false\) and not coalesce\(v_was_deleted,false\)/);
assert.match(rpc.body, /where user_id=p_auth_uid and entity_type=v_type and entity_key=v_key and row_version=v_expected/);
assert.match(rpc.body, /where user_id=p_storage_uid and entity_type=v_type and entity_key=v_key and row_version=v_expected/);
const conflict = rpc.body.indexOf("'NOTE_VERSION_CONFLICT'");
const fence = rpc.body.indexOf("set_config('medindex.note_cas_write','on',true)");
const firstWrite = rpc.body.indexOf('insert into public.user_notes');
assert.ok(conflict > 0 && conflict < fence && fence < firstWrite, 'Reject the complete conflicting batch before enabling writes.');
assert.match(rpc.body, /set_config\('medindex\.note_cas_write',coalesce\(v_previous_fence,''\),true\)/);
assert.match(rpc.body, /v_key<>pg_catalog\.lower\(v_key\)/);
assert.match(rpc.body, /pg_catalog\.char_length\(v_write->>'content'\)>2000/);
assert.match(rpc.body, /pg_catalog\.jsonb_array_length\(p_writes\)>9000/);
assert.match(rpc.body, /pg_catalog\.octet_length\(p_writes::text\)>2097152/);

const guard = body('note_write_private.guard_note_write');
assert.match(guard.declaration, /security definer set search_path = ''/);
assert.match(guard.body, /current_setting\('role',true\)='service_role'/);
assert.match(guard.body, /if v_fence and not coalesce\(v_cas,false\)/);
assert.match(guard.body, /new\.row_version := old\.row_version\+1/);
assert.match(guard.body, /pg_trigger_depth\(\)>1/);
assert.match(sql, /before insert or update or delete on public\.user_notes/);
assert.match(sql, /before insert or update or delete on public\.user_favorites/);
assert.match(sql, /revoke all on function note_write_private\.guard_note_write\(\) from public, anon, authenticated, service_role;/);
assert.match(sql, /after delete on auth\.users/);
assert.match(sql, /after delete on public\.medindex_users/);

// The additive migration is immutable. Once Phase B exists in migration
// history, its narrower legacy publication check must accompany activation.
const phaseBNames = fs.readdirSync(migrationDirectory).filter(name => /^\d+_activate_user_notes_atomic_cas_fence\.sql$/.test(name));
assert.ok(phaseBNames.length <= 1, 'The activation migration must be authoritative.');
if (phaseBNames.length) {
  const activation = fs.readFileSync(path.join(migrationDirectory, phaseBNames[0]), 'utf8');
  const publication = body('note_write_private.validate_live_drug_note_product', activation);
  assert.match(publication.declaration, /security invoker set search_path = ''/);
  assert.doesNotMatch(publication.declaration, /security definer/);
  assert.match(publication.body, /new\.entity_type='drug' and new\.deleted_at is null/);
  assert.match(publication.body, /from public\.drugs[\s\S]*id=new\.drug_id[\s\S]*is_published=true[\s\S]*editorial_status='published'/);
  assert.match(publication.body, /'Canonical legacy note product is not active' using errcode='23514'/);
  assert.match(activation, /revoke all on function note_write_private\.validate_live_drug_note_product\(\)[\s\S]*from public,anon,authenticated,service_role;/);
  assert.match(activation, /before insert or update on public\.user_notes/);
  assert.match(activation, /update note_write_private\.control set fence_enabled=true/);
  assert.match(activation, /revoke insert,update,delete on public\.user_notes from public,anon,authenticated/);
  assert.match(activation, /revoke truncate on public\.user_notes,public\.user_favorites from public,anon,authenticated,service_role/);
  assert.ok(activation.indexOf('create trigger validate_live_legacy_note_product') < activation.indexOf('set fence_enabled=true'), 'Install the publication guard before activating the fence.');
}

// SQL evidence is a generated fixture, not an inspection of a user's notes.
assert.match(rollback, /\bbegin;/);
assert.match(rollback, /set local role service_role;/);
assert.match(rollback, /begin;[\s\S]*update note_write_private\.control set fence_enabled=false where singleton;[\s\S]*do \$fixture\$/);
assert.match(rollback, /\brollback;[\s\S]*deployed_fence_enabled/);
assert.match(rollback, /auth_a uuid := pg_catalog\.gen_random_uuid\(\)/);
for (const scenario of [
  'owner isolation failed', 'exact whitespace/Unicode note changed',
  'lost-response retry changed receipt', 'reused operation accepted different content',
  'conflicting batch partially wrote', 'stale edit won using future client clock',
  'exact tombstone restore failed', 'stale ABA undo accepted',
  'inactive product or partial identity batch accepted',
  'direct native versions did not increment', 'direct legacy versions did not increment',
  'direct native write bypassed active fence', 'direct legacy write bypassed active fence',
  'untrusted role spoofed fence', 'auth-owner cascade or receipt cleanup failed',
  'fresh legacy native inactive creation accepted',
  'fresh legacy native inactive edit or partial batch accepted',
  'accepted legacy retry after unpublish was rejected',
  'accepted product retry after unpublish was rejected',
  'inactive legacy native tombstone was rejected',
]) assert.ok(rollback.includes(scenario), `Missing SQL evidence: ${scenario}`);

console.log('Atomic note database security, preflight and rollout contracts passed.');
