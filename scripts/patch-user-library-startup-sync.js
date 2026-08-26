'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'user-library-client.js');
const MARKER = 'user-library-startup-fingerprint-v1';

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Startup sync patch could not find ${label}.`);
  source = source.replace(before, after);
}

function validate(value) {
  const required = [
    MARKER,
    'SYNC_FINGERPRINT_VERSION = 1',
    'function syncFingerprint(',
    'function hasPersistentPending(',
    'function persistSyncedFingerprint(',
    'startupPutSkipped',
    'pendingBeforeMerge',
    'startupNoop:true',
    'persistSyncedFingerprint(readMeta(), snapshot.generatedAt || nowIso())',
    'meta.syncedFingerprint = syncFingerprint(readState(), meta)',
  ];
  for (const fragment of required) {
    if (!value.includes(fragment)) throw new Error(`Startup sync contract missing ${fragment}.`);
  }
}

if (!source.includes(MARKER)) {
  replaceOnce(
    "  const RELOAD_KEY = 'medindex_user_library_reload_v1';",
    "  const RELOAD_KEY = 'medindex_user_library_reload_v1';\n  // user-library-startup-fingerprint-v1: a confirmed per-account fingerprint lets\n  // ordinary startups stay read-only while still detecting offline/local edits.\n  const SYNC_FINGERPRINT_VERSION = 1;",
    'fingerprint version anchor',
  );

  replaceOnce(
    "  let syncedRevision = 0;\n  let resolveReady;",
    "  let syncedRevision = 0;\n  let startupPutSkipped = false;\n  let resolveReady;",
    'startup diagnostics state',
  );

  replaceOnce(
    "        lastSyncedAt:text(value.lastSyncedAt),\n        owner:text(value.owner),",
    "        lastSyncedAt:text(value.lastSyncedAt),\n        owner:text(value.owner),\n        fingerprintVersion:Number(value.fingerprintVersion || 0),\n        syncedFingerprint:text(value.syncedFingerprint),",
    'readMeta fingerprint fields',
  );

  replaceOnce(
    "    return { prescriptions:{}, favorites:{}, drugs:{}, deletedPrescriptions:{}, deletedFavorites:{}, deletedDrugs:{}, lastSyncedAt:'', owner:'' };",
    "    return { prescriptions:{}, favorites:{}, drugs:{}, deletedPrescriptions:{}, deletedFavorites:{}, deletedDrugs:{}, lastSyncedAt:'', owner:'', fingerprintVersion:0, syncedFingerprint:'' };",
    'emptyMeta fingerprint fields',
  );

  const fingerprintHelpers = `  function sortedRecordEntries(value) {
    return Object.entries(value && typeof value === 'object' ? value : {})
      .map(([key, stamp]) => [String(key), text(stamp)])
      .sort(([a], [b]) => a.localeCompare(b));
  }

  function fingerprintHash(value, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  function syncFingerprint(state = readState(), meta = readMeta()) {
    const basis = JSON.stringify({
      state:stableState(state),
      tombstones:{
        prescriptions:sortedRecordEntries(meta.deletedPrescriptions),
        favorites:sortedRecordEntries(meta.deletedFavorites),
        drugs:sortedRecordEntries(meta.deletedDrugs),
      },
    });
    const first = fingerprintHash(basis, 2166136261);
    const second = fingerprintHash(basis, 2246822519);
    return \`v\${SYNC_FINGERPRINT_VERSION}:\${first}:\${second}:\${basis.length}\`;
  }

  function hasPersistentPending(state = readState(), meta = readMeta()) {
    if (Number(meta.fingerprintVersion || 0) !== SYNC_FINGERPRINT_VERSION) return true;
    const confirmed = text(meta.syncedFingerprint);
    return !confirmed || confirmed !== syncFingerprint(state, meta);
  }

  function persistSyncedFingerprint(meta = readMeta(), generatedAt = '') {
    meta.lastSyncedAt = text(generatedAt) || meta.lastSyncedAt;
    meta.fingerprintVersion = SYNC_FINGERPRINT_VERSION;
    meta.syncedFingerprint = syncFingerprint(readState(), meta);
    writeMeta(meta);
    return meta.syncedFingerprint;
  }

`;
  replaceOnce(
    '  function protocolId(item) {',
    fingerprintHelpers + '  function protocolId(item) {',
    'fingerprint helper insertion',
  );

  replaceOnce(
    "        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        writeMeta(meta);",
    "        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        meta.fingerprintVersion = SYNC_FINGERPRINT_VERSION;\n        meta.syncedFingerprint = syncFingerprint(readState(), meta);\n        writeMeta(meta);",
    'successful sync fingerprint persistence',
  );

  const initializeStart = source.indexOf('  async function initialize() {');
  const initializeEnd = source.indexOf('  function captureLocalChanges(', initializeStart);
  if (initializeStart < 0 || initializeEnd < 0 || initializeEnd <= initializeStart) {
    throw new Error('Startup sync patch could not find initialize() boundaries.');
  }

  const initialize = `  async function initialize() {
    const local = readState();
    const meta = ensureMetaForState(local, readMeta());
    writeMeta(meta);
    lastState = local;
    if (!navigator.onLine) {
      dispatch('medindex:library-ready', { offline:true, local:true });
      resolveReady?.({ offline:true, local:true });
      return;
    }
    try {
      const snapshot = await api(API_URL);
      // Resolve account ownership before trusting any persistent fingerprint.
      // A different account always discards the previous device state first.
      const ownerChanged = adoptOwner(snapshot.user);
      if (ownerChanged) lastState = readState();

      // Evaluate pending work immediately before the remote merge. This catches
      // an offline/local edit made while the startup GET itself was in flight.
      const beforeMergeState = readState();
      const beforeMergeMeta = ensureMetaForState(beforeMergeState, readMeta());
      writeMeta(beforeMergeMeta);
      const pendingBeforeMerge = !ownerChanged && hasPersistentPending(beforeMergeState, beforeMergeMeta);

      const changed = mergeRemote(snapshot);
      if (pendingBeforeMerge) {
        // Missing/old fingerprint (including the first release after migration)
        // is intentionally conservative: one confirmed PUT establishes the new
        // baseline and preserves any offline edits/tombstones.
        await flush();
      } else {
        // GET is authoritative for remote-only changes. If the local state was
        // already confirmed before this GET, writing the identical snapshot back
        // only burns latency and a serverless invocation.
        persistSyncedFingerprint(readMeta(), snapshot.generatedAt || nowIso());
        syncedRevision = Math.max(syncedRevision, localRevision);
        dirty = false;
        startupPutSkipped = true;
        dispatch('medindex:library-synced', {
          generatedAt:snapshot.generatedAt || readMeta().lastSyncedAt,
          reconciled:changed,
          syncedRevision,
          localRevision,
          startupNoop:true,
        });
      }
      dispatch('medindex:library-ready', { offline:false, local:false, user:snapshot.user });
      resolveReady?.({ offline:false, local:false, user:snapshot.user });
      if (changed) window.setTimeout(reloadForRemoteChange, 40);
    } catch (error) {
      if ([408, 429, 503].includes(Number(error?.status))) {
        retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));
        scheduleRecoveryRetry(retryUntil);
      }
      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });
      resolveReady?.({ offline:false, local:true, pending:true });
    }
  }
`;
  source = source.slice(0, initializeStart) + initialize + source.slice(initializeEnd);

  replaceOnce(
    "      legacyPrescriptionPollActive:Boolean(legacyPrescriptionPollTimer),\n    }),",
    "      legacyPrescriptionPollActive:Boolean(legacyPrescriptionPollTimer),\n      startupPutSkipped,\n      fingerprintVersion:SYNC_FINGERPRINT_VERSION,\n      persistentSyncCurrent:!hasPersistentPending(readState(), readMeta()),\n    }),",
    'startup sync diagnostics',
  );
}

validate(source);
fs.writeFileSync(TARGET, source, 'utf8');
console.log('User library startup sync optimized: confirmed per-account fingerprints skip redundant startup PUTs while offline edits and tombstones remain write-safe.');
