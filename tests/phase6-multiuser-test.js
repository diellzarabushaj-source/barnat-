'use strict';

// Phase 6 — multi-user backend contract.
//
// Locks the rules that make more than one account safe:
//   - a new account is pending and cannot reach MedIndex until an admin approves it;
//   - shared clinical writes are admin-only, re-verified on every request;
//   - personal drugs stay private to their owner and never reach `public.drugs`;
//   - an admin can never remove the last active admin or lock themselves out.

const assert = require('node:assert/strict');
const Module = require('node:module');

const PersonalDrugs = require('../lib/user-drugs.js');
const AdminAccess = require('../lib/admin-access.js');
const AdminDrugs = require('../lib/admin-drugs.js');
const AdminUsersModule = require('../lib/admin-users.js');
const SupabaseAuth = require('../lib/supabase-auth.js');

const OWNER_EMAIL = 'diellzarabushaj@gmail.com';

function session(overrides = {}) {
  return {
    v:3,
    uid:'11111111-1111-4111-8111-111111111111',
    authUid:'22222222-2222-4222-8222-222222222222',
    email:'doktor@example.com',
    name:'Doktor Test',
    provider:'supabase-google',
    authRole:'doctor',
    authStatus:'active',
    ...overrides,
  };
}

async function expectCode(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code, `expected code ${code}, received ${error?.code}`);
    if (status !== undefined) assert.equal(error?.status, status);
    return true;
  });
}

(async () => {

// --- personal drugs: schema is closed ------------------------------------

{
  const entry = PersonalDrugs.normalizedDrug({
    clientId:'local-1',
    name:'  Bari im  ',
    fields:{ notes:'shënim personal', atcCode:'N02BE01', injected:'must not survive', nested:{ a:1 } },
    clientUpdatedAt:'2026-08-20T10:00:00Z',
  });

  assert.equal(entry.name, 'Bari im', 'name is trimmed');
  assert.deepEqual(Object.keys(entry.fields).sort(), ['atcCode', 'notes'], 'unknown fields are dropped');
  assert.equal(entry.clientUpdatedAt, '2026-08-20T10:00:00.000Z');
}

{
  // A missing timestamp must resolve to "now", otherwise last-write-wins would
  // treat a brand-new entry as older than the stored row and silently drop it.
  const entry = PersonalDrugs.normalizedDrug({ clientId:'local-2', name:'Pa datë' });
  assert.ok(Math.abs(Date.now() - new Date(entry.clientUpdatedAt).getTime()) < 60000,
    'missing clientUpdatedAt falls back to now, never to the epoch');
}

assert.throws(() => PersonalDrugs.normalizedDrug({ name:'Pa id' }), /identifikues lokal/);
assert.throws(() => PersonalDrugs.normalizedDrug({ clientId:'x' }), /emrin/);
assert.throws(() => PersonalDrugs.assertWithinLimit(PersonalDrugs.MAX_PERSONAL_DRUGS + 1), /maksimum/);

{
  const record = PersonalDrugs.drugRecord('user-a', {
    clientId:'local-3', name:'Bari', fields:{ notes:'x' }, clientUpdatedAt:'2026-08-20T10:00:00.000Z',
  }, '2026-08-20T10:00:01.000Z');
  assert.equal(record.user_id, 'user-a', 'a personal drug is always written with an owner');
  assert.equal(record.deleted_at, null);

  const tombstone = PersonalDrugs.drugTombstoneRecord('user-a', {
    clientId:'local-3', deletedAt:'2026-08-20T11:00:00.000Z',
  }, '2026-08-20T11:00:01.000Z');
  assert.deepEqual(tombstone.payload, {}, 'a deleted personal drug keeps no content');
  assert.equal(tombstone.deleted_at, '2026-08-20T11:00:00.000Z');
}

{
  const mapped = PersonalDrugs.mapDrug({
    client_id:'local-4', name:'Bari', payload:{ notes:'x' }, updated_at:'2026-08-20T10:00:00Z',
  });
  assert.equal(mapped.source, 'personal', 'personal entries are marked as unverified personal data');
  assert.equal(PersonalDrugs.mapDrug({ client_id:'local-5', deleted_at:'2026-08-20T10:00:00Z' }), null,
    'tombstoned personal drugs never surface as entries');
}

// --- admin access: live re-verification ----------------------------------

{
  const adminProfile = { id:session().authUid, role:'admin', status:'active', legacy_user_id:'' };
  const deps = {
    readSession:async () => session({ authRole:'admin', email:OWNER_EMAIL }),
    readProfile:async () => adminProfile,
  };
  const identity = await AdminAccess.requireAdminSession({}, deps);
  assert.equal(identity.role, 'admin');
  assert.equal(identity.authUid, session().authUid);
  assert.equal(identity.email, OWNER_EMAIL);
}

// Administration belongs to named addresses. `role = 'admin'` alone is not
// enough: a row edited straight in the database, or a promotion that slipped
// past review, still cannot open an admin surface.
await expectCode(
  AdminAccess.requireAdminSession({}, {
    readSession:async () => session({ authRole:'admin', email:'dikush.tjeter@example.com' }),
    readProfile:async () => ({ id:session().authUid, role:'admin', status:'active', legacy_user_id:'' }),
  }),
  'ADMIN_EMAIL_NOT_ALLOWED', 403,
);

assert.equal(AdminAccess.isAdminEmail(OWNER_EMAIL), true);
assert.equal(AdminAccess.isAdminEmail(' DiellzaRabushaj@Gmail.com '), true, 'the address is compared case- and space-insensitively');
assert.equal(AdminAccess.isAdminEmail('dikush.tjeter@example.com'), false);
assert.equal(AdminAccess.isAdminEmail(''), false);

// Promoting an address that could never use the role is refused before it is
// written: an account marked admin that no admin surface accepts is worse than
// no promotion at all.
await expectCode(
  AdminUsersModule._test.assertAdminEmailAllowed('u-2', 'admin', [{ id:'u-2', email:'dikush.tjeter@example.com' }]),
  'ADMIN_EMAIL_NOT_ALLOWED', 403,
);
await AdminUsersModule._test.assertAdminEmailAllowed('u-1', 'admin', [{ id:'u-1', email:OWNER_EMAIL }]);
await AdminUsersModule._test.assertAdminEmailAllowed('u-2', 'doctor', [{ id:'u-2', email:'dikush.tjeter@example.com' }]);

await expectCode(
  AdminAccess.requireAdminSession({}, { readSession:async () => null }),
  'SESSION_REQUIRED', 401,
);

await expectCode(
  // The emergency password session must never carry shared write authority.
  AdminAccess.requireAdminSession({}, {
    readSession:async () => session({ provider:'legacy-password', authUid:'' }),
    readProfile:async () => ({ id:'x', role:'admin', status:'active' }),
  }),
  'SUPABASE_SESSION_REQUIRED', 403,
);

await expectCode(
  // A doctor session is valid for MedIndex, but not for the shared registry.
  AdminAccess.requireAdminSession({}, {
    readSession:async () => session(),
    readProfile:async () => ({ id:session().authUid, role:'doctor', status:'active' }),
  }),
  'ADMIN_REQUIRED', 403,
);

await expectCode(
  // A session minted before a suspension must lose shared write access at once,
  // not when the cookie eventually expires.
  AdminAccess.requireAdminSession({}, {
    readSession:async () => session({ authRole:'admin' }),
    readProfile:async () => ({ id:session().authUid, role:'admin', status:'suspended' }),
  }),
  'ACCOUNT_INACTIVE', 403,
);

await expectCode(
  AdminAccess.requireAdminSession({}, {
    readSession:async () => session({ authRole:'admin' }),
    readProfile:async () => null,
  }),
  'PROFILE_MISSING', 403,
);

// --- pending accounts ----------------------------------------------------

{
  const pending = { status:'pending', role:'doctor', id:'x' };
  assert.throws(() => SupabaseAuth._test.assertActive(pending), error => {
    assert.equal(error.code, 'ACCOUNT_PENDING_APPROVAL');
    assert.equal(error.status, 403);
    return true;
  }, 'a pending account is rejected with its own code, not a generic failure');

  assert.throws(() => SupabaseAuth._test.assertActive({ status:'suspended' }), /not active/);
  assert.deepEqual(SupabaseAuth._test.assertActive({ status:'active', role:'doctor' }).status, 'active');
}

// --- admin-added shared drugs -------------------------------------------

{
  const record = AdminDrugs._test.normalizeInput({
    tradeName:'  Bar i ri  ',
    activeSubstance:'Paracetamol',
    atcCode:'N02BE01',
    unknownColumn:'must not survive',
  });
  assert.equal(record.trade_name, 'Bar i ri');
  assert.equal(record.active_substance, 'Paracetamol');
  assert.ok(!('unknownColumn' in record), 'only known registry columns are written');
  assert.throws(() => AdminDrugs._test.normalizeInput({}), /emrin tregtar/);
  assert.ok(AdminDrugs.ADMIN_REGISTRY_BAND_START >= 900000,
    'admin-added registry numbers stay far above the official import range');
}

// --- shared clinical writes are admin-only -------------------------------

{
  const ClinicalEditor = require('../lib/clinical-editor.js');
  const PopulationVerification = require('../lib/population-verification.js');

  // Both shared-write tools must route through the live admin check rather than
  // accepting any valid session, which is what made them single-user-only.
  assert.equal(typeof ClinicalEditor._test.requireEditorAdmin, 'function');
  assert.equal(typeof PopulationVerification._test.requireDecisionAdmin, 'function');

  // Shared clinical changes are attributed to the admin who made them.
  assert.equal(ClinicalEditor._test.auditActor({ name:'Dr. A', email:'a@example.com' }), 'Dr. A <a@example.com>');
  assert.equal(ClinicalEditor._test.auditActor({ email:'a@example.com' }), 'a@example.com');
  assert.equal(ClinicalEditor._test.auditActor(null), 'admin');
  assert.equal(PopulationVerification._test.decisionActor({ name:'Dr. B', email:'b@example.com' }), 'Dr. B <b@example.com>');

  for (const source of [
    require('node:fs').readFileSync(require.resolve('../lib/clinical-editor.js'), 'utf8'),
    require('node:fs').readFileSync(require.resolve('../lib/population-verification.js'), 'utf8'),
  ]) {
    assert.ok(!source.includes('Dr. Diellza Rabushaj'),
      'shared clinical writes must not be attributed to a hardcoded name once more than one admin exists');
  }
}

// --- admin user management guards ---------------------------------------

{
  // `admin-users` reaches the database through neon-data-api; stub that module so
  // the guard logic runs against controlled data.
  const dataApiPath = require.resolve('../lib/neon-data-api.js');
  const original = require.cache[dataApiPath];
  const requests = [];
  let activeAdmins = [{ id:'admin-1' }];

  require.cache[dataApiPath] = {
    id:dataApiPath,
    filename:dataApiPath,
    loaded:true,
    exports:{
      neonRequest:async (path, options = {}) => {
        requests.push({ path, method:options.method || 'GET', body:options.body });
        if (path.startsWith('profiles?select=id&role=eq.admin')) return { data:activeAdmins };
        if (path.startsWith('profiles?select=id,full_name,role,status,legacy_user_id,verification_status&id=eq.')) {
          return { data:[{ id:'doctor-1', full_name:'Doctor', role:'doctor', status:'pending', verification_status:'submitted' }] };
        }
        if (path === 'rpc/review_medindex_registration') {
          return { data:{ id:'doctor-1', role:'doctor', status:'active', verificationStatus:'verified' } };
        }
        return { data:[] };
      },
    },
  };

  delete require.cache[require.resolve('../lib/admin-users.js')];
  delete require.cache[require.resolve('../lib/admin-access.js')];
  const AdminUsers = require('../lib/admin-users.js');

  const actor = { authUid:'admin-1', email:'admin@example.com', name:'Admin' };

  await expectCode(
    AdminUsers._test.assertSafeChange(actor, { id:'admin-1', role:'admin' }, 'doctor', 'active'),
    'SELF_DEMOTION_BLOCKED', 409,
  );

  await expectCode(
    AdminUsers._test.assertSafeChange(actor, { id:'admin-2', role:'admin' }, 'doctor', 'active'),
    'LAST_ADMIN_BLOCKED', 409,
  );

  activeAdmins = [{ id:'admin-1' }, { id:'admin-2' }];
  await AdminUsers._test.assertSafeChange(actor, { id:'admin-2', role:'admin' }, 'doctor', 'active');

  // Demoting a plain doctor is never blocked.
  await AdminUsers._test.assertSafeChange(actor, { id:'doctor-1', role:'doctor' }, 'doctor', 'suspended');

  await expectCode(AdminUsers.updateUser(actor, {}), 'USER_ID_MISSING', 400);

  const approved = await AdminUsers.updateUser(actor, { userId:'doctor-1', status:'active' });
  assert.equal(approved.user.status, 'active');
  const reviewCall = requests.find(request => request.path === 'rpc/review_medindex_registration');
  assert.equal(reviewCall.method, 'POST', 'approval must call the transactional review RPC');
  assert.equal(reviewCall.body.p_actor_id, actor.authUid);
  assert.equal(reviewCall.body.p_target_id, 'doctor-1');

  assert.equal(AdminUsers._test.storageUidOf({ id:'auth-1', legacy_user_id:'' }), 'auth-1',
    'a new account stores its library under its own Auth UUID');
  assert.equal(AdminUsers._test.storageUidOf({ id:'auth-1', legacy_user_id:'legacy-9' }), 'legacy-9',
    'the bridged owner keeps the legacy storage UUID');

  if (original) require.cache[dataApiPath] = original; else delete require.cache[dataApiPath];
  delete require.cache[require.resolve('../lib/admin-users.js')];
  delete require.cache[require.resolve('../lib/admin-access.js')];
}

// --- private relations stay server-only ----------------------------------

{
  const DataApi = require('../lib/neon-data-api.js');
  for (const relation of ['profiles', 'verification_documents', 'user_drugs', 'user_favorites', 'user_prescriptions']) {
    assert.ok(DataApi._test.isPrivateServerRelation(relation),
      `${relation} must be read through the server-only key, never the publishable key`);
    assert.ok(DataApi._test.shouldUseSupabaseServer(`${relation}?select=id`),
      `${relation} reads must use the privileged path`);
  }
  assert.ok(!DataApi._test.shouldUseSupabaseServer('drugs?select=id&limit=1'),
    'public medical reads keep using the publishable key');
}

console.log('Phase 6 multi-user backend contract passed.');

})().catch(error => {
  console.error(error);
  process.exit(1);
});
