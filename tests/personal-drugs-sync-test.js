'use strict';

// Phase 7 — personal drug sync, exercised against the real client code.
//
// The other client tests assert on the source text. Sync logic decides whether a
// doctor's entry survives a round trip, so this one boots `user-library-client.js`
// inside a stubbed browser and drives it: save locally, read what would be sent,
// merge what the server returns, and delete.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'user-library-client.js'), 'utf8');

function createStorage() {
  const map = new Map();
  return {
    getItem:key => (map.has(key) ? map.get(key) : null),
    setItem:(key, value) => { map.set(key, String(value)); },
    removeItem:key => { map.delete(key); },
    _map:map,
  };
}

// Boots the client with a browser stub. `fetchResponses` is a queue consumed by the
// client's own sync path; the default keeps the network quiet so the test drives
// the library through its public API instead of racing a background flush.
function bootClient({ storage = createStorage(), snapshot = null } = {}) {
  const listeners = new Map();
  const dispatched = [];
  const requests = [];

  const windowStub = {
    addEventListener:(name, handler) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(handler);
    },
    removeEventListener:() => {},
    dispatchEvent:event => {
      dispatched.push(event);
      (listeners.get(event.type) || []).forEach(handler => handler(event));
      return true;
    },
    setTimeout:() => 0,
    clearTimeout:() => {},
    setInterval:() => 0,
    clearInterval:() => {},
  };

  class CustomEventStub {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const sandbox = {
    window:windowStub,
    document:{
      addEventListener:() => {},
      visibilityState:'visible',
    },
    navigator:{ onLine:true },
    localStorage:storage,
    CustomEvent:CustomEventStub,
    AbortController:undefined,
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
    setTimeout:() => 0,
    clearTimeout:() => {},
    setInterval:() => 0,
    clearInterval:() => {},
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  windowStub.fetch = async (url, options = {}) => {
    requests.push({ url:String(url), options });
    const body = snapshot || { ok:true, version:1, prescriptions:[], favorites:[], drugs:[], tombstones:{} };
    return {
      ok:true,
      status:200,
      headers:{ get:() => null },
      json:async () => body,
    };
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename:'user-library-client.js' });

  return { api:windowStub.MedIndexUserLibrary, storage, dispatched, requests, sandbox, listeners };
}

const DRUGS_KEY = 'regjistriBarnave_barnat_personale_v1';
const META_KEY = 'medindex_user_library_meta_v1';

(async () => {

// --- the client exposes a real personal-drug API ------------------------

{
  const { api } = bootClient();
  assert.equal(typeof api.savePersonalDrug, 'function', 'the UI needs a save entry point');
  assert.equal(typeof api.deletePersonalDrug, 'function', 'the UI needs a delete entry point');
  assert.equal(typeof api.personalDrugs, 'function', 'the UI needs to read personal drugs');
  assert.ok(api.personalDrugFields.notes > 0, 'the field schema is published to the UI');
}

// --- saving stores a normalized entry and asks for a sync ---------------

{
  const { api, storage, dispatched } = bootClient();
  const saved = api.savePersonalDrug({
    name:'  Bari im  ',
    fields:{ notes:'shënim', atcCode:'N02BE01', injected:'must not survive' },
  });

  assert.ok(saved.clientId, 'a saved entry gets a stable local id');
  assert.equal(saved.name, 'Bari im', 'the name is trimmed');
  assert.deepEqual(Object.keys(saved.fields).sort(), ['atcCode', 'notes'], 'unknown fields are dropped client-side too');

  const stored = JSON.parse(storage.getItem(DRUGS_KEY));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Bari im');

  assert.ok(
    dispatched.some(event => event.type === 'medindex:personal-drugs-changed'),
    'saving must announce the change so the library schedules a sync',
  );

  assert.throws(() => api.savePersonalDrug({ name:'   ' }), /emrin/, 'a nameless entry is refused');
}

// --- editing replaces in place rather than duplicating ------------------

{
  const { api } = bootClient();
  const first = api.savePersonalDrug({ name:'Bari', fields:{ notes:'v1' } });
  api.savePersonalDrug({ clientId:first.clientId, name:'Bari', fields:{ notes:'v2' } });

  const all = api.personalDrugs();
  assert.equal(all.length, 1, 'editing an entry must not create a second one');
  assert.equal(all[0].fields.notes, 'v2');
}

// --- deleting removes it and announces the change -----------------------

{
  const { api, dispatched } = bootClient();
  const saved = api.savePersonalDrug({ name:'Bari' });
  dispatched.length = 0;

  assert.equal(api.deletePersonalDrug(saved.clientId), true);
  assert.equal(api.personalDrugs().length, 0);
  assert.ok(dispatched.some(event => event.type === 'medindex:personal-drugs-changed'));
  assert.equal(api.deletePersonalDrug('nuk-ekziston'), false, 'deleting an unknown id is a no-op');
}

// --- a server snapshot merges into the local library --------------------

{
  const storage = createStorage();
  const snapshot = {
    ok:true,
    version:1,
    prescriptions:[],
    favorites:[],
    drugs:[{
      clientId:'from-server-1',
      name:'Bari nga serveri',
      fields:{ notes:'nga pajisja tjetër', ignored:'drop' },
      source:'personal',
      clientUpdatedAt:'2026-08-20T10:00:00.000Z',
      serverUpdatedAt:'2026-08-20T10:00:00.000Z',
    }],
    tombstones:{},
  };

  const { api } = bootClient({ storage, snapshot });
  // The library merges on sync; drive it directly so the test does not depend on
  // background timers.
  await api.syncNow().catch(() => {});

  const merged = api.personalDrugs();
  assert.equal(merged.length, 1, 'a drug added on another device arrives here');
  assert.equal(merged[0].name, 'Bari nga serveri');
  assert.deepEqual(Object.keys(merged[0].fields), ['notes'], 'unknown remote fields are dropped');
}

// --- what gets sent to the server keeps the contract --------------------

{
  const { api, requests } = bootClient();
  api.savePersonalDrug({ name:'Bari për sinkronizim', fields:{ adultDose:'1 tabletë' } });
  await api.syncNow().catch(() => {});

  const write = requests.find(entry => entry.options?.body);
  assert.ok(write, 'a saved personal drug must reach the server');
  const body = JSON.parse(write.options.body);
  assert.ok(Array.isArray(body.drugs), 'the sync body carries a drugs array');
  assert.equal(body.drugs[0].name, 'Bari për sinkronizim');
  assert.ok(body.drugs[0].clientUpdatedAt, 'every entry carries a timestamp so last-write-wins can resolve');
  assert.ok(Array.isArray(body.tombstones.drugs), 'deletions travel as tombstones, like favorites and prescriptions');
}

// --- logging out clears personal drugs from the browser -----------------

{
  const { storage } = bootClient();
  assert.ok(
    source.includes('localStorage.removeItem(DRUGS_KEY)'),
    'personal drugs must be wiped from the device on logout, like every other private collection',
  );
  assert.ok(storage);
}

// --- meta tracks drugs separately from favorites ------------------------

{
  const { api, storage } = bootClient();
  api.savePersonalDrug({ name:'Bari' });
  const meta = JSON.parse(storage.getItem(META_KEY) || '{}');
  assert.ok(meta.drugs && typeof meta.drugs === 'object', 'drug timestamps have their own meta bucket');
  assert.ok(meta.deletedDrugs && typeof meta.deletedDrugs === 'object', 'drug tombstones have their own meta bucket');
}

console.log('Personal drug sync contract passed.');

})().catch(error => {
  console.error(error);
  process.exit(1);
});
