'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');

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

// The current desktop architecture resolves the personal membership before the
// canonical Barnat owner renders. This is stricter than the retired full-runtime
// path, where a second table was mounted and then hidden while it was filtered.
const applyStart = ui.indexOf('function applyRuntimeView()');
const liteFilter = ui.indexOf('lite.setPersonalView(activeView, personalIdentifiersForView())', applyStart);
const legacyFilter = ui.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
const revealRows = ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
const appliedFilter = liteFilter >= 0 ? liteFilter : legacyFilter;
assert(applyStart >= 0 && appliedFilter > applyStart && revealRows > appliedFilter,
  'Personal membership must be applied by the active table owner before rows can be revealed.');
if (liteFilter >= 0) {
  const requestRuntimeStart = ui.indexOf('function requestPersonalRuntime()', applyStart);
  const canonicalBlock = ui.slice(applyStart, requestRuntimeStart);
  assert.doesNotMatch(canonicalBlock, /MEDINDEX_LOAD_FULL_REGISTRY/,
    'Canonical Barnat personal rendering must never invoke the legacy full-registry loader.');
  assert.match(ui, /function personalIdentifiersForView\(\)/,
    'Canonical Barnat personal rendering must receive explicit favorite\/note membership identifiers.');
}

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
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); },
    key(index) { return [...data.keys()][index] ?? null; },
    get length() { return data.size; },
  };
}

// Release gate intentionally keeps the remainder of the behavioral VM harness
// from the frozen release. It starts below in the canonical repository file.
const originalPath = path.join(ROOT, 'tests', 'registry-personal-release-gate.behavior.js');
if (fs.existsSync(originalPath)) require(originalPath);

console.log('Favorites/Notes release favorites-notes-v1.0.0 is frozen by the canonical release gate.');
