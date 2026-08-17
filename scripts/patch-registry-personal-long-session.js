'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-personal-long-session-v1';
const ASSET_VERSION = '20260817-1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Phase 10 long-session patch could not find ${label} start.`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Phase 10 long-session patch could not find ${label} end.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchUserLibraryClient() {
  let source = read('user-library-client.js');
  if (source.includes(`const LONG_SESSION_VERSION = '${MARKER}';`)) return;
  if (!source.includes("const RECOVERY_VERSION = 'user-library-recovery-v1';")) {
    throw new Error('Phase 10 requires the Phase 7 user-library recovery layer first.');
  }

  source = source.replace(
    "  'use strict';\n\n  const API_URL = '/api/user-library';",
    [
      "  'use strict';",
      '',
      `  const LONG_SESSION_VERSION = '${MARKER}';`,
      "  const LIBRARY_INSTANCE_KEY = '__medindexUserLibraryClientLongSession';",
      '  if (window[LIBRARY_INSTANCE_KEY]) return;',
      '  window[LIBRARY_INSTANCE_KEY] = { version:LONG_SESSION_VERSION, startedAt:Date.now() };',
      '',
      "  const API_URL = '/api/user-library';",
    ].join('\n'),
  );

  source = source.replace(
    "  const RECOVERY_VERSION = 'user-library-recovery-v1';",
    [
      "  const RECOVERY_VERSION = 'user-library-recovery-v1';",
      '  const API_TIMEOUT_MS = 15_000;',
      '  const NETWORK_RETRY_MS = 15_000;',
      '  const MAX_SYNC_ROUNDS = 3;',
    ].join('\n'),
  );

  source = source.replace(
    '  let retryUntil = 0;\n  let retryTimer = 0;',
    '  let retryUntil = 0;\n  let retryTimer = 0;\n  let localRevision = 0;\n  let syncedRevision = 0;',
  );

  const apiReplacement = [
    '  async function api(url, options = {}) {',
    "    const canAbort = typeof AbortController === 'function' && !options.signal && !options.keepalive;",
    '    const controller = canAbort ? new AbortController() : null;',
    '    const requestOptions = { ...options };',
    '    if (controller) requestOptions.signal = controller.signal;',
    '    const timeout = controller ? window.setTimeout(() => controller.abort(), API_TIMEOUT_MS) : 0;',
    '    try {',
    '      const response = await nativeFetch(url, {',
    "        cache:'no-store',",
    "        credentials:'same-origin',",
    "        headers:{ Accept:'application/json', ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) },",
    '        ...requestOptions,',
    '      });',
    '      const payload = await response.json().catch(() => ({}));',
    '      if (!response.ok) {',
    "        const retryHeader = Number(response.headers.get('retry-after') || payload.retryAfter || 0);",
    '        throw Object.assign(new Error(payload.error || `Library API ${response.status}`), {',
    '          status:response.status,',
    '          retryAfterMs:Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 0,',
    '        });',
    '      }',
    '      return payload;',
    '    } catch (error) {',
    "      if (error?.name === 'AbortError') {",
    "        throw Object.assign(new Error('Library API timeout'), { status:408, code:'LIBRARY_SYNC_TIMEOUT', retryAfterMs:NETWORK_RETRY_MS });",
    '      }',
    '      throw error;',
    '    } finally {',
    '      if (timeout) clearTimeout(timeout);',
    '    }',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  async function api(url, options = {}) {', '  function dispatch(name, detail = {}) {', apiReplacement, 'bounded library API');

  const flushReplacement = [
    '  async function flush({ keepalive = false } = {}) {',
    '    if (!online || !navigator.onLine || Date.now() < retryUntil) return false;',
    '    if (syncPromise) return syncPromise;',
    '    clearTimeout(syncTimer);',
    '    const revisionAtStart = localRevision;',
    '    const payloadBody = JSON.stringify(buildBody());',
    '    syncPromise = (async () => {',
    '      let success = false;',
    '      try {',
    '        const payload = await api(API_URL, {',
    "          method:'PUT',",
    '          body:payloadBody,',
    '          keepalive,',
    '        });',
    '        const reconciled = mergeRemote(payload);',
    '        const meta = readMeta();',
    '        meta.lastSyncedAt = payload.generatedAt || nowIso();',
    '        writeMeta(meta);',
    '        success = true;',
    '        syncedRevision = Math.max(syncedRevision, revisionAtStart);',
    '        if (!resyncAfterFlight && syncedRevision >= localRevision) dirty = false;',
    "        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt, reconciled, syncedRevision, localRevision });",
    "        if (reconciled) dispatch('medindex:library-reconciled', { generatedAt:meta.lastSyncedAt });",
    '        return true;',
    '      } catch (error) {',
    '        if (error.status === 401 || error.status === 403) return false;',
    '        if ([408, 429, 503].includes(Number(error.status))) {',
    '          retryUntil = Date.now() + Math.max(NETWORK_RETRY_MS, Number(error.retryAfterMs || 0));',
    '          scheduleRecoveryRetry(retryUntil);',
    '        }',
    '        dirty = true;',
    "        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0, localRevision, syncedRevision });",
    '        return false;',
    '      } finally {',
    '        syncPromise = null;',
    '        if (success && resyncAfterFlight && online && navigator.onLine) {',
    '          resyncAfterFlight = false;',
    '          scheduleSync(EVENT_SYNC_DELAY_MS);',
    '        }',
    '      }',
    '    })();',
    '    return syncPromise;',
    '  }',
    '',
    '  async function flushThroughRevision(targetRevision) {',
    '    const target = Math.max(0, Number(targetRevision || 0));',
    '    let rounds = 0;',
    '    do {',
    '      rounds += 1;',
    '      const synced = await flush();',
    '      if (!synced) return false;',
    '      if (syncedRevision >= target) return true;',
    '    } while (rounds < MAX_SYNC_ROUNDS);',
    '    scheduleSync(EVENT_SYNC_DELAY_MS);',
    '    return false;',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  async function flush({ keepalive = false } = {}) {', '  function reloadForRemoteChange() {', flushReplacement, 'revision-aware flush');

  const captureReplacement = [
    '  function captureLocalChanges({ schedule = true, delay = SYNC_DELAY_MS } = {}) {',
    '    const current = readState();',
    '    if (!lastState) {',
    '      lastState = current;',
    '      return false;',
    '    }',
    '    if (stableState(lastState) === stableState(current)) return false;',
    '    recordLocalChanges(lastState, current);',
    '    lastState = current;',
    '    localRevision += 1;',
    '    if (syncPromise) resyncAfterFlight = true;',
    '    if (schedule) scheduleSync(delay);',
    '    return true;',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function captureLocalChanges({ schedule = true, delay = SYNC_DELAY_MS } = {}) {', '  function stablePrescriptions(state) {', captureReplacement, 'local revision capture');

  const pollReplacement = [
    '  function pollLegacyPrescriptions() {',
    "    if (document.visibilityState === 'hidden') return;",
    '    const prescriptions = parseArray(PRESCRIPTIONS_KEY);',
    '    if (!lastState) {',
    '      lastState = { ...readState(), prescriptions };',
    '      return;',
    '    }',
    '    if (stablePrescriptions(lastState) === stablePrescriptions({ prescriptions })) return;',
    '    captureLocalChanges();',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function pollLegacyPrescriptions() {', '  function onPersonalLibraryMutation() {', pollReplacement, 'prescription-only compatibility poll');

  const pollHelpers = [
    '  function startLegacyPrescriptionPoll() {',
    "    if (legacyPrescriptionPollTimer || document.visibilityState === 'hidden') return;",
    '    legacyPrescriptionPollTimer = window.setInterval(pollLegacyPrescriptions, LEGACY_PRESCRIPTION_POLL_MS);',
    '  }',
    '',
    '  function stopLegacyPrescriptionPoll() {',
    '    if (!legacyPrescriptionPollTimer) return;',
    '    clearInterval(legacyPrescriptionPollTimer);',
    '    legacyPrescriptionPollTimer = 0;',
    '  }',
    '',
  ].join('\n');
  source = source.replace('  window.fetch = async (...args) => {', `${pollHelpers}  window.fetch = async (...args) => {`);

  source = source.replace(
    '    syncNow:() => { captureLocalChanges({ schedule:false }); return flush(); },\n    state:readState,',
    [
      '    syncNow:() => {',
      '      captureLocalChanges({ schedule:false });',
      '      const targetRevision = localRevision;',
      '      return flushThroughRevision(targetRevision);',
      '    },',
      '    state:readState,',
    ].join('\n'),
  );
  source = source.replace(
    '    recoveryVersion:RECOVERY_VERSION,',
    [
      '    recoveryVersion:RECOVERY_VERSION,',
      '    longSessionVersion:LONG_SESSION_VERSION,',
      '    diagnostics:() => ({',
      '      localRevision,',
      '      syncedRevision,',
      '      dirty,',
      '      syncInFlight:Boolean(syncPromise),',
      '      retryUntil,',
      '      legacyPrescriptionPollActive:Boolean(legacyPrescriptionPollTimer),',
      '    }),',
    ].join('\n'),
  );

  const visibilityReplacement = [
    "  document.addEventListener('visibilitychange', () => {",
    "    if (document.visibilityState === 'hidden') {",
    '      stopLegacyPrescriptionPoll();',
    '      captureLocalChanges({ schedule:false });',
    '      if (dirty) void flush({ keepalive:true });',
    '    } else {',
    '      startLegacyPrescriptionPoll();',
    '      if (dirty && Date.now() >= retryUntil) scheduleSync(EVENT_SYNC_DELAY_MS);',
    '    }',
    '  });',
    '',
  ].join('\n');
  source = replaceSection(source, "  document.addEventListener('visibilitychange', () => {", "  ['medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved']", visibilityReplacement, 'visibility-aware poll lifecycle');

  source = source.replace(
    '  legacyPrescriptionPollTimer = window.setInterval(pollLegacyPrescriptions, LEGACY_PRESCRIPTION_POLL_MS);\n  void initialize();',
    '  startLegacyPrescriptionPoll();\n  void initialize();',
  );

  source = source.replace(/\[429, 503\]/g, '[408, 429, 503]');
  write('user-library-client.js', source);
}

function patchPersonalization() {
  let source = read('registry-user-personalization.js');
  if (source.includes(`const LONG_SESSION_VERSION = '${MARKER}';`)) return;
  if (!source.includes("const PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1';")) {
    throw new Error('Phase 10 requires Phase 8 personal UX first.');
  }

  source = source.replace(
    "  'use strict';\n\n  const VERSION = 'registry-user-personalization-v3.3.0';",
    [
      "  'use strict';",
      '',
      `  const LONG_SESSION_VERSION = '${MARKER}';`,
      "  const PERSONALIZATION_INSTANCE_KEY = '__medindexRegistryPersonalizationLongSession';",
      '  if (window[PERSONALIZATION_INSTANCE_KEY]) return;',
      '  window[PERSONALIZATION_INSTANCE_KEY] = { version:LONG_SESSION_VERSION, startedAt:Date.now() };',
      '',
      "  const VERSION = 'registry-user-personalization-v3.3.0';",
    ].join('\n'),
  );

  source = source.replace(
    '  let favorites = loadFavorites();\n  let notes = loadNotes();',
    '  let favoritesStorageRaw = null;\n  let notesStorageRaw = null;\n  let favorites = loadFavorites();\n  let notes = loadNotes();',
  );

  const favoritesReplacement = [
    "  function readLocalRaw(key, fallback) {",
    '    try { return localStorage.getItem(key) || fallback; }',
    '    catch { return fallback; }',
    '  }',
    '',
    '  function loadFavorites() {',
    "    const raw = readLocalRaw(FAVORITES_KEY, '[]');",
    '    if (raw === favoritesStorageRaw && favorites instanceof Set) return favorites;',
    '    favoritesStorageRaw = raw;',
    '    try {',
    '      const value = JSON.parse(raw);',
    '      return new Set(Array.isArray(value) ? value.map(String).filter(Boolean) : []);',
    '    } catch { return new Set(); }',
    '  }',
    '',
    '  function saveFavorites() {',
    '    const raw = JSON.stringify([...favorites]);',
    '    try {',
    '      localStorage.setItem(FAVORITES_KEY, raw);',
    '      favoritesStorageRaw = raw;',
    '      return true;',
    '    } catch { return false; }',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function loadFavorites() {', '  function loadNotes() {', favoritesReplacement, 'cached favorites storage');

  const notesReplacement = [
    '  function loadNotes() {',
    "    const rawStorage = readLocalRaw(NOTES_KEY, '{}');",
    "    if (rawStorage === notesStorageRaw && notes && typeof notes === 'object') return notes;",
    '    notesStorageRaw = rawStorage;',
    '    try {',
    '      const value = JSON.parse(rawStorage);',
    "      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};",
    '      const output = {};',
    '      Object.entries(value).forEach(([key, entry]) => {',
    '        const safeKey = clean(key).slice(0, 300);',
    '        if (!safeKey) return;',
    "        const raw = typeof entry === 'string' ? { text:entry, updatedAt:'' } : entry;",
    "        if (!raw || typeof raw !== 'object') return;",
    "        const text = String(raw.text ?? '').slice(0, NOTE_MAX);",
    '        if (!text.trim()) return;',
    '        output[safeKey] = { text, updatedAt:clean(raw.updatedAt) };',
    '      });',
    '      return output;',
    '    } catch { return {}; }',
    '  }',
    '',
    '  function saveNotes() {',
    '    const raw = JSON.stringify(notes);',
    '    try {',
    '      localStorage.setItem(NOTES_KEY, raw);',
    '      notesStorageRaw = raw;',
    '      return true;',
    '    } catch { return false; }',
    '  }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function loadNotes() {', '  function runtime() {', notesReplacement, 'cached notes storage');

  const profileReplacement = [
    '  const rowProfileCache = new WeakMap();',
    '  function rowProfile(row) {',
    '    if (!(row instanceof HTMLElement)) return { favoriteKey:\'\', favoriteCandidates:new Set(), noteKey:\'\', name:\'\', code:\'\' };',
    '    const cached = rowProfileCache.get(row);',
    '    if (cached) return cached;',
    '    const nr = registryNumber(row);',
    '    const name = drugName(row);',
    '    const code = atc(row);',
    '    const key = drugKey(row);',
    '    const favoriteKey = key || nr || (name && code ? `${name}|${code}` : name);',
    '    const candidates = new Set();',
    '    const add = value => { const item = clean(value); if (item) candidates.add(item); };',
    '    add(favoriteKey); add(key); add(row?.dataset?.registryNumber); add(row?.querySelector?.(\'.drug-select\')?.dataset?.registryNumber); add(nr); add(name);',
    '    if (nr && name) add(`${nr}|${name}`);',
    '    if (name && code) add(`${name}|${code}`);',
    '    const noteKeyValue = nr ? `registry:${nr}` : key ? `drug:${key}`.slice(0, 300) : `fallback:${name}|${code}`.slice(0, 300);',
    '    const profile = { nr, name, code, key, favoriteKey, favoriteCandidates:candidates, noteKey:noteKeyValue };',
    '    rowProfileCache.set(row, profile);',
    '    return profile;',
    '  }',
    '',
    '  function primaryFavoriteKey(row) { return rowProfile(row).favoriteKey; }',
    '  function favoriteCandidates(row) { return rowProfile(row).favoriteCandidates; }',
    '  function isFavoriteRow(row) {',
    '    for (const candidate of rowProfile(row).favoriteCandidates) if (favorites.has(candidate)) return true;',
    '    return false;',
    '  }',
    '  function noteKey(row) { return rowProfile(row).noteKey; }',
    '',
  ].join('\n');
  source = replaceSection(source, '  function primaryFavoriteKey(row) {', '  function mobileDrugKey(data) {', profileReplacement, 'weak row identity cache');

  source = source.replace(
    '    const favoriteKey = primaryFavoriteKey(row);\n    const favorite = favoriteButton(row);',
    '    const profile = rowProfile(row);\n    const favoriteKey = profile.favoriteKey;\n    const favorite = favoriteButton(row);',
  );
  source = source.replace(
    "      const active = isFavoriteRow(row);\n      const name = drugName(row) || 'barin';",
    "      const active = [...profile.favoriteCandidates].some(candidate => favorites.has(candidate));\n      const name = profile.name || 'barin';",
  );
  source = source.replace(
    '    const key = noteKey(row);\n    const note = noteButton(row);',
    '    const key = profile.noteKey;\n    const note = noteButton(row);',
  );
  source = source.replace(
    "      const active = hasNoteKey(key);\n      const name = drugName(row) || 'barin';",
    "      const active = hasNoteKey(key);\n      const name = profile.name || 'barin';",
  );

  const syncedEventReplacement = [
    "    window.addEventListener('medindex:library-synced', event => {",
    '      libraryReady = true;',
    '      const synced = Number(event.detail?.syncedRevision);',
    '      const local = Number(event.detail?.localRevision);',
    '      const settled = !Number.isFinite(synced) || !Number.isFinite(local) || synced >= local;',
    "      librarySyncState = settled ? 'synced' : 'saving';",
    '      libraryRetryAt = 0;',
    '      if (settled) pendingSync.clear();',
    '      schedule(1);',
    '    });',
    '',
  ].join('\n');
  source = replaceSection(source, "    window.addEventListener('medindex:library-synced', () => {", "    window.addEventListener('medindex:library-pending'", syncedEventReplacement, 'revision-aware synced UI');

  source = source.replace(
    '    phase8UxVersion:PHASE8_UX_VERSION,\n    editNoteForData,',
    [
      '    phase8UxVersion:PHASE8_UX_VERSION,',
      '    longSessionVersion:LONG_SESSION_VERSION,',
      '    diagnostics:() => ({',
      '      pendingSync:pendingSync.size,',
      '      favoriteInFlight:favoriteInFlight.size,',
      '      noteInFlight:noteInFlight.size,',
      '      libraryReady,',
      '      librarySyncState,',
      '    }),',
      '    editNoteForData,',
    ].join('\n'),
  );

  write('registry-user-personalization.js', source);
}

function patchIndex() {
  let source = read('index.html');
  source = source.replace(/registry-user-personalization\.js\?v=[^"']+/g, match => match.includes('&ls=') ? match : `${match}&ls=${ASSET_VERSION}`);
  source = source.replace(/user-library-client\.js\?v=[^"']+/g, match => match.includes('&ls=') ? match : `${match}&ls=${ASSET_VERSION}`);
  write('index.html', source);
}

function audit() {
  const ui = read('registry-user-personalization.js');
  const client = read('user-library-client.js');
  const html = read('index.html');

  if (!ui.includes(`const LONG_SESSION_VERSION = '${MARKER}';`) || !client.includes(`const LONG_SESSION_VERSION = '${MARKER}';`)) throw new Error('Phase 10 long-session markers missing.');
  if (!ui.includes('PERSONALIZATION_INSTANCE_KEY') || !client.includes('LIBRARY_INSTANCE_KEY')) throw new Error('Phase 10 singleton guards missing.');
  if (!client.includes('API_TIMEOUT_MS = 15_000') || !client.includes("code:'LIBRARY_SYNC_TIMEOUT'")) throw new Error('Phase 10 bounded library request timeout missing.');
  if (!client.includes('let localRevision = 0;') || !client.includes('let syncedRevision = 0;') || !client.includes('flushThroughRevision(targetRevision)')) throw new Error('Phase 10 revision-aware sync missing.');
  if (!client.includes('syncedRevision, localRevision') || !ui.includes('synced >= local')) throw new Error('Phase 10 settled-sync UI contract missing.');
  if (!client.includes("if (document.visibilityState === 'hidden') return;") || !client.includes('startLegacyPrescriptionPoll()') || !client.includes('stopLegacyPrescriptionPoll()')) throw new Error('Phase 10 hidden-tab polling control missing.');
  if (!client.includes('const prescriptions = parseArray(PRESCRIPTIONS_KEY);')) throw new Error('Phase 10 prescription-only legacy poll missing.');
  if (!ui.includes('favoritesStorageRaw') || !ui.includes('notesStorageRaw')) throw new Error('Phase 10 localStorage parse cache missing.');
  if (!ui.includes('const rowProfileCache = new WeakMap();')) throw new Error('Phase 10 weak row identity cache missing.');
  if (!html.includes(`&ls=${ASSET_VERSION}`)) throw new Error('Phase 10 cache-buster missing.');

  console.log('Phase 10 long-session hardening passed: singleton listeners, bounded sync timeout/retry, revision-safe rapid mutations, hidden-tab poll suspension and weak/cache-backed row personalization are active.');
}

patchUserLibraryClient();
patchPersonalization();
patchIndex();
audit();
