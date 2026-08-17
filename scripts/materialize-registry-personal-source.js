'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 12 materializer could not find ${label}.`);
  return source.replace(before, after);
}

function materializeUserLibraryRecovery() {
  let source = read('user-library-client.js');
  if (!source.includes("EVENT_SYNC_VERSION = 'user-library-event-sync-v1'")) {
    throw new Error('Phase 12 requires the canonical Phase 6 event-driven client first.');
  }

  if (!source.includes('  let retryUntil = 0;')) {
    source = replaceOnce(
      source,
      '  let dirty = false;\n  let online = navigator.onLine;',
      '  let dirty = false;\n  let online = navigator.onLine;\n  let retryUntil = 0;',
      'library retry state',
    );
  }

  if (!source.includes('retryAfterMs:Number.isFinite(retryHeader)')) {
    source = replaceOnce(
      source,
      "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) throw Object.assign(new Error(payload.error || `Library API ${response.status}`), { status:response.status });",
      "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      const retryHeader = Number(response.headers.get('retry-after') || payload.retryAfter || 0);\n      throw Object.assign(new Error(payload.error || `Library API ${response.status}`), {\n        status:response.status,\n        retryAfterMs:Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 0,\n      });\n    }",
      'Retry-After parsing',
    );
  }

  if (!source.includes('Date.now() < retryUntil')) {
    source = replaceOnce(
      source,
      "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine) return false;",
      "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine || Date.now() < retryUntil) return false;",
      'retry gate',
    );
  }

  if (!source.includes('retryUntil = Date.now() + Math.max(30_000')) {
    source = replaceOnce(
      source,
      "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine });\n        return false;",
      "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n        }\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0 });\n        return false;",
      'failed-sync backoff',
    );
  }

  if (!source.includes("pending:true, retryAt:retryUntil || 0")) {
    source = replaceOnce(
      source,
      "    } catch {\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true });",
      "    } catch (error) {\n      if ([429, 503].includes(Number(error?.status))) retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      'initialize backoff',
    );
  }

  if (!source.includes('retryUntil = 0;\n    scheduleSync(100);')) {
    source = replaceOnce(
      source,
      "  window.addEventListener('online', () => {\n    online = true;\n    scheduleSync(100);\n  });",
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    scheduleSync(100);\n  });",
      'online retry reset',
    );
  }

  if (!source.includes("RECOVERY_VERSION = 'user-library-recovery-v1'")) {
    source = replaceOnce(
      source,
      "  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';",
      "  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';\n  const RECOVERY_VERSION = 'user-library-recovery-v1';",
      'recovery marker',
    );

    source = replaceOnce(
      source,
      '  let retryUntil = 0;',
      '  let retryUntil = 0;\n  let retryTimer = 0;',
      'retry timer',
    );

    source = replaceOnce(
      source,
      "      const localItem = prescriptions.get(id);\n      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      if (!localItem || remoteUpdated > localUpdated) {\n        prescriptions.set(id, row.payload);\n        meta.prescriptions[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();\n      }\n      delete meta.deletedPrescriptions[id];",
      "      const localItem = prescriptions.get(id);\n      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      const localDeleted = time(meta.deletedPrescriptions[id]);\n      if (localDeleted && localDeleted >= remoteUpdated) return;\n      if (!localItem || remoteUpdated > localUpdated) {\n        prescriptions.set(id, row.payload);\n        meta.prescriptions[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();\n      }\n      delete meta.deletedPrescriptions[id];",
      'prescription tombstone guard',
    );

    source = replaceOnce(
      source,
      "      const id = favoriteId(type, key);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      if (type === 'drug') {",
      "      const id = favoriteId(type, key);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      const localDeleted = time(meta.deletedFavorites[id]);\n      if (localDeleted && localDeleted >= remoteUpdated) return;\n      if (type === 'drug') {",
      'favorite/note tombstone guard',
    );

    source = replaceOnce(
      source,
      '  function scheduleSync(delay = SYNC_DELAY_MS) {',
      "  function scheduleRecoveryRetry(at) {\n    clearTimeout(retryTimer);\n    retryTimer = 0;\n    const target = Number(at || 0);\n    if (!target) return;\n    const delay = Math.max(0, Math.min(2_147_483_000, target - Date.now() + 25));\n    retryTimer = window.setTimeout(() => {\n      retryTimer = 0;\n      retryUntil = 0;\n      if (online && navigator.onLine) scheduleSync(EVENT_SYNC_DELAY_MS);\n    }, delay);\n  }\n\n  function scheduleSync(delay = SYNC_DELAY_MS) {",
      'automatic recovery scheduler',
    );

    source = replaceOnce(
      source,
      "        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        writeMeta(meta);\n        success = true;\n        if (!resyncAfterFlight) dirty = false;\n        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt });",
      "        const reconciled = mergeRemote(payload);\n        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        writeMeta(meta);\n        success = true;\n        if (!resyncAfterFlight) dirty = false;\n        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt, reconciled });\n        if (reconciled) dispatch('medindex:library-reconciled', { generatedAt:meta.lastSyncedAt });",
      'PUT reconciliation',
    );

    source = replaceOnce(
      source,
      "        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n        }\n        dirty = true;",
      "        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n          scheduleRecoveryRetry(retryUntil);\n        }\n        dirty = true;",
      'failed-sync retry scheduling',
    );

    source = replaceOnce(
      source,
      "      if ([429, 503].includes(Number(error?.status))) retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      "      if ([429, 503].includes(Number(error?.status))) {\n        retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n        scheduleRecoveryRetry(retryUntil);\n      }\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      'initialize retry scheduling',
    );

    source = replaceOnce(
      source,
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    scheduleSync(100);\n  });",
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    clearTimeout(retryTimer);\n    retryTimer = 0;\n    scheduleSync(100);\n  });",
      'online recovery timer reset',
    );

    source = replaceOnce(
      source,
      "  document.addEventListener('visibilitychange', () => {\n    if (document.visibilityState === 'hidden') {\n      captureLocalChanges({ schedule:false });\n      if (dirty) void flush({ keepalive:true });\n    }\n  });",
      "  document.addEventListener('visibilitychange', () => {\n    if (document.visibilityState === 'hidden') {\n      captureLocalChanges({ schedule:false });\n      if (dirty) void flush({ keepalive:true });\n    } else if (dirty && Date.now() >= retryUntil) {\n      scheduleSync(EVENT_SYNC_DELAY_MS);\n    }\n  });",
      'visible-tab recovery',
    );

    source = replaceOnce(
      source,
      '    version:EVENT_SYNC_VERSION,',
      '    version:EVENT_SYNC_VERSION,\n    recoveryVersion:RECOVERY_VERSION,',
      'public recovery version',
    );
  }

  write('user-library-client.js', source);
}

function auditMaterializedSource() {
  const client = read('user-library-client.js');
  const ui = read('registry-user-personalization.js');
  const css = read('registry-user-personalization.css');
  if (!client.includes("RECOVERY_VERSION = 'user-library-recovery-v1'")) throw new Error('Phase 12 recovery marker missing.');
  if (!client.includes("LONG_SESSION_VERSION = 'registry-personal-long-session-v1'")) throw new Error('Phase 12 long-session client marker missing.');
  if (!client.includes('flushThroughRevision(targetRevision)')) throw new Error('Phase 12 revision-safe sync is not materialized.');
  if (!ui.includes("PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1'")) throw new Error('Phase 12 UX marker missing from canonical controller.');
  if (!ui.includes("LONG_SESSION_VERSION = 'registry-personal-long-session-v1'")) throw new Error('Phase 12 long-session UI marker missing.');
  if (!ui.includes('const rowProfileCache = new WeakMap();')) throw new Error('Phase 12 weak row cache is not materialized.');
  if (!css.includes('/* registry-personal-ux-phase8-v1 */')) throw new Error('Phase 12 UX CSS is not materialized.');
  console.log('Phase 12 canonical source materialization audit passed.');
}

materializeUserLibraryRecovery();
require('./patch-registry-phase8-personalization.js');
require('./patch-registry-phase16-personal-ux-v2.js');
require('./patch-registry-personal-long-session.js');
auditMaterializedSource();
