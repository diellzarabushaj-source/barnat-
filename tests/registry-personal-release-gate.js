'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const client = read('user-library-client.js');
const css = read('registry-user-personalization.css');
const html = read('index.html');
const finalizer = read('scripts/patch-registry-personal-final.js');
const sourceAudit = read('scripts/audit-registry-personal-source.js');
const offline = read('scripts/patch-offline-shell-manifest.js');
const pkg = JSON.parse(read('package.json'));
const release = JSON.parse(read('registry-personal-release.json'));
const buildRuntime = String(pkg.scripts?.['build:runtime'] || '');

for (const file of [
  'registry-user-personalization.js',
  'user-library-client.js',
  'scripts/audit-registry-personal-source.js',
  'scripts/patch-registry-personal-final.js',
  'scripts/patch-offline-shell-manifest.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

// Frozen release identity.
assert.equal(release.release, 'favorites-notes-v1.0.0');
assert.equal(release.status, 'frozen');
assert.equal(release.releaseGate, 'tests/registry-personal-release-gate.js');
assert.deepEqual(release.canonicalSources, [
  'registry-user-personalization.js',
  'registry-user-personalization.css',
  'user-library-client.js',
]);
assert.equal(release.productionAlias, 'barnat-six.vercel.app');

// Canonical ownership and UX contract.
assert.match(ui, /PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1'/);
assert.match(ui, /LONG_SESSION_VERSION = 'registry-personal-long-session-v1'/);
assert.match(ui, /PERSONALIZATION_INSTANCE_KEY/);
assert.match(ui, /if \(window\[PERSONALIZATION_INSTANCE_KEY\]\) return/);
assert.match(ui, /function settleLibrary\(detail = \{\}\)/);
assert.match(ui, /window\.MEDINDEX_LIBRARY_READY/);
assert.match(ui, /function personalTotal\(\)/);
assert.match(ui, /function personalFilteredCount\(\)/);
assert.match(ui, /runtime\(\)\?\.getFilteredCount\?\.\(\)/);
assert.match(ui, /medindex-personal-filtered-empty/);
assert.match(ui, /Asnjë rezultat me filtrat aktualë/);
assert.match(ui, /Ende nuk ke barna të ruajtura/);
assert.match(ui, /Nuk ke ende shënime/);
assert.match(ui, /librarySyncState = 'saving'/);
assert.match(ui, /librarySyncState = 'pending'/);
assert.match(ui, /librarySyncState = 'synced'/);
assert.match(ui, /data-personal-banner-sync/);
assert.match(ui, /role="status" aria-live="polite"/);
assert.match(ui, /data-mi-phase8-favorite-count/);
assert.match(ui, /data-mi-phase8-note-count/);
assert.match(ui, /favoritesStorageRaw/);
assert.match(ui, /notesStorageRaw/);
assert.match(ui, /const rowProfileCache = new WeakMap\(\)/);
assert.doesNotMatch(ui, /rowProfileCache\s*=\s*new Map/);
assert.doesNotMatch(ui, /setInterval\s*\(/);
assert.doesNotMatch(ui, /MutationObserver/);

const applyStart = ui.indexOf('function applyRuntimeView()');
const applyFilter = ui.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
const revealRows = ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
assert(applyStart >= 0 && applyFilter > applyStart && revealRows > applyFilter,
  'Personal filter must apply before stale rows can be revealed.');

const setViewStart = ui.indexOf('function setView(view)');
const enterLoading = ui.indexOf("document.body.classList.add('medindex-personal-view-loading')", setViewStart);
const handoff = ui.indexOf('applyRuntimeView()', setViewStart);
assert(setViewStart >= 0 && enterLoading > setViewStart && handoff > enterLoading,
  'Personal view must enter loading before runtime handoff.');

assert.match(css, /registry-personal-ux-phase8-v1/);
assert.match(css, /medindex-personal-view-loading #registryContent #tbody\{visibility:hidden!important\}/);
assert.match(css, /medindex-personal-empty-visible #dataTable/);
assert.match(css, /data-personal-banner-sync\]\[data-state="saving"\]/);
assert.match(css, /data-personal-banner-sync\]\[data-state="pending"\]/);
assert.match(css, /data-personal-banner-sync\]\[data-state="synced"\]/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(html, /registry-user-personalization\.css\?v=20260816-7&ux=20260817-1/);
assert.match(html, /registry-user-personalization\.js\?v=20260816-7&ux=20260817-1/);
assert.match(html, /registry-user-personalization\.js\?v=[^"']+&ls=20260817-1/);
assert.match(html, /user-library-client\.js\?v=[^"']+&ls=20260817-1/);

// Durable sync, recovery and rapid-mutation contract.
assert.match(client, /EVENT_SYNC_VERSION = 'user-library-event-sync-v1'/);
assert.match(client, /RECOVERY_VERSION = 'user-library-recovery-v1'/);
assert.match(client, /LONG_SESSION_VERSION = 'registry-personal-long-session-v1'/);
assert.match(client, /LIBRARY_INSTANCE_KEY/);
assert.match(client, /if \(window\[LIBRARY_INSTANCE_KEY\]\) return/);
assert.match(client, /API_TIMEOUT_MS = 15_000/);
assert.match(client, /AbortController/);
assert.match(client, /status:408, code:'LIBRARY_SYNC_TIMEOUT'/);
assert.match(client, /\[408, 429, 503\]/);
assert.match(client, /scheduleRecoveryRetry\(retryUntil\)/);
assert.match(client, /let localRevision = 0/);
assert.match(client, /let syncedRevision = 0/);
assert.match(client, /const revisionAtStart = localRevision/);
assert.match(client, /syncedRevision = Math\.max\(syncedRevision, revisionAtStart\)/);
assert.match(client, /async function flushThroughRevision\(targetRevision\)/);
assert.match(client, /const targetRevision = localRevision/);
assert.match(client, /return flushThroughRevision\(targetRevision\)/);
assert.match(client, /const reconciled = mergeRemote\(payload\)/);
assert.match(client, /localDeleted && localDeleted >= remoteUpdated/);
assert.match(client, /'medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved'/);
assert.match(client, /window\.addEventListener\('storage', event =>/);
assert.doesNotMatch(client, /const POLL_MS = 1200|window\.setInterval\(poll, POLL_MS\)/);

const pollStart = client.indexOf('function pollLegacyPrescriptions()');
const pollEnd = client.indexOf('function onPersonalLibraryMutation()', pollStart);
assert(pollStart >= 0 && pollEnd > pollStart);
const pollSection = client.slice(pollStart, pollEnd);
assert.match(pollSection, /parseArray\(PRESCRIPTIONS_KEY\)/);
assert.match(pollSection, /document\.visibilityState === 'hidden'/);
assert.doesNotMatch(pollSection, /const current = readState\(\)/);

const syncedStart = ui.indexOf("window.addEventListener('medindex:library-synced'");
const syncedEnd = ui.indexOf("window.addEventListener('medindex:library-pending'", syncedStart);
assert(syncedStart >= 0 && syncedEnd > syncedStart);
const syncedSection = ui.slice(syncedStart, syncedEnd);
assert.match(syncedSection, /synced >= local/);
assert.match(syncedSection, /if \(settled\) pendingSync\.clear\(\)/);
assert.doesNotMatch(syncedSection, /!favoriteInFlight\.size && !noteInFlight\.size/);

// One prebuild source gate + one postbuild release gate.
assert.match(buildRuntime, /^node scripts\/audit-registry-personal-source\.js && /);
assert.equal((buildRuntime.match(/audit-registry-personal-source\.js/g) || []).length, 1);
assert.match(buildRuntime, /node scripts\/patch-offline-shell-manifest\.js$/);
assert.match(offline, /^'use strict';\n\nrequire\('\.\/patch-registry-personal-final\.js'\);/);
assert.match(finalizer, /execFileSync/);
assert.match(finalizer, /registry-personal-release-gate\.js/);
assert.doesNotMatch(finalizer, /registry-personal-ux-phase8-test|registry-personal-long-session-test|registry-personal-finalizer-test/);
assert.doesNotMatch(finalizer, /fs\.writeFileSync|localStorage|fetch\s*\(/);
assert.doesNotMatch(sourceAudit, /writeFileSync|appendFileSync/);

for (const retired of [
  'scripts/patch-registry-phase16-personal-ux.js',
  'scripts/patch-registry-phase16-personal-ux-v2.js',
  'scripts/patch-registry-personal-long-session.js',
  'tests/registry-personal-ux-phase8-test.js',
  'tests/registry-personal-long-session-test.js',
  'tests/registry-personal-finalizer-test.js',
]) {
  assert.equal(fs.existsSync(path.join(ROOT, retired)), false, `${retired} must stay retired.`);
}

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem:key => data.has(String(key)) ? data.get(String(key)) : null,
    setItem:(key, value) => data.set(String(key), String(value)),
    removeItem:key => data.delete(String(key)),
    clear:() => data.clear(),
  };
}

function response(status, payload, headers = {}) {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok:status >= 200 && status < 300,
    status,
    headers:{ get:name => normalized[String(name).toLowerCase()] || null },
    json:async () => payload,
  };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runBehaviorAcceptance() {
  const FAVORITES_KEY = 'regjistriBarnave_favoritet_v1';
  const NOTES_KEY = 'regjistriBarnave_shenime_v1';
  const PRESCRIPTIONS_KEY = 'regjistriBarnave_protokollet_v1';
  const META_KEY = 'medindex_user_library_meta_v1';
  const calls = [];
  const control = { failNextPut503:false, deferNextPut:false, deferredResolve:null };

  const localStorage = memoryStorage({
    [FAVORITES_KEY]:'[]',
    [NOTES_KEY]:'{}',
    [PRESCRIPTIONS_KEY]:'[]',
  });
  const sessionStorage = memoryStorage();
  const navigator = { onLine:true };
  const listeners = new Map();
  const documentListeners = new Map();

  const add = (map, name, fn) => {
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(fn);
  };
  const dispatch = (map, event) => {
    for (const fn of map.get(event.type) || []) fn(event);
  };

  const nativeFetch = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url:String(url), method, body });
    if (method === 'GET' && String(url) === '/api/user-library') {
      return response(200, {
        user:{ id:'release-user' },
        prescriptions:[], favorites:[],
        tombstones:{ prescriptions:[], favorites:[] },
        generatedAt:new Date().toISOString(),
      });
    }
    if (method === 'PUT' && String(url) === '/api/user-library') {
      if (control.failNextPut503) {
        control.failNextPut503 = false;
        return response(503, { error:'busy' }, { 'retry-after':'1' });
      }
      const success = () => response(200, { ...body, generatedAt:new Date().toISOString() });
      if (control.deferNextPut) {
        control.deferNextPut = false;
        return new Promise(resolve => { control.deferredResolve = () => resolve(success()); });
      }
      return success();
    }
    if (method === 'DELETE' && /\/api\/auth(?:\?|$)/.test(String(url))) {
      return response(200, { ok:true });
    }
    return response(200, {});
  };

  class CustomEventMock {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail || {}; }
  }

  const window = {
    fetch:nativeFetch,
    addEventListener:(name, fn) => add(listeners, name, fn),
    dispatchEvent:event => { dispatch(listeners, event); return true; },
    setTimeout,
    clearTimeout,
    setInterval:() => 1,
    clearInterval:() => {},
  };
  const document = {
    visibilityState:'visible',
    addEventListener:(name, fn) => add(documentListeners, name, fn),
    dispatchEvent:event => { dispatch(documentListeners, event); return true; },
  };
  const location = { reload:() => {}, pathname:'/', search:'', hash:'' };

  const context = vm.createContext({
    window, document, navigator, localStorage, sessionStorage, location,
    CustomEvent:CustomEventMock, AbortController,
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Promise, Map, Set, WeakMap, JSON, String, Number, Object, Array,
    RegExp, Error, Boolean, Math,
  });
  vm.runInContext(client, context, { filename:'user-library-client.js' });
  await window.MEDINDEX_LIBRARY_READY;
  calls.length = 0;

  const puts = () => calls.filter(call => call.method === 'PUT' && call.url === '/api/user-library');
  const mutateFavorites = values => localStorage.setItem(FAVORITES_KEY, JSON.stringify(values));
  const fire = type => window.dispatchEvent({ type });

  // Favorite mutation is event-driven.
  mutateFavorites(['drug-a']);
  fire('medindex:favorites-changed');
  await sleep(110);
  assert(puts().some(call => call.body?.favorites?.some(row => row.entityType === 'drug' && row.entityKey === 'drug-a')),
    'Favorite mutation must sync without waiting for legacy polling.');

  // Note mutation uses the same durable sync path.
  localStorage.setItem(NOTES_KEY, JSON.stringify({
    'registry:1':{ text:'Kontrollo dozën.', updatedAt:new Date().toISOString() },
  }));
  fire('medindex:notes-changed');
  await sleep(110);
  assert(puts().some(call => call.body?.favorites?.some(row => row.entityType === 'protocol'
    && row.entityKey === 'drug-note:registry:1' && row.payload?.kind === 'drug-note')),
  'Note mutation must sync as a namespaced user-library entity.');

  // Cross-tab storage changes are captured.
  mutateFavorites(['drug-a', 'drug-b']);
  window.dispatchEvent({ type:'storage', key:FAVORITES_KEY });
  await sleep(110);
  assert(puts().some(call => call.body?.favorites?.some(row => row.entityKey === 'drug-b')),
    'Cross-tab Favorite mutation must sync through the storage event.');

  // A mutation during an in-flight PUT must trigger a second PUT.
  const beforeRace = puts().length;
  control.deferNextPut = true;
  mutateFavorites(['drug-a', 'drug-b', 'drug-c']);
  fire('medindex:favorites-changed');
  await sleep(65);
  assert.equal(typeof control.deferredResolve, 'function', 'Expected an in-flight deferred PUT.');
  mutateFavorites(['drug-a', 'drug-b', 'drug-c', 'drug-d']);
  fire('medindex:favorites-changed');
  control.deferredResolve();
  await sleep(150);
  const racePuts = puts().slice(beforeRace);
  assert(racePuts.length >= 2, 'Mutation during an in-flight sync must cause a follow-up PUT.');
  assert(racePuts.some(call => call.body?.favorites?.some(row => row.entityKey === 'drug-d')),
    'Follow-up PUT must contain the newest Favorite revision.');

  // Offline mutation remains local, then online resumes sync.
  navigator.onLine = false;
  fire('offline');
  const beforeOffline = puts().length;
  mutateFavorites(['drug-a', 'drug-b', 'drug-c', 'drug-d', 'drug-e']);
  fire('medindex:favorites-changed');
  await sleep(90);
  assert.equal(puts().length, beforeOffline, 'Offline mutation must not attempt a PUT.');
  navigator.onLine = true;
  fire('online');
  await sleep(160);
  assert(puts().slice(beforeOffline).some(call => call.body?.favorites?.some(row => row.entityKey === 'drug-e')),
    'Online recovery must flush the offline Favorite mutation.');

  // 503 enters retry/pending state; online reset recovers immediately.
  control.failNextPut503 = true;
  mutateFavorites(['drug-a', 'drug-b', 'drug-c', 'drug-d', 'drug-e', 'drug-f']);
  fire('medindex:favorites-changed');
  await sleep(110);
  const pending = window.MedIndexUserLibrary.diagnostics();
  assert(pending.retryUntil > Date.now(), '503 must establish a retry window.');
  assert.equal(pending.dirty, true, '503 must keep the newest local revision pending.');
  fire('online');
  await sleep(170);
  assert(puts().some(call => call.body?.favorites?.some(row => row.entityKey === 'drug-f')),
    'Recovery after transient failure must preserve and sync the newest mutation.');

  // Logout flushes current state before clearing personal local cache.
  mutateFavorites(['drug-a', 'drug-b', 'drug-c', 'drug-d', 'drug-e', 'drug-f', 'drug-g']);
  const callStart = calls.length;
  await window.fetch('/api/auth', { method:'DELETE' });
  const logoutCalls = calls.slice(callStart);
  const logoutPut = logoutCalls.findIndex(call => call.method === 'PUT' && call.url === '/api/user-library');
  const logoutDelete = logoutCalls.findIndex(call => call.method === 'DELETE' && /\/api\/auth/.test(call.url));
  assert(logoutPut >= 0 && logoutDelete > logoutPut, 'Logout must flush the user library before the auth DELETE.');
  assert.equal(localStorage.getItem(FAVORITES_KEY), null);
  assert.equal(localStorage.getItem(NOTES_KEY), null);
  assert.equal(localStorage.getItem(PRESCRIPTIONS_KEY), null);
  assert.equal(localStorage.getItem(META_KEY), null);
}

runBehaviorAcceptance()
  .then(() => {
    console.log('Phase 16 final acceptance passed: event-driven Favorite/Note sync, cross-tab propagation, in-flight revision recovery, offline/online recovery, transient failure recovery and logout flush all execute correctly.');
    console.log('Favorites/Notes release favorites-notes-v1.0.0 is frozen by the canonical release gate.');
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
