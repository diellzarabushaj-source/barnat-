const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const files = [
  'sw-resilient.js', 'sw-resilient-v3.js',
  'offline-runtime.js', 'offline-runtime-performance.js',
  'login.js', 'tailadmin-shell.js', 'middleware.ts', 'vercel.json', 'index.html'
];
for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
for (const file of files.filter(file => file.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

const worker = read('sw-resilient-v3.js');
assert.match(worker, /VERSION = 'low-bandwidth-v3'/);
assert.match(worker, /page-low-bandwidth-hit/);
assert.match(worker, /static-fast-hit/);
assert.match(worker, /private-fast-hit/);
assert.match(worker, /SET_NETWORK_PROFILE/);
assert.match(worker, /networkProfile\.slow/);
assert.match(worker, /response\.redirected && finalPath !== expected/, 'redirected login HTML must not be cached as a clinical page');
assert.match(worker, /PRIVATE_PAGES\.has\(expected\)[\s\S]*finalPath === '\/login\.html'/, 'private page validation must reject login responses');
assert.match(worker, /if \(cached\)[\s\S]*refreshNavigation[\s\S]*return cloneWithHeader\(cached/, 'navigation must return cache before background refresh');
assert.match(worker, /for \(let index = 0; index < CORE_SHELL\.length; index \+= 2\)/, 'core shell must warm in small batches');
assert.doesNotMatch(worker, /Promise\.allSettled\(APP_SHELL\.map/, 'large concurrent shell downloads must not return');
assert.match(worker, /migratePrivateCaches/, 'existing private offline data must be migrated');
assert.doesNotMatch(worker, /refreshSafeClinicalPages|client\.navigate/, 'worker activation must not force page reloads');
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.match(worker, /const cached = await caches\.match\(request\);/, 'online static assets must use their exact versioned cache key');
assert.match(worker, /static-offline-version-fallback/, 'cached static assets must survive version-query changes offline');
assert.ok(
  worker.indexOf('const response = await refreshStatic(request)') < worker.lastIndexOf('caches.match(request, { ignoreSearch:true })'),
  'an online version miss must fetch the exact asset before considering an old offline fallback'
);

const shellMatch = worker.match(/const CORE_SHELL = \[([\s\S]*?)\n\];/);
assert.ok(shellMatch, 'generated worker must contain the install-time core shell');
const coreShell = new Set([...shellMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]));
const coreShellPaths = new Set([...coreShell].map(value => new URL(value, 'https://medindex.local/').pathname));
const clinicalPages = [
  '/index.html', '/klasifikimi.html', '/icd.html', '/analizat.html',
  '/dozologjia.html', '/protokollet.html', '/recetat.html',
];
const localAsset = rawValue => {
  const value = String(rawValue || '').trim().replace(/&amp;/g, '&');
  if (!value || /^(?:data:|mailto:|tel:|#)/i.test(value)) return null;
  const url = new URL(value, 'https://medindex.local/');
  if (url.origin !== 'https://medindex.local') return null;
  return `${url.pathname}${url.search}`;
};
for (const page of clinicalPages) {
  assert.ok(coreShell.has(page), `${page} must be available before its first offline visit`);
  const html = read(page.slice(1));
  const references = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(match => localAsset(match[1]))
    .filter(Boolean);
  for (const asset of references) {
    assert.ok(coreShell.has(asset), `${page} direct dependency ${asset} must be installed with the page`);
  }
}
[
  '/tailadmin-shell-legacy.js',
  '/mobile-experience.js',
  '/mobile-accessibility-hardening.js',
  '/offline-runtime-performance.js',
  '/first-page-clinical.css',
  '/registry-dosage-columns-v2.js',
  '/app-runtime-performance.js',
  '/registry-parser-worker-v2.js',
  '/data/registry-quality.js',
  '/local-registry.js',
].forEach(asset => {
  assert.ok(coreShellPaths.has(asset), `transitive offline dependency ${asset} must be installed before first visit`);
});

const runtime = read('offline-runtime-performance.js');
assert.match(runtime, /sw-resilient-v3\.js/);
assert.match(runtime, /RESILIENCE_VERSION = 'low-bandwidth-v3'/);
assert.match(runtime, /scheduleRegistration/);
assert.match(runtime, /window\.addEventListener\('load'/, 'first worker installation must wait until the visible page loads');
assert.match(runtime, /requestIdleCallback/, 'registration and warm-up must use idle time');
assert.match(runtime, /Lidhje e dobët · përdoret cache-i lokal/);
assert.match(runtime, /SET_NETWORK_PROFILE/);
assert.match(runtime, /saveData/);
assert.match(runtime, /slow-2g\|2g/);
assert.match(runtime, /window\.MEDINDEX_AUTH_READY/, "offline runtime must reuse the auth client's connectivity result");
assert.match(runtime, /authConnectivitySignal/, 'auth connectivity must be coordinated before any fallback probe');
assert.match(runtime, /reachabilityPromise/, 'concurrent reachability checks must share one in-flight promise');
assert.match(runtime, /fallbackNetworkProbe/, 'standalone pages must retain one bounded fallback probe');
assert.equal((runtime.match(/fetch\('\/api\/auth\?offline_probe=1'/g) || []).length, 1, 'offline runtime must define only one fallback auth probe');
assert.doesNotMatch(runtime, /setTimeout\(verifyNetworkReachability,\s*900\)/, 'duplicate delayed auth probes must not return');
assert.doesNotMatch(runtime, /await navigator\.serviceWorker\.ready/, 'startup must not block waiting for service-worker readiness');

const index = read('index.html');
assert.match(index, /offline-runtime-performance\.js[^>]+data-medindex-offline-runtime/);

const login = read('login.js');
assert.match(login, /saveBootstrapLease/);
assert.match(login, /bootstrap:true/);
assert.match(login, /45000/, 'slow login must allow a longer response window');
assert.match(login, /purgeOnlyStaleRuntimeEntries/);
assert.doesNotMatch(login, /registration\.unregister\(\)/, 'normal login must preserve the installed worker');
assert.doesNotMatch(login, /names\.filter\([^\n]*medindex-pages-[\s\S]*caches\.delete/, 'normal login must preserve page caches');
const init = login.slice(login.indexOf('function init()'));
assert.match(init, /setBusy\(false\)/, 'login form must be usable immediately');
assert.doesNotMatch(init, /await /, 'login initialization must not block on storage or network');

const shell = read('tailadmin-shell.js');
assert.match(shell, /revealCachedShellOnWeakConnection/);
assert.match(shell, /recentBootstrap/);
assert.match(shell, /auth-optimistic/);
assert.match(shell, /profile\.slow \|\| profile\.saveData/, 'runtime prefetch must stop on constrained connections');

const middleware = read('middleware.ts');
assert.match(middleware, /'\/sw-resilient-v3\.js'/, 'middleware must deliver the cache-isolated worker without authentication');
assert.match(middleware, /'\/manifest\.webmanifest'/, 'PWA manifest must remain public');
assert.match(middleware, /'\/medindex-icon\.svg'/, 'PWA icon must remain public');

const vercel = JSON.parse(read('vercel.json'));
const resilientHeader = vercel.headers.find(item => item.source === '/sw-resilient-v3.js');
assert.ok(resilientHeader, 'cache-isolated resilient worker headers are missing');
assert.match(JSON.stringify(resilientHeader.headers), /no-store/);
assert.match(JSON.stringify(resilientHeader.headers), /Service-Worker-Allowed/);

console.log('Low-bandwidth, cache-isolated and non-blocking startup audit passed.');
