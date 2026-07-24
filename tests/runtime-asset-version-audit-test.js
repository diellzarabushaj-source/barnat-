const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=clinical-audit-v2/, `${page}: auth runtime cache version is stale`);
  assert.equal((html.match(/auth-client\.js/gi) || []).length, 1, `${page}: auth runtime must load once`);
}

const index = read('index.html');
assert.match(index, /app\.js\?v=clinical-audit-v2/, 'index.html: registry bootstrap cache version is stale');

const auth = read('auth-client.js');
assert.match(auth, /offline-runtime\.js\?v=clinical-audit-v2/, 'auth client must load the current offline runtime');
const runtime = read('offline-runtime.js');
assert.match(runtime, /VERSION = 'clinical-audit-v2'/, 'offline runtime version is stale');
assert.match(runtime, /CLINICAL_WORKFLOW_URL = `\/clinical-workflow\.js\?v=\$\{VERSION\}`/, 'offline runtime must version the clinical workflow');
assert.match(runtime, /SERVICE_WORKER_URL = `\/sw\.js\?v=\$\{VERSION\}`/, 'offline runtime must version the service worker');

console.log('Clinical runtime cache-version audit passed.');
