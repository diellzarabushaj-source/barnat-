'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'user-library-client.js');
if (!fs.readFileSync(TARGET, 'utf8').includes('user-library-startup-fingerprint-v1')) {
  require('../scripts/patch-user-library-startup-sync.js');
}
const source = fs.readFileSync(TARGET, 'utf8');

assert.match(source, /user-library-startup-fingerprint-v1/);
assert.match(source, /function syncFingerprint\(/);
assert.match(source, /function hasPersistentPending\(/);
assert.match(source, /pendingBeforeMerge/);
assert.match(source, /startupNoop:true/);
assert.match(source, /startupPutSkipped/);

const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
const META_KEY = 'medindex_user_library_meta_v1';

function createStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem:key => map.has(String(key)) ? map.get(String(key)) : null,
    setItem:(key, value) => map.set(String(key), String(value)),
    removeItem:key => map.delete(String(key)),
    key:index => [...map.keys()][index] || null,
    get length() { return map.size; },
    dump:() => Object.fromEntries(map),
  };
}

function serverSnapshot({ user, body = null, remote = null }) {
  if (remote) return { ...remote, user, ok:true, version:1 };
  const now = '2026-08-26T08:30:00.000Z';
  if (!body) {
    return {
      ok:true,
      version:1,
      user,
      prescriptions:[],
      favorites:[],
      drugs:[],
      tombstones:{ prescriptions:[], favorites:[], drugs:[] },
      generatedAt:now,
    };
  }
  return {
    ok:true,
    version:1,
    user,
    prescriptions:(body.prescriptions || []).map(row => ({ ...row, serverUpdatedAt:now })),
    favorites:(body.favorites || []).map(row => ({ ...row, serverUpdatedAt:now })),
    drugs:(body.drugs || []).map(row => ({ ...row, serverUpdatedAt:now })),
    tombstones:body.tombstones || { prescriptions:[], favorites:[], drugs:[] },
    generatedAt:now,
  };
}

async function boot({ storage, remote = null, user = { id:'doctor-1', email:'doctor@example.test' } }) {
  const requests = [];
  const listeners = new Map();
  const events = [];
  let currentRemote = remote;

  const windowStub = {
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
    },
    removeEventListener() {},
    dispatchEvent(event) {
      events.push(event);
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    setTimeout,
    clearTimeout,
    setInterval:() => 1,
    clearInterval:() => {},
  };

  windowStub.fetch = async (input, options = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || '';
    const url = new URL(raw, 'https://medindex.test/index.html');
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(String(options.body)) : null;
    requests.push({ path:url.pathname, method, body });
    if (url.pathname !== '/api/user-library') {
      return new Response('{}', { status:200, headers:{ 'Content-Type':'application/json' } });
    }
    if (method === 'PUT') currentRemote = serverSnapshot({ user, body });
    const payload = serverSnapshot({ user, remote:currentRemote });
    return new Response(JSON.stringify(payload), { status:200, headers:{ 'Content-Type':'application/json' } });
  };

  const context = {
    window:windowStub,
    document:{
      visibilityState:'visible',
      addEventListener() {},
    },
    navigator:{ onLine:true },
    localStorage:storage,
    location:{
      href:'https://medindex.test/index.html',
      origin:'https://medindex.test',
      reload() {},
    },
    URL,
    Response,
    Headers,
    Request,
    AbortController,
    DOMException,
    CustomEvent:class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    console,
    JSON,
    Date,
    Math,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    setInterval:() => 1,
    clearInterval:() => {},
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename:'user-library-client.js' });

  await Promise.race([
    windowStub.MEDINDEX_LIBRARY_READY,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Library startup did not settle.')), 1500)),
  ]);
  await new Promise(resolve => setTimeout(resolve, 10));

  return { api:windowStub.MedIndexUserLibrary, requests, events, storage };
}

(async () => {
  // Migration/bootstrap is conservative: without a confirmed fingerprint the
  // first startup performs GET + PUT exactly once and records the baseline.
  const storage = createStorage();
  const first = await boot({ storage });
  assert.deepEqual(first.requests.filter(item => item.path === '/api/user-library').map(item => item.method), ['GET', 'PUT']);
  const firstMeta = JSON.parse(storage.getItem(META_KEY) || '{}');
  assert.equal(firstMeta.fingerprintVersion, 1);
  assert.match(String(firstMeta.syncedFingerprint || ''), /^v1:/);
  assert.equal(first.api.diagnostics().persistentSyncCurrent, true);

  // A normal unchanged startup must stay read-only after the GET. This is the
  // performance win: no duplicate serverless write, encryption or DB upsert.
  const second = await boot({ storage });
  assert.deepEqual(second.requests.filter(item => item.path === '/api/user-library').map(item => item.method), ['GET']);
  assert.equal(second.api.diagnostics().startupPutSkipped, true);
  assert.equal(second.api.diagnostics().persistentSyncCurrent, true);

  // Local/offline edits invalidate the fingerprint across a page restart and
  // therefore still force the PUT needed to preserve the doctor's change.
  storage.setItem(FAVORITES_KEY, JSON.stringify(['PDID-LOCAL|Bari lokal|10 mg']));
  const localEdit = await boot({ storage });
  assert.deepEqual(localEdit.requests.filter(item => item.path === '/api/user-library').map(item => item.method), ['GET', 'PUT']);
  assert.equal(localEdit.api.diagnostics().persistentSyncCurrent, true);

  // Remote-only changes are already authoritative after GET. They merge into
  // local storage and establish a new fingerprint without echoing a PUT back.
  const remoteStorage = createStorage();
  await boot({ storage:remoteStorage });
  const remote = {
    ok:true,
    version:1,
    prescriptions:[],
    favorites:[{
      entityType:'drug',
      entityKey:'PDID-REMOTE|Bari remote|20 mg',
      payload:{},
      clientUpdatedAt:'2026-08-26T09:00:00.000Z',
      serverUpdatedAt:'2026-08-26T09:00:00.000Z',
    }],
    drugs:[],
    tombstones:{ prescriptions:[], favorites:[], drugs:[] },
    generatedAt:'2026-08-26T09:00:00.000Z',
  };
  const remoteOnly = await boot({ storage:remoteStorage, remote });
  assert.deepEqual(remoteOnly.requests.filter(item => item.path === '/api/user-library').map(item => item.method), ['GET']);
  assert.deepEqual(JSON.parse(remoteStorage.getItem(FAVORITES_KEY) || '[]'), ['PDID-REMOTE|Bari remote|20 mg']);
  assert.equal(remoteOnly.api.diagnostics().persistentSyncCurrent, true);

  console.log('✓ User library startup fingerprint passed: unchanged sessions skip PUT, local/offline edits still sync, and remote-only changes stay read-only.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
