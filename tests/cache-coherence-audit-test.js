const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, /tailadmin-shell\.js\?v=production-audit-v2/, page + ': shell cache token is stale');
  assert.match(html, /tailadmin-professional\.js\?v=production-audit-v2/, page + ': professional UI cache token is stale');
  assert.match(html, /auth-client\.js\?v=production-audit-v2/, page + ': auth cache token is stale');
}

const worker = read('sw.js');
const runtime = read('offline-runtime.js');
const shell = read('tailadmin-shell.js');
const authClient = read('auth-client.js');
const authApi = read('api/auth.js');
const index = read('index.html');

assert.match(worker, /VERSION = 'single-version-v1'/);
assert.match(worker, /const RELEASE_ID = '([^']+)'/);
assert.match(worker, /CACHE_NAMESPACE = `\$\{VERSION\}-\$\{RELEASE_ID\}`/);
assert.match(worker, /names\.filter\(name => name\.startsWith\('medindex-'\) && !ALL_CACHES\.includes\(name\)\)[\s\S]*caches\.delete/, 'old release caches must be purged');
assert.doesNotMatch(worker, /await refreshSafeClinicalPages\(\)/, 'worker activation must not force refresh an open page');

assert.match(runtime, /VERSION = 'single-version-v1'/);
assert.match(runtime, /RELEASE_ENDPOINT = '\/api\/auth\?release=1'/);
assert.match(runtime, /SERVICE_WORKER_URL = `\/sw\.js\?v=\$\{RELEASE_ID\}`/);
assert.match(runtime, /cache:'no-store'/);
assert.match(runtime, /checkRelease/);
assert.match(shell, /OFFLINE_RUNTIME_SRC = '\/offline-runtime\.js\?v=/);
assert.match(authClient, /OFFLINE_RUNTIME_SRC = '\/offline-runtime\.js\?v=/);
assert.match(index, /offline-runtime\.js\?v=[^\"]+[^>]+data-medindex-offline-runtime/);
assert.doesNotMatch(index, /offline-runtime-performance\.js/);

const runtimeShim = read('offline-runtime-performance.js');
assert.match(runtimeShim, /offline-runtime\.js\?v=/);
assert.doesNotMatch(runtimeShim, /serviceWorker\.register/);
const workerShim = read('sw-resilient-v3.js');
assert.match(workerShim, /importScripts\('\/sw\.js\?v=/);
assert.doesNotMatch(workerShim, /navigationResponse|staticResponse|PRIVATE_DATA_PATHS/);

assert.match(authApi, /single-version-release-endpoint-v1/);
assert.match(authApi, /queryValue\(req, 'release'\) === '1'/);
assert.match(authApi, /VERCEL_GIT_COMMIT_SHA/);
assert.match(authApi, /strategy:'single-version-v1'/);
assert.match(authApi, /Cache-Control', 'no-store, max-age=0'/, 'release identity must inherit no-store auth headers');
assert.equal(fs.existsSync(path.join(ROOT, 'api/release.js')), false, 'release identity must not consume a separate Vercel function');

const workflow = read('.github/workflows/physician-browser-audit.yml');
assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/, 'browser audit must run after merges to main');
assert.match(workflow, /pull_request:/, 'browser audit must still protect pull requests');

const vercel = read('vercel.json');
assert.match(vercel, /max-age=31536000, immutable/, 'immutable asset policy changed unexpectedly');
assert.match(vercel, /no-cache, no-store, must-revalidate/, 'service worker must remain non-cacheable');

console.log('Single-version production cache coherence and post-merge audit gate passed.');
