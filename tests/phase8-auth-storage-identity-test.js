'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Identity = require('../lib/user-identity.js');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const AUTH_UID = '11111111-1111-4111-8111-111111111111';
const LEGACY_UID = '22222222-2222-4222-8222-222222222222';

const nativeProfile = Identity.profileIdentity({ id:AUTH_UID });
assert.equal(nativeProfile.authUid, AUTH_UID);
assert.equal(nativeProfile.storageUid, AUTH_UID);
assert.equal(nativeProfile.legacyStorageUid, '');
assert.equal(nativeProfile.bridged, false);

const bridgedProfile = Identity.profileIdentity({
  id:AUTH_UID,
  legacy_user_id:LEGACY_UID,
});
assert.equal(bridgedProfile.authUid, AUTH_UID);
assert.equal(bridgedProfile.storageUid, LEGACY_UID);
assert.equal(bridgedProfile.legacyStorageUid, LEGACY_UID);
assert.equal(bridgedProfile.bridged, true);

const session = Identity.sessionIdentity({
  provider:'supabase-google',
  authUid:AUTH_UID,
  uid:LEGACY_UID,
});
assert.equal(session.isSupabase, true);
assert.equal(session.authUid, AUTH_UID);
assert.equal(session.storageUid, LEGACY_UID);
assert.equal(session.bridged, true);

assert.equal(
  Identity.authUidFromSession({ provider:'supabase-google', uid:LEGACY_UID }),
  '',
  'Auth UUID must never fall back to the storage UUID.'
);
assert.throws(
  () => Identity.requireSupabaseSessionIdentity({
    provider:'supabase-password',
    uid:LEGACY_UID,
    authUid:'',
  }),
  /SUPABASE_AUTH_UUID_REQUIRED/
);

const attached = Identity.attachSessionIdentity(
  { id:LEGACY_UID, email:'doctor@example.test' },
  { provider:'supabase-google', authUid:AUTH_UID, uid:LEGACY_UID }
);
assert.equal(attached.authUid, AUTH_UID);
assert.equal(attached.storageUid, LEGACY_UID);
assert.equal(attached.id, LEGACY_UID);
assert.equal(attached.identityBridged, true);

const authApi = read('api/auth.js');
assert.match(authApi, /UserIdentity\.canonicalIdentity\(canonicalIdentity\)/);
assert.match(authApi, /id:identity\.storageUid/);

const authTransport = read('lib/supabase-auth.js');
assert.match(authTransport, /profiles\?id=eq\.\$\{encodeURIComponent\(userId\)\}/);
assert.match(authTransport, /id:authUser\.id/);

const userStore = read('lib/user-store.js');
assert.match(userStore, /UserIdentity\.attachSessionIdentity/);

const library = read('lib/user-library.js');
assert.match(library, /UserIdentity\.storageUidFromUser\(user\)/);
assert.match(library, /user_id:authUid/);
assert.match(library, /prescriptionContext\(storageUid,/);

const personalRegistry = read('lib/personal-registry-supabase.js');
assert.match(personalRegistry, /membershipKeysForUser\(storageUid,/);
assert.match(personalRegistry, /clean\(user\?\.authUid\)/);

const verification = read('lib/professional-verification.js');
assert.match(verification, /p_user_id:identity\.authUid/);
assert.match(verification, /user_id=eq\.\$\{encodeURIComponent\(identity\.authUid\)\}/);

const adminUsers = read('lib/admin-users.js');
assert.match(adminUsers, /UserIdentity\.profileIdentity\(profile\)\.storageUid/);

const mappingMigration = read('supabase/migrations/20260819160916_phase4_add_legacy_user_mapping.sql');
assert.match(mappingMigration, /profiles_legacy_user_id_unique_idx/);
assert.match(mappingMigration, /revoke update \(legacy_user_id\) on public\.profiles from authenticated/i);

const safeClaimMigration = read('supabase/migrations/20260819173053_phase4_safe_owner_claim_mapping_only.sql');
assert.match(safeClaimMigration, /data_moved', false/);
assert.match(safeClaimMigration, /encryption-aware rekey/i);

console.log('Phase 8 auth/storage identity separation contract passed.');
