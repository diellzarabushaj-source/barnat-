'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const client = read('user-library-client.js');
const html = read('index.html');
const finalizer = read('scripts/patch-registry-personal-final.js');

for (const file of [
  'registry-user-personalization.js',
  'user-library-client.js',
  'scripts/audit-registry-personal-source.js',
  'scripts/patch-registry-personal-final.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(ui, /LONG_SESSION_VERSION = 'registry-personal-long-session-v1'/);
assert.match(client, /LONG_SESSION_VERSION = 'registry-personal-long-session-v1'/);
assert.match(ui, /PERSONALIZATION_INSTANCE_KEY/, 'Personalization must refuse duplicate controller execution.');
assert.match(client, /LIBRARY_INSTANCE_KEY/, 'User-library client must refuse duplicate execution.');
assert.match(ui, /if \(window\[PERSONALIZATION_INSTANCE_KEY\]\) return/);
assert.match(client, /if \(window\[LIBRARY_INSTANCE_KEY\]\) return/);

assert.match(client, /API_TIMEOUT_MS = 15_000/, 'User-library requests need a bounded lifetime.');
assert.match(client, /AbortController/, 'User-library timeout must abort the underlying request, not only race it.');
assert.match(client, /status:408, code:'LIBRARY_SYNC_TIMEOUT'/, 'Timeouts must become recoverable pending syncs.');
assert.match(client, /\[408, 429, 503\]/, 'Timeout, rate-limit and outage responses must share retry handling.');
assert.match(client, /scheduleRecoveryRetry\(retryUntil\)/, 'Transient sync failures need an automatic retry path.');

assert.match(client, /let localRevision = 0/);
assert.match(client, /let syncedRevision = 0/);
assert.match(client, /const revisionAtStart = localRevision/);
assert.match(client, /syncedRevision = Math\.max\(syncedRevision, revisionAtStart\)/);
assert.match(client, /async function flushThroughRevision\(targetRevision\)/);
assert.match(client, /const targetRevision = localRevision/);
assert.match(client, /return flushThroughRevision\(targetRevision\)/, 'syncNow must wait through the revision it captured.');
assert.match(client, /syncedRevision, localRevision/, 'Sync events must expose revision settlement to the UI.');

const pollStart = client.indexOf('function pollLegacyPrescriptions()');
const pollEnd = client.indexOf('function onPersonalLibraryMutation()', pollStart);
assert(pollStart >= 0 && pollEnd > pollStart);
const pollSection = client.slice(pollStart, pollEnd);
assert.match(pollSection, /parseArray\(PRESCRIPTIONS_KEY\)/, 'Legacy compatibility poll should read only prescriptions.');
assert.doesNotMatch(pollSection, /const current = readState\(\)/, 'Legacy poll must not parse Favorites and Notes every five seconds.');
assert.match(pollSection, /document\.visibilityState === 'hidden'/, 'Hidden tabs must not do legacy polling work.');
assert.match(client, /function startLegacyPrescriptionPoll\(\)/);
assert.match(client, /function stopLegacyPrescriptionPoll\(\)/);
assert.match(client, /clearInterval\(legacyPrescriptionPollTimer\)/);

assert.match(ui, /favoritesStorageRaw/);
assert.match(ui, /notesStorageRaw/);
assert.match(ui, /raw === favoritesStorageRaw/, 'Unchanged Favorites storage must not be reparsed on every render event.');
assert.match(ui, /rawStorage === notesStorageRaw/, 'Unchanged Notes storage must not be reparsed on every render event.');
assert.match(ui, /const rowProfileCache = new WeakMap\(\)/, 'Row identity cache must be garbage-collectable with old rendered rows.');
assert.match(ui, /rowProfileCache\.get\(row\)/);
assert.match(ui, /rowProfileCache\.set\(row, profile\)/);
assert.doesNotMatch(ui, /new Map\(\).*rowProfile|rowProfileCache = new Map/, 'Long-session row cache must never strongly retain removed rows.');

const syncedStart = ui.indexOf("window.addEventListener('medindex:library-synced'");
const syncedEnd = ui.indexOf("window.addEventListener('medindex:library-pending'", syncedStart);
assert(syncedStart >= 0 && syncedEnd > syncedStart);
const syncedSection = ui.slice(syncedStart, syncedEnd);
assert.match(syncedSection, /synced >= local/, 'UI must clear pending state only after the newest local revision is settled.');
assert.match(syncedSection, /if \(settled\) pendingSync\.clear\(\)/);
assert.doesNotMatch(syncedSection, /!favoriteInFlight\.size && !noteInFlight\.size/, 'Pending cleanup must not depend on timing of UI locks.');

assert.match(client, /diagnostics:\(\) => \(\{[\s\S]*localRevision[\s\S]*syncedRevision/);
assert.match(ui, /diagnostics:\(\) => \(\{[\s\S]*pendingSync/);
assert.match(html, /registry-user-personalization\.js\?v=[^"']+&ls=20260817-1/);
assert.match(html, /user-library-client\.js\?v=[^"']+&ls=20260817-1/);
assert.match(finalizer, /require\('\.\/audit-registry-personal-source\.js'\)/, 'Long-session behavior must be verified from canonical source, not reconstructed by a late patch.');
assert.doesNotMatch(finalizer, /patch-registry-personal-long-session/, 'Obsolete Phase 10 late patch must not return to the finalizer.');
assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'patch-registry-personal-long-session.js')), false, 'Phase 14 must keep the obsolete Phase 10 late patch deleted.');

assert.doesNotMatch(ui, /setInterval\s*\(/, 'Personalization controller must stay event-driven.');
assert.doesNotMatch(ui, /MutationObserver/, 'Long-session personalization must not introduce DOM observers.');

console.log('Phase 10 regression gate passed: source-owned rapid-mutation safety, transient recovery, hidden-tab efficiency and bounded caches remain protected after Phase 14 build cleanup.');
