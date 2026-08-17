'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const client = read('user-library-client.js');
const html = read('index.html');

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

requireText(ui, "LONG_SESSION_VERSION = 'registry-personal-long-session-v1'", 'Phase 10 marker is missing from canonical personalization source.');
requireText(client, "LONG_SESSION_VERSION = 'registry-personal-long-session-v1'", 'Phase 10 marker is missing from canonical user-library source.');
requireText(ui, 'PERSONALIZATION_INSTANCE_KEY', 'Phase 10 personalization singleton guard is missing.');
requireText(client, 'LIBRARY_INSTANCE_KEY', 'Phase 10 user-library singleton guard is missing.');
requireText(ui, 'if (window[PERSONALIZATION_INSTANCE_KEY]) return', 'Phase 10 duplicate personalization execution guard is missing.');
requireText(client, 'if (window[LIBRARY_INSTANCE_KEY]) return', 'Phase 10 duplicate library execution guard is missing.');

requireText(client, 'API_TIMEOUT_MS = 15_000', 'Phase 10 bounded API lifetime is missing.');
requireText(client, 'AbortController', 'Phase 10 request abort support is missing.');
requireText(client, "status:408, code:'LIBRARY_SYNC_TIMEOUT'", 'Phase 10 timeout recovery contract is missing.');
requireText(client, '[408, 429, 503]', 'Phase 10 transient retry status handling is missing.');
requireText(client, 'scheduleRecoveryRetry(retryUntil)', 'Phase 10 automatic retry scheduling is missing.');

requireText(client, 'let localRevision = 0', 'Phase 10 local revision state is missing.');
requireText(client, 'let syncedRevision = 0', 'Phase 10 synced revision state is missing.');
requireText(client, 'const revisionAtStart = localRevision', 'Phase 10 revision capture is missing.');
requireText(client, 'syncedRevision = Math.max(syncedRevision, revisionAtStart)', 'Phase 10 revision settlement is missing.');
requireText(client, 'async function flushThroughRevision(targetRevision)', 'Phase 10 revision-safe flush is missing.');
requireText(client, 'const targetRevision = localRevision', 'Phase 10 syncNow target revision is missing.');
requireText(client, 'return flushThroughRevision(targetRevision)', 'Phase 10 syncNow must settle its captured revision.');
requireText(client, 'syncedRevision, localRevision', 'Phase 10 sync events must expose revision settlement.');

const pollStart = client.indexOf('function pollLegacyPrescriptions()');
const pollEnd = client.indexOf('function onPersonalLibraryMutation()', pollStart);
if (!(pollStart >= 0 && pollEnd > pollStart)) throw new Error('Phase 10 prescription compatibility poll is missing.');
const pollSection = client.slice(pollStart, pollEnd);
requireText(pollSection, 'parseArray(PRESCRIPTIONS_KEY)', 'Phase 10 legacy poll must read prescriptions only.');
requireText(pollSection, "document.visibilityState === 'hidden'", 'Phase 10 hidden-tab poll suspension is missing.');
if (pollSection.includes('const current = readState()')) throw new Error('Phase 10 legacy poll must not parse Favorites/Notes.');
requireText(client, 'function startLegacyPrescriptionPoll()', 'Phase 10 poll lifecycle start is missing.');
requireText(client, 'function stopLegacyPrescriptionPoll()', 'Phase 10 poll lifecycle stop is missing.');
requireText(client, 'clearInterval(legacyPrescriptionPollTimer)', 'Phase 10 poll cleanup is missing.');

requireText(ui, 'favoritesStorageRaw', 'Phase 10 Favorites parse cache is missing.');
requireText(ui, 'notesStorageRaw', 'Phase 10 Notes parse cache is missing.');
requireText(ui, 'raw === favoritesStorageRaw', 'Phase 10 Favorites parse-cache reuse is missing.');
requireText(ui, 'rawStorage === notesStorageRaw', 'Phase 10 Notes parse-cache reuse is missing.');
requireText(ui, 'const rowProfileCache = new WeakMap();', 'Phase 10 WeakMap row cache is missing.');
requireText(ui, 'rowProfileCache.get(row)', 'Phase 10 WeakMap lookup is missing.');
requireText(ui, 'rowProfileCache.set(row, profile)', 'Phase 10 WeakMap population is missing.');
if (/rowProfileCache\s*=\s*new Map/.test(ui)) throw new Error('Phase 10 must not strongly retain removed rows.');

const syncedStart = ui.indexOf("window.addEventListener('medindex:library-synced'");
const syncedEnd = ui.indexOf("window.addEventListener('medindex:library-pending'", syncedStart);
if (!(syncedStart >= 0 && syncedEnd > syncedStart)) throw new Error('Phase 10 library-synced UI handler is missing.');
const syncedSection = ui.slice(syncedStart, syncedEnd);
requireText(syncedSection, 'synced >= local', 'Phase 10 UI must wait for newest revision settlement.');
requireText(syncedSection, 'if (settled) pendingSync.clear()', 'Phase 10 pending cleanup must be revision-driven.');
if (syncedSection.includes('!favoriteInFlight.size && !noteInFlight.size')) {
  throw new Error('Phase 10 pending cleanup must not depend on UI lock timing.');
}

requireText(client, 'diagnostics:() => ({', 'Phase 10 library diagnostics are missing.');
requireText(client, 'localRevision', 'Phase 10 library diagnostics must expose local revision.');
requireText(client, 'syncedRevision', 'Phase 10 library diagnostics must expose synced revision.');
requireText(ui, 'diagnostics:() => ({', 'Phase 10 personalization diagnostics are missing.');
requireText(ui, 'pendingSync', 'Phase 10 personalization diagnostics must expose pending sync state.');
requireText(html, '&ls=20260817-1', 'Phase 10 cache-buster is missing from published personal assets.');

if (/setInterval\s*\(/.test(ui)) throw new Error('Phase 10 personalization controller must remain event-driven.');
if (/MutationObserver/.test(ui)) throw new Error('Phase 10 personalization must not introduce DOM observers.');

console.log('Phase 10 long-session hardening passed: canonical source already owns singleton listeners, bounded sync, revision safety, hidden-tab polling and weak row caches; this stage is audit-only.');
