'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Dosage upstream resilience patch could not find ${label}.`);
  return source.replace(before, after);
}

let source = read('lib/dosage-handler.js');

source = replaceOnce(
  source,
  "let pendingBuildKey = '';",
  "let pendingBuildKey = '';\nlet dosageSourceLogAt = 0;",
  'dosage source log throttle state',
);

source = replaceOnce(
  source,
  "  throw new Error(`Google Sheets nuk e dha workbook-un: ${lastError?.message || 'gabim i panjohur'}.`);",
  "  const error = new Error(`Google Sheets nuk e dha workbook-un: ${lastError?.message || 'gabim i panjohur'}.`);\n  error.code = 'DOSAGE_SHEETS_UNAVAILABLE';\n  error.status = 503;\n  error.retryAfterSeconds = 60;\n  throw error;",
  'typed Google Sheets upstream failure',
);

source = replaceOnce(
  source,
  "  } catch (error) {\n    const degraded = NeonResilience.isUnavailable(error);\n    if (degraded) NeonResilience.applyRetryHeaders(res, error);\n    NeonResilience.safeLog('Dosage data', error, 15 * 60 * 1000);\n    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');\n    return res.status(degraded ? 503 : 500).json(publicLoadError());\n  }",
  "  } catch (error) {\n    const sheetsUnavailable = error?.code === 'DOSAGE_SHEETS_UNAVAILABLE';\n    const degraded = sheetsUnavailable || NeonResilience.isUnavailable(error);\n    if (degraded) NeonResilience.applyRetryHeaders(res, error);\n    if (sheetsUnavailable) {\n      const now = Date.now();\n      if (now - dosageSourceLogAt >= 15 * 60 * 1000) {\n        dosageSourceLogAt = now;\n        console.warn(`Dosage data: Google Sheets source unavailable; degraded mode active (${clean(error?.message) || 'upstream unavailable'}).`);\n      }\n    } else {\n      NeonResilience.safeLog('Dosage data', error, 15 * 60 * 1000);\n    }\n    res.setHeader('Content-Type', 'application/json; charset=utf-8');\n    res.setHeader('Cache-Control', 'no-store');\n    if (degraded) res.setHeader('X-MedIndex-Data-Source', 'unavailable');\n    return res.status(degraded ? 503 : 500).json(publicLoadError());\n  }",
  'terminal dosage upstream degraded response',
);

if (!source.includes("error.code = 'DOSAGE_SHEETS_UNAVAILABLE';")) {
  throw new Error('Typed Google Sheets dosage failure contract missing.');
}
if (!source.includes('error.retryAfterSeconds = 60;')) {
  throw new Error('Google Sheets dosage Retry-After contract missing.');
}
if (!source.includes("const sheetsUnavailable = error?.code === 'DOSAGE_SHEETS_UNAVAILABLE';")) {
  throw new Error('Google Sheets dosage degraded classification missing.');
}
if (!source.includes("res.setHeader('X-MedIndex-Data-Source', 'unavailable')")) {
  throw new Error('Dosage degraded source header missing.');
}
if (!source.includes('return res.status(degraded ? 503 : 500).json(publicLoadError());')) {
  throw new Error('Dosage degraded 503 contract missing.');
}

write('lib/dosage-handler.js', source);
console.log('Dosage upstream resilience passed: invalid/unavailable Sheets fallback now returns throttled 503 + Retry-After instead of raw 500.');
