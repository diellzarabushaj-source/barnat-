const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-runtime-loader.js', 'app-performance.js', 'registry-parser-worker-v2.js', 'registry-dosage-loader.js', 'registry-dosage-columns-v2.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const loader = read('registry-runtime-loader.js');
const app = read('app-performance.js');
const part = read('app-parts/part-01.txt');
const worker = read('registry-parser-worker-v2.js');
const dosageLoader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v2.js');
const middleware = read('middleware.ts');
const index = read('index.html');
const builder = read('scripts/build-static-runtime.js');

assert.match(loader, /registry-runtime-loader-v4/, 'completed-interaction gate version must be current');
assert.match(loader, /FIRST_INTERACTION_FALLBACK_MS = 15000/, 'automatic startup fallback must remain bounded without competing with the first interaction');
assert.match(loader, /POST_INTERACTION_GRACE_MS = 1500/, 'heavy bootstrap must wait until the completed interaction settles');
assert.match(loader, /INTERACTION_EVENTS = \['click', 'keyup', 'touchend'\]/, 'interaction gate must support completed pointer, keyboard and touch actions');
assert.match(loader, /handleCompletedInteraction[\s\S]*scheduleRuntime\(POST_INTERACTION_GRACE_MS\)/, 'completed interaction must schedule, not synchronously start, the registry');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry bootstrap must wait for the authenticated shell');
assert.match(loader, /requestAnimationFrame\(\(\) => requestAnimationFrame\(loadRuntime\)\)/, 'registry bootstrap must yield across two paint opportunities');
assert.match(loader, /app-performance\.js\?v=20260801-1/, 'cooperative loader must request the audited registry bootstrap');
assert.doesNotMatch(loader, /document\.write|eval\s*\(|new Function/, 'loader must not use dynamic-code shortcuts');

assert.match(app, /clinical-audit-v5-performance-runtime/, 'registry bootstrap version must isolate the performance runtime');
assert.match(app, /releaseStaleInteractionLock/, 'stale interaction locks must be removed');
assert.match(app, /document\.body\.style\.pointerEvents = ''/, 'body pointer events must be restored');
assert.match(app, /DATABASE_TIMEOUT_MS = 3500/, 'IndexedDB access must be bounded');
assert.match(app, /RUNTIME_TIMEOUT_MS = 40000/, 'runtime startup must be bounded');
assert.match(app, /requestIdleCallback\(run, \{ timeout:8000 \}\)/, 'registry cache writes must wait for idle time');
assert.doesNotMatch(app, /localStorage\.setItem\(CACHE_KEY,\s*JSON\.stringify/, 'full registry serialization must not block the UI thread');
assert.match(app, /medindex:registry-ready/, 'registry ready event must be dispatched');
assert.match(app, /app-runtime-performance\.js/, 'bootstrap must request the cache-isolated runtime path');

assert.match(part, /new Worker\(REGISTRY_WORKER_URL\)/, 'large registry processing must use a Web Worker');
assert.match(part, /registry-parser-worker-v2\.js/, 'the v2 worker path must be used');
assert.match(part, /NORMALIZE_BATCH = 120/, 'cooperative fallback normalization must remain bounded');
assert.match(part, /await yieldToBrowser\(\)/, 'fallback registry processing must yield to the browser');
assert.match(part, /parseRegistryCooperatively/, 'worker failure must retain a cooperative fallback');
assert.match(part, /MEDINDEX_REGISTRY_ROWS = RAW/, 'audited rows must be shared with dependent modules');
assert.match(part, /medindex:registry-data-ready/, 'shared rows must publish a readiness event');
assert.doesNotMatch(part, /Uint8Array\.from\(atob\(/, 'fallback must not decode the full payload synchronously');

assert.match(worker, /DecompressionStream\('gzip'\)/, 'worker must decompress the registry off the UI thread');
assert.match(worker, /BASE64_CHUNK = 256 \* 1024/, 'worker decoding must be chunked');
assert.match(worker, /normalizeDrugRow/, 'worker must normalize registry rows');
assert.match(worker, /importScripts\(QUALITY_URL\)/, 'worker must load the registry quality audit');
assert.match(worker, /MedIndexRegistryQuality\?\.applyRows/, 'worker must apply clinical quality rules');
assert.doesNotMatch(worker, /fetch\(/, 'parser worker must not perform independent network requests');

assert.match(dosageLoader, /medindex:registry-ready/, 'dosage enrichment must wait for an interactive registry');
assert.match(dosageLoader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/, 'dosage enrichment must start during idle time');
assert.match(dosageLoader, /registry-dosage-columns-v2\.js/, 'idle loader must inject the single-pass dosage runtime');
assert.match(dosage, /MEDINDEX_REGISTRY_ROWS/, 'dosage columns must reuse the shared registry');
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/, 'dosage columns must never parse the registry again');
assert.doesNotMatch(dosage, /subtree\s*:\s*true/, 'dosage observers must not watch their own subtree mutations');

assert.match(middleware, /'\/registry-parser-worker-v2\.js'/, 'v2 parser worker must pass through auth middleware');
assert.match(index, /registry-runtime-loader\.js\?v=20260801-4/, 'index must request the current completed-interaction bootstrap');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry application must not be parser ordered');
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('registry-runtime-loader.js'), 'fast-start must precede cooperative registry startup');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime/, 'index must preload the cache-isolated generated runtime');
assert.match(index, /registry-dosage-loader\.js/, 'index must load the idle dosage loader');
assert.doesNotMatch(index, /src="registry-dosage-columns-v2\.js/, 'heavy dosage integration must not be in the critical parser path');
assert.match(builder, /app-runtime-performance\.js/, 'build must generate the cache-isolated runtime artifact');

console.log('Registry interaction resilience, completed first-interaction gate v4, idle dosage and single-pass worker audit passed.');
