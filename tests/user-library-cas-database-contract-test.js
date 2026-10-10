'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter(name => /^\d+_user_library_atomic_cas\.sql$/.test(name));
assert.equal(migrations.length, 1);
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', migrations[0]), 'utf8').replace(/\r\n/g,'\n');
const fixture = fs.readFileSync(path.join(root, 'supabase/tests/user-library-atomic-cas-rollback.sql'), 'utf8').replace(/\r\n/g,'\n');
const activations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter(name => /^\d+_activate_user_prescriptions_atomic_cas_fence\.sql$/.test(name));
assert.deepEqual(activations, ['20261010215812_activate_user_prescriptions_atomic_cas_fence.sql']);
const activation = fs.readFileSync(path.join(root, 'supabase/migrations', activations[0]), 'utf8')
  .replace(/\r\n/g,'\n').replace(/^\s*--.*$/gm,'');
assert.match(activation, /update prescription_write_private\.control set fence_enabled=true where singleton;/);
assert.match(activation, /revoke insert,update,delete on public\.user_prescriptions from public,anon,authenticated;/);
assert.match(activation, /revoke truncate on public\.user_prescriptions from public,anon,authenticated,service_role;/);
assert.equal(activation.split(';').filter(statement => statement.trim()).length, 3,
  'Activation must only enable the fence and close direct write/TRUNCATE grants.');
assert.doesNotMatch(activation, /\b(?:grant|alter|drop|create|insert\s+into|delete\s+from)\b/i,
  'Activation cannot replace guards/RPCs, modify prescription contents or add privileges.');
assert.doesNotMatch(activation, /revoke\s+(?:select|all)\b/i,
  'The protected RPC still needs service-role SELECT and DML.');
assert.match(sql, /security invoker set search_path = ''/);
assert.doesNotMatch(sql, /security definer/);
assert.match(sql, /current_user <> 'service_role'/);
assert.match(sql, /revoke all on function public\.write_user_library_cas\(uuid,uuid,jsonb,jsonb,jsonb,jsonb\)\s+from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.write_user_library_cas\(uuid,uuid,jsonb,jsonb,jsonb,jsonb\) to service_role/);
const wrapperBlock = sql.indexOf('  begin\n    if pg_catalog.jsonb_array_length(p_note_writes)>0');
const noteCall = sql.indexOf('public.write_user_notes_cas(', wrapperBlock);
const rxCall = sql.indexOf('public.write_user_prescriptions_cas(', noteCall);
const ordinaryCall = sql.indexOf('insert into public.user_favorites', rxCall);
const rollbackHandler = sql.indexOf("exception when sqlstate 'DX001'", ordinaryCall);
assert.ok(wrapperBlock > 0 && noteCall > wrapperBlock && rxCall > noteCall && ordinaryCall > rxCall && rollbackHandler > ordinaryCall);
assert.match(sql, /get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text/);
assert.match(sql, /if v_message <> 'Atomic library child conflict' then raise; end if;/);
assert.match(sql, /return v_detail::jsonb/);
assert.match(sql, /pg_advisory_xact_lock\(v_lock\)/);
assert.match(sql, /where owner_id is not null order by 1/);
assert.equal((sql.match(/where coalesce\(target\.client_updated_at,'-infinity'::timestamptz\)<=excluded\.client_updated_at/g) || []).length, 2);
assert.match(sql, /entity_type'='protocol' and v_item->>'entity_key' like 'drug-note:%'/);
assert.equal((sql.match(/::uuid is distinct from p_storage_uid/g) || []).length, 2);
assert.doesNotMatch(sql, /row_version\s*=/, 'Ordinary records cannot inject protected versions.');
assert.match(fixture, /^.*\bbegin;/m);
assert.match(fixture, /rollback;\s*select/);
assert.match(fixture, /pg_catalog\.gen_random_uuid\(\)/);
for (const phrase of [
  'initial atomic write or exact content failed', 'lost response retry changed acknowledgement',
  'owner isolation failed', 'operation reuse accepted',
  'later Rx conflict retained earlier note or receipt',
  'later ordinary failure retained protected writes', 'rollback poisoned retry',
  'child conflicting batch partially wrote', 'exact tombstone restore failed',
  'stale ABA Undo accepted', 'old receipt retry overwrote tombstone',
  'stale ordinary record overwrote newer', 'foreign ordinary owner accepted',
  'row version injection accepted', 'missing envelope tag accepted',
  'RPC leaked write fence', 'direct update bypassed active fence',
  'direct delete bypassed active fence', 'service RPC refused active fence',
  'untrusted role spoofed protected RPC', 'auth-owner receipt cleanup failed',
  'fenced outer create failed', 'fenced outer update or receipt retry failed',
  'fenced outer tombstone failed', 'fenced outer exact restore failed',
  'fenced later Rx conflict retained note or receipt',
  'fenced ordinary failure retained protected write', 'fenced rollback poisoned exact retry',
  'fenced effective service permissions failed', 'deployed fence grants permit bypass',
  'fenced direct insert accepted', 'fenced direct update accepted', 'fenced direct delete accepted',
]) assert.ok(fixture.includes(phrase), `Missing generated PostgreSQL scenario: ${phrase}`);
console.log('Whole-library transaction, rollback, ownership and generated SQL fixture contracts passed.');
