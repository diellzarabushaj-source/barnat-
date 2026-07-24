const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = 'production-audit-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, new RegExp('tailadmin-shell\\.js\\?v=' + RELEASE), page + ': shell cache token is stale');
  assert.match(html, new RegExp('tailadmin-professional\\.js\\?v=' + RELEASE), page + ': professional UI cache token is stale');
  assert.match(html, new RegExp('auth-client\\.js\\?v=' + RELEASE), page + ': auth cache token is stale');
}

const critical = ['sw.js', 'offline-runtime.js', 'auth-client.js', 'tailadmin-shell.js', 'tailadmin-professional.js', 'clinical-workflow.js', 'mobile-experience.js'];
for (const file of critical) {
  const source = read(file);
  assert.ok(source.includes(RELEASE), file + ': release token is missing');
  assert.doesNotMatch(source, /clinical-audit-v[234]|mobile-audit-v1/, file + ': stale runtime token remains');
}

const worker = read('sw.js');
assert.match(worker, /tailadmin-shell-legacy\.js/, 'legacy shell is not precached');
assert.match(worker, /mobile-experience\.js/, 'mobile runtime is not precached');
assert.match(worker, new RegExp("VERSION = '" + RELEASE + "'"), 'service-worker cache namespace is stale');

const workflow = read('.github/workflows/physician-browser-audit.yml');
assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/, 'browser audit must run after merges to main');
assert.match(workflow, /pull_request:/, 'browser audit must still protect pull requests');

const vercel = read('vercel.json');
assert.match(vercel, /max-age=31536000, immutable/, 'immutable asset policy changed unexpectedly');
assert.match(vercel, /no-cache, no-store, must-revalidate/, 'service worker must remain non-cacheable');

console.log('Production cache coherence and post-merge audit gate passed.');
