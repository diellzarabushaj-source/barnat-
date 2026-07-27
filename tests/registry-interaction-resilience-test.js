const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['app.js', 'registry-parser-worker.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const app = read('app.js');
const part = read('app-parts/part-01.txt');
const worker = read('registry-parser-worker.js');
const middleware = read('middleware.ts');
const index = read('index.html');

assert.match(app, /clinical-audit-v4-worker-runtime/, 'registry bootstrap version must bust stale runtime cache');
assert.match(app, /releaseStaleInteractionLock/, 'stale interaction locks must be removed');
assert.match(app, /document\.body\.style\.pointerEvents = ''/, 'body pointer events must be restored');
assert.match(app, /DATABASE_TIMEOUT_MS = 3000/, 'IndexedDB access must be bounded');
assert.match(app, /RUNTIME_TIMEOUT_MS = 25000/, 'runtime startup must be bounded');
assert.match(app, /medindex:registry-ready/, 'registry ready event must be dispatched');

assert.match(part, /new Worker\(REGISTRY_WORKER_URL\)/, 'large registry parsing must use a Web Worker');
assert.match(part, /NORMALIZE_BATCH = 120/, 'row normalization must be split into bounded batches');
assert.match(part, /await yieldToBrowser\(\)/, 'registry processing must yield to the browser');
assert.match(part, /parseRegistryCooperatively/, 'worker failure must have a cooperative fallback');
assert.doesNotMatch(part, /Uint8Array\.from\(atob\(/, 'registry must not decode the full payload synchronously');

assert.match(worker, /DecompressionStream\('gzip'\)/, 'worker must decompress the registry off the UI thread');
assert.match(worker, /BASE64_CHUNK = 256 \* 1024/, 'worker decoding must be chunked');
assert.doesNotMatch(worker, /fetch\(/, 'parser worker must not perform independent network requests');

assert.match(middleware, /'\/registry-parser-worker\.js'/, 'parser worker must pass through auth middleware');
assert.match(index, /app\.js\?v=production-audit-v3-worker/, 'index must request the interaction-safe bootstrap');
assert.match(index, /app-runtime\.js\?v=clinical-audit-v4-worker-runtime/, 'index must preload the current generated runtime');

console.log('Registry interaction resilience audit passed.');
