const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=production-audit-v1/, `${page}: auth runtime cache version is stale`);
  assert.equal((html.match(/auth-client\.js/gi) || []).length, 1, `${page}: auth runtime must load once`);
}

const index = read('index.html');
assert.match(index, /app\.js\?v=production-audit-v2/, 'index.html: hardened registry bootstrap cache version is stale');
assert.match(index, /<script id="drug-data" type="application\/json">\[\]<\/script>/, 'registry JSON fallback must remain inert');

const auth = read('auth-client.js');
assert.match(auth, /offline-runtime\.js\?v=production-audit-v1/, 'auth client must load the current offline runtime');
assert.match(auth, /tailadmin-professional\.js\?v=production-audit-v1/, 'auth client must migrate a stale professional runtime');
assert.match(auth, /ensureProfessionalRuntime/, 'professional runtime migration guard is missing');
assert.match(auth, /miProfessionalVersion/, 'professional runtime version must be checked before migration');

const professional = read('tailadmin-professional.js');
assert.match(professional, /PROFESSIONAL_VERSION = 'production-audit-v1'/, 'professional runtime version is stale');
assert.match(professional, /dataset\.miProfessionalVersion = PROFESSIONAL_VERSION/, 'professional runtime must expose its active version');

const runtime = read('offline-runtime.js');
assert.match(runtime, /VERSION = 'production-audit-v1'/, 'offline runtime version is stale');
assert.match(runtime, /RESILIENCE_VERSION = 'low-bandwidth-v2'/, 'low-bandwidth runtime version is stale');
assert.match(runtime, /CLINICAL_WORKFLOW_URL = `\/clinical-workflow\.js\?v=\$\{VERSION\}`/, 'offline runtime must version the clinical workflow');
assert.match(runtime, /SERVICE_WORKER_URL = `\/sw-resilient\.js\?v=\$\{RESILIENCE_VERSION\}`/, 'offline runtime must load the resilient service worker');

console.log('Clinical runtime cache-version audit passed.');
