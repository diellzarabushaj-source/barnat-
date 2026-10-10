'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const library = require('../lib/user-library.js');

const server = read('lib/user-library.js');
const resolver = read('lib/personal-registry-supabase.js');
const gateway = read('lib/medindex-data-api.js');
const migration = read('supabase/migrations/20260827111357_native_user_notes_and_profile_avatars.sql');
const polymorphicMigration = read('supabase/migrations/20260903075506_fix_user_notes_polymorphic_uniqueness.sql');
const atomicLibrary = read('supabase/migrations/20261010125327_user_library_atomic_cas.sql');

assert.equal(library._test.noteRegistryNumber('drug-note:registry:2508'), 2508);
assert.equal(library._test.noteRegistryNumber('drug-note:fallback:x'), null);
assert.equal(library._test.isDrugNoteKey('protocol', 'drug-note:registry:3'), true);
assert.equal(library._test.isDrugNoteKey('drug', 'drug-note:registry:3'), false);

assert.match(gateway, /'user_notes'/);
assert.match(gateway, /PRIVATE_SERVER_RELATIONS/);
assert.match(server, /fetchRows\('user_notes'/);
// Native notes still use their protected CAS child, now inside one library
// transaction so a later prescription conflict rolls back notes and receipts.
assert.match(server, /rpc\/write_user_library_cas/);
assert.match(server, /p_auth_uid:authUid/);
assert.match(server, /p_storage_uid:storageUid/);
assert.match(server, /p_note_writes:noteWrites/);
assert.match(server, /LIBRARY_OWNER_CHANGED/);
assert.match(atomicLibrary, /security invoker set search_path = ''/);
assert.match(atomicLibrary, /current_user <> 'service_role' or p_storage_uid is null/);
assert.match(atomicLibrary, /public\.write_user_notes_cas\(p_auth_uid,p_storage_uid,p_note_writes\)/);
assert.match(atomicLibrary, /public\.write_user_prescriptions_cas\(p_auth_uid,p_storage_uid,p_prescription_writes\)/);
assert.match(atomicLibrary, /exception when sqlstate 'DX001'/);
assert.match(atomicLibrary, /if v_message <> 'Atomic library child conflict' then raise; end if;/);
assert.match(atomicLibrary, /revoke all on function public\.write_user_library_cas\(uuid,uuid,jsonb,jsonb,jsonb,jsonb\)\s+from public,anon,authenticated/);
assert.match(atomicLibrary, /grant execute on function public\.write_user_library_cas\(uuid,uuid,jsonb,jsonb,jsonb,jsonb\) to service_role/);
assert.doesNotMatch(server, /upsert\('user_notes'/);
assert.match(server, /authUidFromRequest/);
assert.match(resolver, /nativeNoteKeysForUser/);
assert.match(resolver, /user_notes\?\$\{params\.toString\(\)\}/);
assert.match(migration, /legacy_user_id = uf\.user_id/);
assert.match(migration, /add column if not exists deleted_at timestamptz/i);
assert.match(migration, /char_length\(content\) <= 2000/i);

assert.match(polymorphicMigration, /drop constraint if exists user_notes_user_id_drug_id_key/i);
assert.match(server,/const target=legacyNoteTarget\(item,drugId\)/);
assert.match(server,/if \(isDrugNoteKey\(item.entityType,item.entityKey\)\) addLegacyWrite\(item,true\)/);

console.log('Native user_notes persistence contract passed (Supabase runtime).');
