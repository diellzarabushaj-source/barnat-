const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=production-audit-v2/, `${page}: auth runtime cache version is stale`);
  assert.equal((html.match(/auth-client\.js/gi) || []).length, 1, `${page}: auth runtime must load once`);
}

const index = read('index.html');
assert.match(index, /app-performance\.js/, 'index.html: cache-isolated registry bootstrap is missing');
assert.doesNotMatch(index, /src="app\.js/, 'index.html: legacy registry bootstrap must not be loaded');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime/, 'index.html: cache-isolated generated registry runtime preload is stale');
assert.match(index, /registry-dosage-loader\.js/, 'index.html: idle dosage loader is missing');
assert.doesNotMatch(index, /src="registry-dosage-columns-v2\.js/, 'index.html: dosage enrichment must not block initial parsing');
assert.match(index, /offline-runtime-performance\.js[^>]+data-medindex-offline-runtime/, 'index.html: cache-isolated offline runtime must be loaded explicitly');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/, 'index.html: fast-start guard version is stale');
assert.match(index, /<script id="drug-data" type="application\/json">\[\]<\/script>/, 'registry JSON fallback must remain inert');

const app = read('app-performance.js');
assert.match(app, /clinical-audit-v5-performance-runtime/);
assert.match(app, /app-runtime-performance\.js/);

const dosageLoader = read('registry-dosage-loader.js');
assert.match(dosageLoader, /medindex:registry-ready/);
assert.match(dosageLoader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/);
assert.match(dosageLoader, /registry-dosage-columns-v2\.js/);

const auth = read('auth-client.js');
assert.match(auth, /offline-runtime-performance\.js\?v=low-bandwidth-v3/, 'every private page must use the same cache-isolated offline runtime');
assert.match(auth, /tailadmin-professional\.js\?v=production-audit-v2/, 'auth client must migrate a stale professional runtime');
assert.match(auth, /ensureProfessionalRuntime/, 'professional runtime migration guard is missing');
assert.match(auth, /miProfessionalVersion/, 'professional runtime version must be checked before migration');

const professional = read('tailadmin-professional.js');
assert.match(professional, /PROFESSIONAL_VERSION = 'production-audit-v2'/, 'professional runtime version is stale');
assert.match(professional, /dataset\.miProfessionalVersion = PROFESSIONAL_VERSION/, 'professional runtime must expose its active version');

const sourceRuntime = read('offline-runtime.js');
assert.match(sourceRuntime, /VERSION = 'production-audit-v2'/, 'offline runtime source version is stale');
const performanceRuntime = read('offline-runtime-performance.js');
const performanceWorker = read('sw-resilient-v3.js');
assert.match(performanceRuntime, /RESILIENCE_VERSION = 'low-bandwidth-v3'/, 'cache-isolated offline runtime version is stale');
assert.match(performanceRuntime, /SERVICE_WORKER_URL = `\/sw-resilient-v3\.js\?v=\$\{RESILIENCE_VERSION\}`/, 'cache-isolated offline runtime must load the v3 worker');
assert.match(performanceWorker, /VERSION = 'low-bandwidth-v3'/, 'cache-isolated service worker version is stale');
assert.match(performanceRuntime, /CLINICAL_WORKFLOW_URL = `\/clinical-workflow\.js\?v=\$\{VERSION\}`/, 'offline runtime must version the clinical workflow');

console.log('Clinical runtime cache-version and idle dosage asset audit passed.');
