'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');

const ROOT=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8').replace(/\r\n?/g,'\n');

const backend=read('lib/user-library.js');
const gateway=read('lib/medindex-data-api.js');
const client=read('phase9-personal-entities-client.js');
const phase9Migration=read('supabase/migrations/20260830220141_drx_phase9a_personal_entity_storage.sql');
const nativeMigration=read('supabase/migrations/20260827111357_native_user_notes_and_profile_avatars.sql');
const statusMigration=read('supabase/migrations/20260830221548_drx_phase9e_frontend_foundation_status.sql');

cp.execFileSync(process.execPath,['--check',path.join(ROOT,'phase9-personal-entities-client.js')],{stdio:'pipe'});
cp.execFileSync(process.execPath,['--check',path.join(ROOT,'lib/user-library.js')],{stdio:'pipe'});

// Server ownership is derived from the authenticated session; the browser never
// supplies a trusted user id for Favorites/Notes.
assert.match(backend,/UserStore\.userFromSession\(req\)/);
assert.match(backend,/authUidFromRequest/);
assert.match(backend,/user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
assert.match(backend,/fetchRows\('user_favorites'/);
assert.match(backend,/fetchRows\('user_notes'/);
assert.match(backend,/const storageUid = UserIdentity\.storageUidFromUser\(user\)/);
assert.match(backend,/user_id:storageUid/);
assert.match(backend,/user_id:authUid/);

// Favorites/notes are private server relations and therefore use the server
// credential path rather than a public browser table read.
assert.match(gateway,/PRIVATE_SERVER_RELATIONS/);
assert.match(gateway,/'user_favorites'/);
assert.match(gateway,/'user_notes'/);

// The Phase 9 browser helper has no account-shared local cache. Every mutation
// goes through the same-origin authenticated endpoint.
assert.match(client,/credentials:'same-origin'/);
assert.match(client,/const API='\/api\/user-library'/);
assert.doesNotMatch(client,/localStorage|sessionStorage/);
assert.match(client,/DRxPhase9Personal/);

// Direct authenticated-table policies are owner-only and active-user gated.
for(const action of ['select','insert','update','delete']){
  assert.match(phase9Migration,new RegExp('user_favorites_'+action+'_own_clinical'));
}
assert.match(phase9Migration,/user_id=\(select auth\.uid\(\)\)/);
assert.match(phase9Migration,/private\.is_active_user\(\)/);
assert.match(phase9Migration,/entity_type in \('drug','substance','variant','product'\)/);

// Native notes keep their original persistence constraints while Phase 9 adds
// polymorphic identity. Live owner-policy count is asserted by the Phase 9
// status gate instead of pretending RLS was introduced by this native-note file.
assert.match(nativeMigration,/char_length\(content\) <= 2000/i);
assert.match(phase9Migration,/user_notes_user_entity_unique_idx/);
assert.match(statusMigration,/note_owner_policy_count/);
assert.match(statusMigration,/noteOwnerPolicyCount/);
assert.match(statusMigration,/m\.note_owner_policy_count>=4/);
assert.match(phase9Migration,/entity_type='drug' and drug_id is not null and entity_key=drug_id::text/i);
assert.match(phase9Migration,/entity_type in \('substance','variant','product'\) and drug_id is null/i);

console.log('✓ Phase 9 account isolation contract passed: session-derived ownership, owner-only RLS, private server relations, and no shared browser storage.');
