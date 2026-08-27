const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  process.env.SESSION_SECRET = 'phase5-session-cutover-test-secret-at-least-32-characters';

  const authUrl = pathToFileURL(path.resolve(__dirname, '../lib/auth.mjs')).href;
  const edgeUrl = pathToFileURL(path.resolve(__dirname, '../lib/auth-edge.mjs')).href;
  const auth = await import(`${authUrl}?phase5=${Date.now()}`);
  const edgeAuth = await import(`${edgeUrl}?phase5=${Date.now()}`);

  const legacyUserId = '2c363cb4-fcbe-4d31-9a58-a3512d23d32f';
  const authUserId = '081163dc-04fa-4693-97cf-bfd887c841cd';
  const token = auth.createSessionToken({
    uid:legacyUserId,
    authUid:authUserId,
    sub:'google-owner-sub',
    email:'diellzarabushaj@gmail.com',
    role:'editor',
    name:'Diellza Rabushaj',
    authRole:'admin',
    authStatus:'active',
    provider:'supabase-google',
  });
  const session = auth.sessionData(token);

  assert.equal(auth.SESSION_VERSION, 3, 'Phase 5 must mint v3 sessions');
  assert.equal(edgeAuth.SESSION_VERSION, 3, 'Edge verifier must use the same v3 contract');
  assert.equal(session.v, 3, 'Supabase session did not use v3');
  assert.equal(session.uid, legacyUserId, 'Storage/AAD UUID changed during session cutover');
  assert.equal(session.authUid, authUserId, 'Canonical Supabase Auth UUID is missing');
  assert.notEqual(session.uid, session.authUid, 'Canonical and legacy IDs must remain distinct during Phase 5');
  assert.equal(session.authRole, 'admin');
  assert.equal(session.authStatus, 'active');
  assert.equal(session.provider, 'supabase-google');
  assert.equal(auth.isSupabaseSession(session), true, 'Canonical Supabase session was not recognized');
  assert.equal(auth.isRollbackSession(session), false);
  assert.equal(await edgeAuth.verifySessionToken(token), true, 'Edge could not verify the Node v3 Supabase session');

  const rollbackToken = auth.createSessionToken({
    uid:legacyUserId,
    email:'diellzarabushaj@gmail.com',
    role:'editor',
    name:'Diellza Rabushaj',
    provider:'legacy-password',
  });
  const rollbackSession = auth.sessionData(rollbackToken);
  assert.equal(rollbackSession.v, 3, 'Rollback session must also use the new signed envelope');
  assert.equal(rollbackSession.uid, legacyUserId, 'Rollback must preserve storage owner UUID');
  assert.equal(rollbackSession.authUid, '', 'Rollback session must not pretend to be Supabase-authenticated');
  assert.equal(auth.isRollbackSession(rollbackSession), true);
  assert.equal(auth.isSupabaseSession(rollbackSession), false);
  assert.equal(await edgeAuth.verifySessionToken(rollbackToken), true, 'Edge could not verify the explicit v3 rollback session');
  assert.equal(await edgeAuth.verifySessionToken(`${token}tampered`), false, 'Edge accepted a tampered v3 session');

  const apiAuth = fs.readFileSync(path.resolve(__dirname, '../api/auth.js'), 'utf8');
  const loginClient = fs.readFileSync(path.resolve(__dirname, '../login.js'), 'utf8');
  const authClient = fs.readFileSync(path.resolve(__dirname, '../auth-client.js'), 'utf8');
  const supabaseAuth = fs.readFileSync(path.resolve(__dirname, '../lib/supabase-auth.js'), 'utf8');
  const library = fs.readFileSync(path.resolve(__dirname, '../lib/user-library.js'), 'utf8');

  assert.match(apiAuth, /exchangeGoogleIdToken/, 'Normal Google login must exchange through Supabase Auth');
  assert.match(apiAuth, /SupabaseAuth\.identityFromRequest/, 'Normal Google login must verify the canonical Supabase profile');
  assert.match(apiAuth, /SupabaseAuth\.assertActive\(canonicalIdentity\)/,
    'Only an active doctor/admin profile may receive an application session after the pending enrollment branch');
  assert.match(apiAuth, /nonce:sha256Hex\(suppliedCsrf\)/, 'Server-side Google nonce verification must use SHA-256');
  assert.match(apiAuth, /LEGACY_OWNER_MAPPING_MISSING/, 'Owner login must fail closed without the trusted legacy mapping');
  assert.match(apiAuth, /LEGACY_OWNER_MAPPING_MISMATCH/, 'Owner login must fail closed on a mapping mismatch');
  assert.match(apiAuth, /legacyUserId \|\| canonicalIdentity\.id/, 'Storage identity bridge is missing');
  assert.match(apiAuth, /provider = 'supabase-google'/, 'Google sessions must be marked as Supabase-authenticated');

  assert.match(loginClient, /crypto\.subtle\.digest\('SHA-256'/, 'Browser must hash the raw nonce before Google Sign-In');
  assert.match(loginClient, /nonce,\s*auto_select:false/, 'Hashed nonce must be supplied to Google');
  assert.match(loginClient, /medindex_offline_lease_v3/, 'Login must write only the v3 offline lease');
  assert.match(loginClient, /sessionVersion\) === 3/, 'Login completion must require the new session contract');

  assert.match(authClient, /medindex_offline_lease_v3/, 'Protected pages must use the v3 offline lease');
  assert.match(authClient, /phase5-session-upgrade/, 'Legacy online sessions must be routed through re-authentication');
  assert.match(authClient, /payload\.supabaseAuthenticated === true \|\| payload\.rollbackSession === true/, 'Protected runtime must reject unknown v3 identity contracts');

  assert.match(supabaseAuth, /legacy_user_id/, 'Trusted profile lookup must expose legacy_user_id server-side');
  assert.match(supabaseAuth, /legacyUserId:String\(profile\.legacy_user_id/, 'Legacy mapping must be normalized explicitly');

  assert.match(library, /prescriptionContext\(user\.id, item\.clientId\)/, 'Prescription encryption must still use storage/AAD uid in Phase 5');
  assert.doesNotMatch(library, /prescriptionContext\(authUid[,)]/, 'Phase 5 must not silently re-key prescription AAD to the Auth UUID');
  assert.match(library, /user_id:authUid/, 'Auth UUID may be used only for auth-bound native user_notes persistence');

  console.log('Phase 5 Supabase session cutover invariants passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
