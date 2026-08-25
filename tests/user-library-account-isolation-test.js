'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

const guard = read('user-library-account-guard.js');
const css = read('user-library-account-guard.css');
const html = read('index.html');
const migration = read('migrations/20260825-user-library-user-drugs-and-isolation.sql');
const backend = read('lib/user-library.js');

for (const file of ['user-library-account-guard.js', 'scripts/patch-user-library-account-isolation.js']) {
  require('node:child_process').execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

// Build wiring: identity must be resolved before the existing sync controller and
// before Favorites/Notes are allowed to paint personal state.
const guardPos = html.indexOf('user-library-account-guard.js');
const clientPos = html.indexOf('user-library-client.js');
const personalPos = html.indexOf('registry-user-personalization.js');
assert(guardPos >= 0, 'account guard must be published');
assert(clientPos > guardPos, 'account guard must run before user-library-client');
assert(personalPos > clientPos, 'personalization must run after the user-library client');
assert.match(html, /user-library-account-guard\.css/);
assert.match(css, /medindex-library-owner-pending/);

// Backend ownership is server-derived and every read/write is scoped by user.id.
assert.match(backend, /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
assert.match(backend, /fetchRows\('user_favorites'/);
assert.match(backend, /user_id:user\.id/);
assert.match(backend, /UserStore\.userFromSession\(req\)/);

// The table required by the unified personal snapshot is durable and protected
// with the same forced RLS boundary as Favorites/Prescriptions.
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_drugs/);
assert.match(migration, /REFERENCES public\.medindex_users\(id\) ON DELETE CASCADE/);
assert.match(migration, /UNIQUE \(user_id, client_id\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /medindex_vercel_access_anonymous/);

function storage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem:key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem:(key, value) => values.set(String(key), String(value)),
    removeItem:key => values.delete(String(key)),
    dump:() => Object.fromEntries(values),
  };
}

function classList() {
  const set = new Set();
  return {
    toggle(name, force) { if (force) set.add(name); else set.delete(name); return Boolean(force); },
    contains:name => set.has(name),
  };
}

function makeContext({ seed = {}, remoteUser = { id:'new-user', email:'new@example.test' } } = {}) {
  const localStorage = storage(seed);
  const upstreamCalls = [];
  const listeners = new Map();
  const events = [];
  const documentElement = { classList:classList() };
  const document = { documentElement };
  const location = { href:'https://medindex.test/index.html', origin:'https://medindex.test' };
  const navigator = { onLine:true };

  const upstreamFetch = async (input, options = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const url = new URL(raw, location.href);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    upstreamCalls.push({ path:url.pathname, method, body:options.body || null });
    const snapshot = {
      ok:true,
      version:1,
      user:remoteUser,
      prescriptions:[],
      favorites:[],
      drugs:[],
      tombstones:{ prescriptions:[], favorites:[], drugs:[] },
      generatedAt:new Date().toISOString(),
    };
    return new Response(JSON.stringify(snapshot), { status:200, headers:{ 'Content-Type':'application/json' } });
  };

  const window = {
    fetch:upstreamFetch,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    dispatchEvent(event) { events.push(event); return true; },
  };

  const context = {
    window,
    document,
    location,
    navigator,
    localStorage,
    URL,
    Response,
    Headers,
    CustomEvent:class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(guard, context, { filename:'user-library-account-guard.js' });
  return { context, localStorage, upstreamCalls, events };
}

async function behavior() {
  // Legacy fixed-key data without any owner stamp is never claimable by whoever
  // signs in next. It is removed before personalization can read it.
  const unowned = makeContext({ seed:{
    regjistriBarnave_favoritet_v1:JSON.stringify(['OLD|FAVORITE']),
    regjistriBarnave_shenime_v1:JSON.stringify({ 'registry:1':{ text:'old note' } }),
  } });
  assert.equal(unowned.localStorage.getItem('regjistriBarnave_favoritet_v1'), null);
  assert.equal(unowned.localStorage.getItem('regjistriBarnave_shenime_v1'), null);

  // If a browser still carries account A's local state while account B owns the
  // current server session, the first attempted write is converted into an
  // identity probe. The stale body is NEVER forwarded to B.
  const switched = makeContext({ seed:{
    medindex_user_library_meta_v1:JSON.stringify({ owner:'old-user' }),
    regjistriBarnave_favoritet_v1:JSON.stringify(['OLD|FAVORITE']),
    regjistriBarnave_shenime_v1:JSON.stringify({ 'registry:2':{ text:'private old note' } }),
  } });
  const guardedResponse = await switched.context.window.fetch('/api/user-library', {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ version:1, favorites:[{ entityType:'drug', entityKey:'OLD|FAVORITE' }] }),
  });
  assert.equal(guardedResponse.status, 200);
  assert.deepEqual(switched.upstreamCalls.map(call => call.method), ['GET'], 'stale PUT must not reach the server');
  assert.equal(switched.localStorage.getItem('regjistriBarnave_favoritet_v1'), null);
  assert.equal(switched.localStorage.getItem('regjistriBarnave_shenime_v1'), null);
  assert.equal(JSON.parse(switched.localStorage.getItem('medindex_user_library_meta_v1')).owner, 'new-user');

  // Once the verified server user matches the owner stamp, normal writes pass.
  const sameOwner = makeContext({ seed:{
    medindex_user_library_meta_v1:JSON.stringify({ owner:'new-user' }),
    regjistriBarnave_favoritet_v1:JSON.stringify(['SAFE|FAVORITE']),
  } });
  await sameOwner.context.window.fetch('/api/user-library', {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ version:1, favorites:[{ entityType:'drug', entityKey:'SAFE|FAVORITE' }] }),
  });
  assert.deepEqual(sameOwner.upstreamCalls.map(call => call.method), ['GET', 'PUT']);
}

behavior().then(() => {
  console.log('✓ Per-user Favorites/Notes account isolation passed: unowned data is rejected, account switches cannot leak stale writes, verified owners sync normally, and user_drugs storage is RLS-protected.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
