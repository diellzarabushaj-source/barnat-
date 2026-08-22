'use strict';

// Whose account is on the screen, and whose data is in it.
//
// The reported symptom: signing in with one address showed the other doctor's
// account. The cause was not the server — every personal read is filtered by
// user_id and always was. It was the card itself. The profile widget defaulted
// to a real person's name and role, kept them in one browser-wide key that no
// account owned, and never cleared them on sign-out. Whoever opened MedIndex on
// that device was shown that person as if it were their own account.
//
// The same shape of defect sat under the personal library: favourites, notes,
// prescriptions and personal drugs live in fixed local keys, and the client
// merges them into whichever account signs in next — so one doctor's list could
// be written into another doctor's account.
//
// Both are closed by the same rule, asserted here: identity comes from the
// session, and anything held on the device is stamped with the account it
// belongs to.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const brand = read('medindex-brand-runtime.js');
const authClient = read('auth-client.js');
const libraryClient = read('user-library-client.js');
const libraryApi = read('lib/user-library.js');
const userStore = read('lib/user-store.js');

const ADMIN = {
  authenticated:true,
  user:{ email:'diellzarabushaj@gmail.com', name:'Diellza Rabushaj', role:'editor' },
  authUser:{ id:'474a3383-35f7-4b36-93e1-884757a9b93d', role:'admin', status:'active' },
};
const DOCTOR = {
  authenticated:true,
  user:{ email:'alketarabushaj03@gmail.com', name:'Alketa Rabushaj', role:'user' },
  authUser:{ id:'40e63466-e35d-4a52-9c51-438c367473a1', role:'doctor', status:'active' },
};

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key:index => [...map.keys()][index] ?? null,
    getItem:key => (map.has(key) ? map.get(key) : null),
    setItem:(key, value) => { map.set(key, String(value)); },
    removeItem:key => { map.delete(key); },
    snapshot:() => Object.fromEntries(map),
  };
}

function bootProfile(storage) {
  const listeners = new Map();
  const sandbox = {
    console,
    localStorage:storage,
    requestAnimationFrame:callback => { callback(); return 0; },
    cancelAnimationFrame:() => {},
    MutationObserver:class { observe() {} disconnect() {} },
    document:{
      documentElement:{ dataset:{}, classList:{ add:() => {}, remove:() => {}, contains:() => false } },
      readyState:'complete',
      head:{ appendChild:() => {} },
      body:{ insertAdjacentHTML:() => {}, classList:{ add:() => {}, remove:() => {} } },
      getElementById:() => null,
      querySelector:() => null,
      querySelectorAll:() => [],
      createElement:() => ({ dataset:{}, style:{}, setAttribute:() => {}, appendChild:() => {} }),
      addEventListener:(name, handler) => { listeners.set(name, handler); },
    },
    window:{
      addEventListener:(name, handler) => { listeners.set(name, handler); },
      innerWidth:1440,
    },
  };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(brand, sandbox, { filename:'medindex-brand-runtime.js' });
  return sandbox.window.MedIndexProfile;
}

// --- the card never names anyone the session did not name -------------------

{
  assert.doesNotMatch(brand, /name:\s*'Diellza Rabushaj'/,
    'the profile card must not default to a real person');
  assert.doesNotMatch(brand, /role:\s*'Administratore'/,
    'the profile card must not default to a real role');
  assert.match(brand, /SIGNED_OUT_PROFILE/,
    'an unresolved session must render a neutral card');

  const storage = memoryStorage();
  const api = bootProfile(storage);
  assert.ok(api, 'the profile runtime must publish its identity surface');
  assert.equal(api.account(), null, 'no account is known before the session answers');
  assert.equal(api.current().email, '', 'a card with no session shows no address');
  assert.doesNotMatch(api.current().name, /Rabushaj/,
    'a card with no session must not carry anyone\'s name');
}

// --- the card is the signed-in account, and follows a switch ----------------

{
  const storage = memoryStorage();
  const api = bootProfile(storage);

  api.adoptAccount(ADMIN);
  assert.equal(api.current().name, 'Diellza Rabushaj');
  assert.equal(api.current().email, 'diellzarabushaj@gmail.com');
  assert.equal(api.current().role, 'Administrim', 'the account role is shown, not an invented title');

  // The exact reported bug: the second doctor signs in on the same device.
  api.adoptAccount(DOCTOR);
  assert.equal(api.current().name, 'Alketa Rabushaj',
    'the card must follow the account that signed in');
  assert.equal(api.current().email, 'alketarabushaj03@gmail.com');
  assert.equal(api.current().role, 'Mjekësi');
  assert.doesNotMatch(JSON.stringify(api.current()), /Diellza/,
    'nothing of the previous account may survive on the card');

  api.adoptAccount(null);
  assert.equal(api.account(), null, 'signing out leaves no account on the card');
  assert.equal(api.current().email, '');
}

// --- a name the account does not carry is derived, never borrowed -----------

{
  const api = bootProfile(memoryStorage());
  api.adoptAccount({
    authenticated:true,
    user:{ email:'mjek.i.ri@example.com', name:'', role:'' },
    authUser:{ id:'11111111-1111-4111-8111-111111111111', role:'doctor', status:'active' },
  });
  assert.equal(api.current().name, 'mjek.i.ri',
    'a nameless account falls back to its own address, not to another account');
  assert.equal(api.current().email, 'mjek.i.ri@example.com');
}

// --- the photo is filed under the account that set it -----------------------

{
  const storage = memoryStorage();
  const api = bootProfile(storage);
  const photo = 'data:image/png;base64,AAAA';

  api.adoptAccount(ADMIN);
  api._test.savePhoto(photo);
  assert.equal(api.current().photo, photo);
  assert.ok(storage.getItem(`medindex_profile_v2:${ADMIN.authUser.id}`),
    'the photo must be stored under the account that set it');

  api.adoptAccount(DOCTOR);
  assert.equal(api.current().photo, '',
    'a second account must not inherit the first account\'s photo');

  api.adoptAccount(ADMIN);
  assert.equal(api.current().photo, photo, 'returning to an account restores its own photo');
}

// --- the browser-wide key that belonged to nobody is removed ----------------

{
  const storage = memoryStorage({
    medindex_profile_v1:JSON.stringify({ name:'Diellza Rabushaj', role:'Administratore' }),
  });
  bootProfile(storage);
  assert.equal(storage.getItem('medindex_profile_v1'), null,
    'the unowned device-wide profile must be removed, never adopted');
}

// --- signing out leaves no profile behind -----------------------------------

{
  assert.match(authClient, /'medindex_profile_v1'/,
    'sign-out must clear the legacy profile key');
  assert.match(authClient, /key\.startsWith\('medindex_profile_v2:'\)/,
    'sign-out must clear every per-account profile photo on the device');
}

// --- offline keeps the identity it was issued for, and only that ------------

{
  assert.match(authClient, /account:\{\n\s*id:String\(payload\.authUser\?\.id/,
    'the offline lease must record the account it was issued for');
  assert.match(authClient, /user:lease\.account\?\.email \? \{ email:lease\.account\.email/,
    'an offline session must present its own account, never the last one seen');

  // An offline session with no recorded account names nobody.
  const api = bootProfile(memoryStorage());
  api.adoptAccount({ authenticated:true, offline:true, user:null, authUser:null });
  assert.equal(api.account(), null);
  assert.equal(api.current().email, '');
}

// --- the personal library is stamped with the account that owns it ----------

function bootLibrary(seed = {}) {
  const storage = memoryStorage(seed);
  const sandbox = {
    console,
    localStorage:storage,
    navigator:{ onLine:false },
    setTimeout:() => 0,
    clearTimeout:() => {},
    fetch:() => Promise.reject(new Error('no network in this test')),
    document:{ addEventListener:() => {}, visibilityState:'visible' },
    window:{
      addEventListener:() => {},
      dispatchEvent:() => {},
      setTimeout:() => 0,
      clearTimeout:() => {},
      setInterval:() => 0,
      clearInterval:() => {},
    },
    CustomEvent:class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
  };
  sandbox.window.fetch = sandbox.fetch;
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(libraryClient, sandbox, { filename:'user-library-client.js' });
  return { api:sandbox.window.MedIndexUserLibrary, storage };
}

{
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const META_KEY = 'medindex_user_library_meta_v1';

  const seed = {
    [FAVORITES_KEY]:JSON.stringify(['832', '901']),
    [NOTES_KEY]:JSON.stringify({ 832:{ text:'Shënim personal', updatedAt:'2026-08-01T00:00:00.000Z' } }),
    [META_KEY]:JSON.stringify({ owner:ADMIN.authUser.id, favorites:{}, prescriptions:{}, drugs:{} }),
  };

  const { api, storage } = bootLibrary(seed);
  assert.ok(api?.adoptOwner, 'the library client must publish its ownership check');

  assert.equal(api.ownerKey({ id:'abc' }), 'abc');
  assert.equal(api.ownerKey({ email:'A@B.com' }), 'a@b.com', 'an address identifies an account case-insensitively');
  assert.equal(api.ownerKey({}), '');

  // The same account: nothing is touched.
  assert.equal(api.adoptOwner({ id:ADMIN.authUser.id, email:ADMIN.user.email }), false);
  assert.equal(storage.getItem(FAVORITES_KEY), seed[FAVORITES_KEY]);

  // A different account signs in on the same device, without a sign-out in
  // between. The device copy is discarded before it can be merged or pushed.
  assert.equal(api.adoptOwner({ id:DOCTOR.authUser.id, email:DOCTOR.user.email }), true,
    'a different account must not inherit the device copy');
  assert.equal(storage.getItem(FAVORITES_KEY), null, 'favourites of the previous account are gone');
  assert.equal(storage.getItem(NOTES_KEY), null, 'notes of the previous account are gone');
  assert.equal(JSON.parse(storage.getItem(META_KEY)).owner, DOCTOR.authUser.id,
    'the device copy now belongs to the account that signed in');
}

{
  // An unstamped device copy is adopted once, not destroyed: the doctor using
  // this browser today would otherwise lose work that was never anyone else's.
  const { api, storage } = bootLibrary({
    'regjistriBarnave_favoritet_v1':JSON.stringify(['832']),
  });
  assert.equal(api.adoptOwner({ id:ADMIN.authUser.id, email:ADMIN.user.email }), false);
  assert.equal(storage.getItem('regjistriBarnave_favoritet_v1'), JSON.stringify(['832']));
  assert.equal(JSON.parse(storage.getItem('medindex_user_library_meta_v1')).owner, ADMIN.authUser.id);
}

// --- the check runs before anything is merged or pushed ---------------------

{
  const start = libraryClient.indexOf('const snapshot = await api(API_URL);');
  const adopt = libraryClient.indexOf('adoptOwner(snapshot.user)', start);
  const merge = libraryClient.indexOf('mergeRemote(snapshot)', start);
  const flush = libraryClient.indexOf('await flush()', start);
  assert.ok(start >= 0 && adopt > start, 'ownership must be checked on the snapshot');
  assert.ok(adopt < merge && adopt < flush,
    'ownership must be settled before a single item is merged into or pushed to the account');
}

// --- the server side that was already right, and must stay right ------------

{
  assert.match(libraryApi, /user:\{ id:user\.id, email:user\.email/,
    'the snapshot must name the account it belongs to');
  assert.match(libraryApi, /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/,
    'every personal read must be filtered by the account');
  assert.match(libraryApi, /const user = await UserStore\.userFromSession\(req\);/,
    'the account must come from the session, never from the request body');
  assert.match(libraryApi, /if \(!user\) return res\.status\(401\)/,
    'an unauthenticated request must never reach personal data');

  // The approval rule stays exactly as it is: a session authorizes personal
  // data only when Supabase already verified an approved profile.
  assert.match(userStore, /sessionAuthorized/,
    'personal data must remain behind the approved-account check');
  assert.match(userStore, /isAllowedEmail\(session\.email\)/,
    'the static allowlist rollback path must remain');
}

console.log('Account identity passed: the card is the signed-in account and follows a switch, the photo is filed per account, sign-out leaves nothing behind, and a device library is discarded before it can be merged into another doctor\'s account.');
