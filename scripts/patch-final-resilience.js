'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function mustReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Final resilience patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchDriveSync() {
  let source = read('api/drive-sync.js');
  source = mustReplace(
    source,
    "const { neonRequest } = require('../lib/neon-data-api.js');",
    "const { neonRequest } = require('../lib/neon-data-api.js');\nconst NeonResilience = require('../lib/neon-resilience.js');",
    'drive-sync Neon import',
  );
  source = mustReplace(
    source,
    "  } catch (error) {\n    console.error('Drive sync authorization failed:', error);\n    return res.status(500).json({ ok:false, error:'Autorizimi i sinkronizimit dështoi.' });\n  }",
    "  } catch (error) {\n    if (NeonResilience.isUnavailable(error)) {\n      const retryAfter = NeonResilience.applyRetryHeaders(res, error);\n      NeonResilience.safeLog('Drive sync paused', error, 15 * 60 * 1000);\n      return res.status(503).json({\n        ok:false,\n        code:'NEON_TEMPORARILY_UNAVAILABLE',\n        retryAfter,\n        error:'Sinkronizimi është pauzuar përkohësisht; të dhënat në Google Sheet mbeten të paprekura.'\n      });\n    }\n    console.error('Drive sync authorization failed:', error);\n    return res.status(500).json({ ok:false, error:'Autorizimi i sinkronizimit dështoi.' });\n  }",
    'drive-sync degraded catch',
  );
  write('api/drive-sync.js', source);
}

function patchUserLibraryServer() {
  let source = read('lib/user-library.js');
  source = mustReplace(
    source,
    "const { neonRequest } = require('./neon-data-api.js');",
    "const { neonRequest } = require('./neon-data-api.js');\nconst NeonResilience = require('./neon-resilience.js');",
    'user-library resilience import',
  );
  source = mustReplace(
    source,
    "  } catch (error) {\n    console.error('User library error:', error?.code || error?.message || error);\n    const status = Number(error?.status) || (/OIDC|Data API|çelësi privat/i.test(String(error?.message || '')) ? 503 : 500);\n    return res.status(status).json({\n      code:error?.code || '',\n      error:status >= 500 ? 'Biblioteka personale nuk u sinkronizua. Të dhënat lokale mbeten të paprekura.' : error.message,\n    });\n  }",
    "  } catch (error) {\n    const unavailable = NeonResilience.isUnavailable(error);\n    if (unavailable) NeonResilience.applyRetryHeaders(res, error);\n    NeonResilience.safeLog('User library sync', error);\n    const status = unavailable ? 503 : (Number(error?.status) || (/OIDC|Data API|çelësi privat/i.test(String(error?.message || '')) ? 503 : 500));\n    return res.status(status).json({\n      code:unavailable ? 'NEON_TEMPORARILY_UNAVAILABLE' : (error?.code || ''),\n      retryAfter:unavailable ? NeonResilience.retryAfterSeconds(error) : undefined,\n      error:status >= 500 ? 'Biblioteka personale nuk u sinkronizua. Të dhënat lokale mbeten të paprekura.' : error.message,\n    });\n  }",
    'user-library degraded catch',
  );
  write('lib/user-library.js', source);
}

function patchDoseHandler(file, label, errorLabel) {
  let source = read(file);
  source = mustReplace(
    source,
    "const { neonRequest } = require('../lib/neon-data-api.js');",
    "const { neonRequest } = require('../lib/neon-data-api.js');\nconst NeonResilience = require('../lib/neon-resilience.js');",
    `${label} resilience import`,
  );
  const consoleLine = `    console.error('${errorLabel}:', error);`;
  const replacement = `    NeonResilience.safeLog('${errorLabel}', error);\n    const degraded = NeonResilience.isUnavailable(error);\n    if (degraded) NeonResilience.applyRetryHeaders(res, error);`;
  source = mustReplace(source, consoleLine, replacement, `${label} degraded log`);
  source = source.replace('return res.status(500).json({', "return res.status(degraded ? 503 : 500).json({");
  write(file, source);
}

function patchDosageFallback() {
  let source = read('lib/dosage-handler.js');
  source = mustReplace(
    source,
    "const NeonClinical = require('../lib/neon-clinical-reader.js');",
    "const NeonClinical = require('../lib/neon-clinical-reader.js');\nconst NeonResilience = require('./neon-resilience.js');",
    'dosage fallback resilience import',
  );
  source = mustReplace(
    source,
    "    console.error('Neon dosage read failed; using Sheets fallback:', error);",
    "    NeonResilience.safeLog('Neon dosage read fallback', error, 15 * 60 * 1000);",
    'dosage fallback raw error log',
  );
  source = mustReplace(
    source,
    "        console.error('Dosage refresh failed; serving stale cache:', error);",
    "        NeonResilience.safeLog('Dosage refresh stale-cache fallback', error, 15 * 60 * 1000);",
    'dosage stale-cache raw error log',
  );
  source = mustReplace(
    source,
    "  } catch (error) {\n    console.error('Dosage data error:', error);\n    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');\n    return res.status(500).json(publicLoadError());\n  }",
    "  } catch (error) {\n    const degraded = NeonResilience.isUnavailable(error);\n    if (degraded) NeonResilience.applyRetryHeaders(res, error);\n    NeonResilience.safeLog('Dosage data', error, 15 * 60 * 1000);\n    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');\n    return res.status(degraded ? 503 : 500).json(publicLoadError());\n  }",
    'dosage terminal degraded catch',
  );
  write('lib/dosage-handler.js', source);
}

function patchClinicalNeonEndpoint(file, errorLabel, publicMessage) {
  let source = read(file);
  source = mustReplace(
    source,
    "const { neonRequest } = require('./neon-data-api.js');",
    "const { neonRequest } = require('./neon-data-api.js');\nconst NeonResilience = require('./neon-resilience.js');",
    `${errorLabel} resilience import`,
  );
  source = mustReplace(
    source,
    `  } catch (error) {\n    console.error('${errorLabel}:', error);\n    return res.status(error.status || 500).json({ ok:false, error:clean(error.message || error).slice(0, 700) });\n  }`,
    `  } catch (error) {\n    const degraded = NeonResilience.isUnavailable(error);\n    if (degraded) NeonResilience.applyRetryHeaders(res, error);\n    NeonResilience.safeLog('${errorLabel}', error, 15 * 60 * 1000);\n    const status = degraded ? 503 : (error.status || 500);\n    return res.status(status).json({\n      ok:false,\n      code:degraded ? 'NEON_TEMPORARILY_UNAVAILABLE' : undefined,\n      retryAfter:degraded ? NeonResilience.retryAfterSeconds(error) : undefined,\n      error:degraded ? '${publicMessage}' : clean(error.message || error).slice(0, 700),\n    });\n  }`,
    `${errorLabel} degraded catch`,
  );
  write(file, source);
}

function patchUserLibraryClient() {
  let source = read('user-library-client.js');
  const phase6 = source.includes("EVENT_SYNC_VERSION = 'user-library-event-sync-v1'");

  if (!phase6) {
    source = mustReplace(source, '  const POLL_MS = 1200;', '  const POLL_MS = 5000;', 'library polling interval');
  }

  if (!source.includes('  let retryUntil = 0;')) {
    source = mustReplace(
      source,
      '  let dirty = false;\n  let online = navigator.onLine;',
      '  let dirty = false;\n  let online = navigator.onLine;\n  let retryUntil = 0;',
      'library retry state',
    );
  }

  if (!source.includes('retryAfterMs:Number.isFinite(retryHeader)')) {
    source = mustReplace(
      source,
      "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) throw Object.assign(new Error(payload.error || `Library API ${response.status}`), { status:response.status });",
      "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      const retryHeader = Number(response.headers.get('retry-after') || payload.retryAfter || 0);\n      throw Object.assign(new Error(payload.error || `Library API ${response.status}`), {\n        status:response.status,\n        retryAfterMs:Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 0,\n      });\n    }",
      'library Retry-After parsing',
    );
  }

  if (!source.includes('Date.now() < retryUntil')) {
    source = mustReplace(
      source,
      "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine) return false;",
      "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine || Date.now() < retryUntil) return false;",
      'library backoff gate',
    );
  }

  if (!source.includes('retryUntil = Date.now() + Math.max(30_000')) {
    source = mustReplace(
      source,
      "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine });\n        return false;",
      "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n        }\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0 });\n        return false;",
      'library failed sync backoff',
    );
  }

  if (!source.includes("pending:true, retryAt:retryUntil || 0")) {
    source = mustReplace(
      source,
      "    } catch {\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true });",
      "    } catch (error) {\n      if ([429, 503].includes(Number(error?.status))) retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      'library initialize backoff',
    );
  }

  if (!phase6) {
    source = mustReplace(
      source,
      "  function poll() {\n    const current = readState();",
      "  function poll() {\n    if (document.visibilityState === 'hidden') return;\n    const current = readState();",
      'library hidden-tab pause',
    );
    source = mustReplace(
      source,
      "  window.addEventListener('online', () => {\n    online = true;\n    scheduleSync(100);\n  });",
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    scheduleSync(100);\n  });\n  window.addEventListener('medindex:favorites-changed', () => { poll(); scheduleSync(80); });\n  window.addEventListener('medindex:personal-note-saved', () => { poll(); scheduleSync(80); });",
      'library event-driven sync',
    );
  } else if (!source.includes('retryUntil = 0;\n    scheduleSync(100);')) {
    source = mustReplace(
      source,
      "  window.addEventListener('online', () => {\n    online = true;\n    scheduleSync(100);\n  });",
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    scheduleSync(100);\n  });",
      'Phase 6 online backoff reset',
    );
  }

  if (phase6 && !source.includes("RECOVERY_VERSION = 'user-library-recovery-v1'")) {
    source = mustReplace(
      source,
      "  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';",
      "  const EVENT_SYNC_VERSION = 'user-library-event-sync-v1';\n  const RECOVERY_VERSION = 'user-library-recovery-v1';",
      'Phase 7 recovery version marker',
    );

    source = mustReplace(
      source,
      '  let retryUntil = 0;',
      '  let retryUntil = 0;\n  let retryTimer = 0;',
      'Phase 7 retry timer state',
    );

    source = mustReplace(
      source,
      "      const localItem = prescriptions.get(id);\n      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      if (!localItem || remoteUpdated > localUpdated) {\n        prescriptions.set(id, row.payload);\n        meta.prescriptions[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();\n      }\n      delete meta.deletedPrescriptions[id];",
      "      const localItem = prescriptions.get(id);\n      const localUpdated = time(meta.prescriptions[id] || localItem?.updatedAt || localItem?.createdAt);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      const localDeleted = time(meta.deletedPrescriptions[id]);\n      if (localDeleted && localDeleted >= remoteUpdated) return;\n      if (!localItem || remoteUpdated > localUpdated) {\n        prescriptions.set(id, row.payload);\n        meta.prescriptions[id] = row.clientUpdatedAt || row.serverUpdatedAt || nowIso();\n      }\n      delete meta.deletedPrescriptions[id];",
      'Phase 7 prescription tombstone conflict guard',
    );

    source = mustReplace(
      source,
      "      const id = favoriteId(type, key);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      if (type === 'drug') {",
      "      const id = favoriteId(type, key);\n      const remoteUpdated = time(row.clientUpdatedAt || row.serverUpdatedAt);\n      const localDeleted = time(meta.deletedFavorites[id]);\n      if (localDeleted && localDeleted >= remoteUpdated) return;\n      if (type === 'drug') {",
      'Phase 7 favorite/note tombstone conflict guard',
    );

    source = mustReplace(
      source,
      "  function scheduleSync(delay = SYNC_DELAY_MS) {",
      "  function scheduleRecoveryRetry(at) {\n    clearTimeout(retryTimer);\n    retryTimer = 0;\n    const target = Number(at || 0);\n    if (!target) return;\n    const delay = Math.max(0, Math.min(2_147_483_000, target - Date.now() + 25));\n    retryTimer = window.setTimeout(() => {\n      retryTimer = 0;\n      retryUntil = 0;\n      if (online && navigator.onLine) scheduleSync(EVENT_SYNC_DELAY_MS);\n    }, delay);\n  }\n\n  function scheduleSync(delay = SYNC_DELAY_MS) {",
      'Phase 7 automatic retry scheduler',
    );

    source = mustReplace(
      source,
      "        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        writeMeta(meta);\n        success = true;\n        if (!resyncAfterFlight) dirty = false;\n        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt });",
      "        const reconciled = mergeRemote(payload);\n        const meta = readMeta();\n        meta.lastSyncedAt = payload.generatedAt || nowIso();\n        writeMeta(meta);\n        success = true;\n        if (!resyncAfterFlight) dirty = false;\n        dispatch('medindex:library-synced', { generatedAt:meta.lastSyncedAt, reconciled });\n        if (reconciled) dispatch('medindex:library-reconciled', { generatedAt:meta.lastSyncedAt });",
      'Phase 7 PUT-response reconciliation',
    );

    source = mustReplace(
      source,
      "        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n        }\n        dirty = true;",
      "        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n          scheduleRecoveryRetry(retryUntil);\n        }\n        dirty = true;",
      'Phase 7 failed-sync retry scheduling',
    );

    source = mustReplace(
      source,
      "      if ([429, 503].includes(Number(error?.status))) retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      "      if ([429, 503].includes(Number(error?.status))) {\n        retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n        scheduleRecoveryRetry(retryUntil);\n      }\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
      'Phase 7 initialize retry scheduling',
    );

    source = mustReplace(
      source,
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    scheduleSync(100);\n  });",
      "  window.addEventListener('online', () => {\n    online = true;\n    retryUntil = 0;\n    clearTimeout(retryTimer);\n    retryTimer = 0;\n    scheduleSync(100);\n  });",
      'Phase 7 online recovery reset',
    );

    source = mustReplace(
      source,
      "  document.addEventListener('visibilitychange', () => {\n    if (document.visibilityState === 'hidden') {\n      captureLocalChanges({ schedule:false });\n      if (dirty) void flush({ keepalive:true });\n    }\n  });",
      "  document.addEventListener('visibilitychange', () => {\n    if (document.visibilityState === 'hidden') {\n      captureLocalChanges({ schedule:false });\n      if (dirty) void flush({ keepalive:true });\n    } else if (dirty && Date.now() >= retryUntil) {\n      scheduleSync(EVENT_SYNC_DELAY_MS);\n    }\n  });",
      'Phase 7 visible-tab recovery',
    );

    source = mustReplace(
      source,
      '    version:EVENT_SYNC_VERSION,',
      '    version:EVENT_SYNC_VERSION,\n    recoveryVersion:RECOVERY_VERSION,',
      'Phase 7 public recovery version',
    );
  }

  write('user-library-client.js', source);
}

function audit() {
  const drive = read('api/drive-sync.js');
  const library = read('lib/user-library.js');
  const client = read('user-library-client.js');
  const calc = read('lib/dose-calculator-handler.js');
  const safety = read('lib/dose-safety-handler.js');
  const dosage = read('lib/dosage-handler.js');
  const clinicalEditor = read('lib/clinical-editor.js');
  const population = read('lib/population-verification.js');
  const revision = read('lib/registry-revision.js');

  if (!drive.includes("code:'NEON_TEMPORARILY_UNAVAILABLE'") || !drive.includes("res.status(503)")) throw new Error('Drive sync degraded contract missing.');
  if (!library.includes("retryAfter:unavailable") || !library.includes('NeonResilience.safeLog')) throw new Error('User library degraded contract missing.');
  const eventDrivenLibrary = client.includes("EVENT_SYNC_VERSION = 'user-library-event-sync-v1'")
    && client.includes('LEGACY_PRESCRIPTION_POLL_MS = 5000')
    && client.includes("'medindex:favorites-changed', 'medindex:notes-changed', 'medindex:personal-note-saved'")
    && client.includes("window.addEventListener('storage', event =>");
  const legacyReducedPolling = client.includes('const POLL_MS = 5000;')
    && client.includes("medindex:favorites-changed")
    && client.includes("medindex:personal-note-saved");
  if ((!eventDrivenLibrary && !legacyReducedPolling) || !client.includes('retryUntil')) throw new Error('User library client backoff/event contract missing.');
  if (eventDrivenLibrary) {
    const phase7Recovery = client.includes("RECOVERY_VERSION = 'user-library-recovery-v1'")
      && client.includes('const localDeleted = time(meta.deletedPrescriptions[id]);')
      && client.includes('const localDeleted = time(meta.deletedFavorites[id]);')
      && client.includes('const reconciled = mergeRemote(payload);')
      && client.includes('function scheduleRecoveryRetry(at)')
      && client.includes('scheduleRecoveryRetry(retryUntil);')
      && client.includes("dispatch('medindex:library-reconciled'")
      && client.includes('recoveryVersion:RECOVERY_VERSION');
    if (!phase7Recovery) throw new Error('Phase 7 user-library conflict/recovery contract missing.');
  }
  if (!calc.includes('res.status(degraded ? 503 : 500)') || !safety.includes('res.status(degraded ? 503 : 500)')) throw new Error('Dose degraded response contract missing.');
  if (!dosage.includes("NeonResilience.safeLog('Neon dosage read fallback'") || dosage.includes("console.error('Neon dosage read failed; using Sheets fallback:'")) throw new Error('Dosage Sheets fallback still logs Neon quota as an error.');
  if (!clinicalEditor.includes("code:degraded ? 'NEON_TEMPORARILY_UNAVAILABLE'") || !clinicalEditor.includes('NeonResilience.applyRetryHeaders')) throw new Error('Clinical editor degraded contract missing.');
  if (!population.includes("code:degraded ? 'NEON_TEMPORARILY_UNAVAILABLE'") || !population.includes('NeonResilience.applyRetryHeaders')) throw new Error('Population verification degraded contract missing.');
  if (!revision.includes('NeonResilience.retryAfterSeconds(error)')) throw new Error('Registry revision outage backoff missing.');
  if (/POLL_MS = 1200/.test(client)) throw new Error('Aggressive 1.2s user-library polling returned.');
  console.log('Final production resilience audit passed: Neon outage backoff, controlled Sheets fallback, clinical 503 Retry-After, local-first library, event-driven personal sync and Phase 7 conflict-safe recovery are active.');
}

patchDriveSync();
patchUserLibraryServer();
patchDoseHandler('lib/dose-calculator-handler.js', 'dose calculator', 'Dose calculator catalog error');
patchDoseHandler('lib/dose-safety-handler.js', 'dose safety', 'Dose safety catalog error');
patchDosageFallback();
patchClinicalNeonEndpoint('lib/clinical-editor.js', 'Clinical editor error', 'Editori klinik është përkohësisht i padisponueshëm. Provo përsëri pas pak; asnjë ndryshim nuk është ruajtur.');
patchClinicalNeonEndpoint('lib/population-verification.js', 'Population verification error', 'Verifikimi i popullatës është përkohësisht i padisponueshëm. Provo përsëri pas pak.');
patchUserLibraryClient();
audit();