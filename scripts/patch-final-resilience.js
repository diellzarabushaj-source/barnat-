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

function patchUserLibraryClient() {
  let source = read('user-library-client.js');
  source = mustReplace(source, '  const POLL_MS = 1200;', '  const POLL_MS = 5000;', 'library polling interval');
  source = mustReplace(
    source,
    '  let dirty = false;\n  let online = navigator.onLine;',
    '  let dirty = false;\n  let online = navigator.onLine;\n  let retryUntil = 0;',
    'library retry state',
  );
  source = mustReplace(
    source,
    "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) throw Object.assign(new Error(payload.error || `Library API ${response.status}`), { status:response.status });",
    "    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      const retryHeader = Number(response.headers.get('retry-after') || payload.retryAfter || 0);\n      throw Object.assign(new Error(payload.error || `Library API ${response.status}`), {\n        status:response.status,\n        retryAfterMs:Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : 0,\n      });\n    }",
    'library Retry-After parsing',
  );
  source = mustReplace(
    source,
    "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine) return false;",
    "  async function flush({ keepalive = false } = {}) {\n    if (!online || !navigator.onLine || Date.now() < retryUntil) return false;",
    'library backoff gate',
  );
  source = mustReplace(
    source,
    "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine });\n        return false;",
    "      } catch (error) {\n        if (error.status === 401 || error.status === 403) return false;\n        if ([429, 503].includes(Number(error.status))) {\n          retryUntil = Date.now() + Math.max(30_000, Number(error.retryAfterMs || 0));\n        }\n        dirty = true;\n        dispatch('medindex:library-pending', { offline:!navigator.onLine, retryAt:retryUntil || 0 });\n        return false;",
    'library failed sync backoff',
  );
  source = mustReplace(
    source,
    "    } catch {\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true });",
    "    } catch (error) {\n      if ([429, 503].includes(Number(error?.status))) retryUntil = Date.now() + Math.max(30_000, Number(error?.retryAfterMs || 0));\n      dispatch('medindex:library-ready', { offline:false, local:true, pending:true, retryAt:retryUntil || 0 });",
    'library initialize backoff',
  );
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
  write('user-library-client.js', source);
}

function audit() {
  const drive = read('api/drive-sync.js');
  const library = read('lib/user-library.js');
  const client = read('user-library-client.js');
  const calc = read('lib/dose-calculator-handler.js');
  const safety = read('lib/dose-safety-handler.js');
  const revision = read('lib/registry-revision.js');

  if (!drive.includes("code:'NEON_TEMPORARILY_UNAVAILABLE'") || !drive.includes("res.status(503)")) throw new Error('Drive sync degraded contract missing.');
  if (!library.includes("retryAfter:unavailable") || !library.includes('NeonResilience.safeLog')) throw new Error('User library degraded contract missing.');
  if (!client.includes('const POLL_MS = 5000;') || !client.includes('retryUntil') || !client.includes("medindex:favorites-changed") || !client.includes("medindex:personal-note-saved")) throw new Error('User library client backoff/event contract missing.');
  if (!calc.includes('res.status(degraded ? 503 : 500)') || !safety.includes('res.status(degraded ? 503 : 500)')) throw new Error('Dose degraded response contract missing.');
  if (!revision.includes('NeonResilience.retryAfterSeconds(error)')) throw new Error('Registry revision outage backoff missing.');
  if (/POLL_MS = 1200/.test(client)) throw new Error('Aggressive 1.2s user-library polling returned.');
  console.log('Final production resilience audit passed: Neon outage backoff, 503 Retry-After, local-first library and reduced polling are active.');
}

patchDriveSync();
patchUserLibraryServer();
patchDoseHandler('lib/dose-calculator-handler.js', 'dose calculator', 'Dose calculator catalog error');
patchDoseHandler('lib/dose-safety-handler.js', 'dose safety', 'Dose safety catalog error');
patchUserLibraryClient();
audit();
