const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const files = [
  'sw.js', 'sw-resilient.js', 'sw-resilient-v3.js',
  'offline-runtime.js', 'offline-runtime-performance.js',
  'login.js', 'auth-client.js', 'api/auth.js', 'tailadmin-shell.js', 'middleware.ts', 'vercel.json', 'index.html'
];
for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
for (const file of files.filter(file => file.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

const worker = read('sw.js');
assert.match(worker, /VERSION = 'single-version-v1'/);
assert.match(worker, /const RELEASE_ID = '[^']+'/);
assert.match(worker, /CACHE_NAMESPACE = `\$\{VERSION\}-\$\{RELEASE_ID\}`/);
assert.match(worker, /QUERY_DATA_PATHS = new Set\(\['\/api\/drug-search', '\/api\/icd'\]\)/);
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.doesNotMatch(worker, /'\/ui-enhancements\.js'/, 'obsolete registry UI layer must not be precached');
assert.doesNotMatch(worker, /await refreshSafeClinicalPages\(\)/, 'worker activation must never force-navigate open clinical pages');
assert.match(worker, /names\.filter\(name => name\.startsWith\('medindex-'\) && !ALL_CACHES\.includes\(name\)\)[\s\S]*caches\.delete/, 'old release caches must be purged on activation');

const navigation = worker.slice(worker.indexOf('async function navigationResponse'), worker.indexOf('async function staticResponse'));
assert.ok(navigation.indexOf('timeoutFetch') < navigation.indexOf('cache.match'), 'online navigation must try the network before cached HTML');
const staticRuntime = worker.slice(worker.indexOf('async function staticResponse'), worker.indexOf('async function refreshPrivate'));
assert.ok(staticRuntime.indexOf('timeoutFetch') < staticRuntime.indexOf('caches.match'), 'online static assets must try the network before cache fallback');

for (const file of ['sw-resilient.js', 'sw-resilient-v3.js']) {
  const shim = read(file);
  assert.match(shim, /compatibility shim/);
  assert.match(shim, /importScripts\('\/sw\.js\?v=/);
  assert.doesNotMatch(shim, /navigationResponse|staticResponse|PRIVATE_DATA_PATHS/, `${file} must not retain a second service-worker implementation`);
}

const runtime = read('offline-runtime.js');
assert.match(runtime, /VERSION = 'single-version-v1'/);
assert.match(runtime, /SERVICE_WORKER_URL = `\/sw\.js\?v=\$\{RELEASE_ID\}`/);
assert.match(runtime, /RELEASE_ENDPOINT = '\/api\/auth\?release=1'/);
assert.match(runtime, /single-version-release-runtime-v1/);
assert.match(runtime, /checkRelease/);
assert.match(runtime, /cache:'no-store'/);
assert.match(runtime, /scheduleRegistration/);
assert.match(runtime, /window\.addEventListener\('load'/, 'first worker installation must wait until the visible page loads');
assert.match(runtime, /requestIdleCallback/, 'registration and warm-up must use idle time');
assert.match(runtime, /Lidhje e dobët · përdoret cache-i lokal/);
assert.match(runtime, /window\.MEDINDEX_AUTH_READY/, "offline runtime must reuse the auth client's connectivity result");
assert.match(runtime, /authConnectivitySignal/);
assert.match(runtime, /reachabilityPromise/);
assert.match(runtime, /fallbackNetworkProbe/);
assert.equal((runtime.match(/fetch\('\/api\/auth\?offline_probe=1'/g) || []).length, 1, 'offline runtime must define only one fallback auth probe');
assert.doesNotMatch(runtime, /sw-resilient-v3\.js|RESILIENCE_VERSION/, 'canonical runtime must not register a legacy worker');

const runtimeShim = read('offline-runtime-performance.js');
assert.match(runtimeShim, /single-version-migration/);
assert.match(runtimeShim, /offline-runtime\.js\?v=/);
assert.doesNotMatch(runtimeShim, /serviceWorker\.register/, 'legacy runtime path must not own service worker registration');

const index = read('index.html');
assert.match(index, /offline-runtime\.js\?v=[^\"]+[^>]+data-medindex-offline-runtime/);
assert.doesNotMatch(index, /offline-runtime-performance\.js/);

const auth = read('auth-client.js');
assert.match(auth, /OFFLINE_RUNTIME_SRC = '\/offline-runtime\.js\?v=/);
assert.doesNotMatch(auth, /offline-runtime-performance\.js/);

const authApi = read('api/auth.js');
assert.match(authApi, /single-version-release-endpoint-v1/);
assert.match(authApi, /queryValue\(req, 'release'\) === '1'/);
assert.match(authApi, /strategy:'single-version-v1'/);
assert.match(authApi, /Cache-Control', 'no-store, max-age=0'/);
assert.equal(fs.existsSync(path.join(ROOT, 'api/release.js')), false, 'release identity must not consume a separate function slot');

const shell = read('tailadmin-shell.js');
assert.match(shell, /OFFLINE_RUNTIME_SRC = '\/offline-runtime\.js\?v=/);
assert.match(shell, /revealCachedShellOnWeakConnection/);
assert.match(shell, /recentBootstrap/);
assert.match(shell, /auth-optimistic/);
assert.match(shell, /profile\.slow \|\| profile\.saveData/, 'runtime prefetch must stop on constrained connections');

const middleware = read('middleware.ts');
assert.match(middleware, /pathname === '\/api\/auth'/, 'auth endpoint must remain public for release checks and auth bootstrap');
assert.match(middleware, /'\/sw\.js'/, 'canonical worker must remain public');
assert.match(middleware, /'\/sw-resilient-v3\.js'/, 'migration worker path must remain public during cutover');

const vercel = JSON.parse(read('vercel.json'));
const canonicalHeader = vercel.headers.find(item => item.source === '/sw.js');
assert.ok(canonicalHeader, 'canonical service worker headers are missing');
assert.match(JSON.stringify(canonicalHeader.headers), /no-store/);
assert.match(JSON.stringify(canonicalHeader.headers), /Service-Worker-Allowed/);

console.log('Low-bandwidth single-version, network-first and non-blocking startup audit passed.');
