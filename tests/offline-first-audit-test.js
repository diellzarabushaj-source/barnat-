const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(ROOT, relative));

[
  'sw.js', 'sw-resilient-v3.js', 'offline-runtime.js', 'offline-runtime-performance.js',
  'auth-client.js', 'api/auth.js', 'app-performance.js', 'clinical-workflow.js', 'local-registry.js'
].forEach(file => {
  assert.ok(exists(file), `${file} is missing`);
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
});

assert.ok(exists('manifest.webmanifest'), 'PWA manifest is missing');
assert.ok(exists('medindex-icon.svg'), 'PWA icon is missing');
const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.start_url.startsWith('/index.html'), true);
assert.equal(manifest.scope, '/');
assert.match(manifest.display, /standalone/);
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);

const worker = read('sw.js');
[
  /single-version-v1/, /RELEASE_ID/, /skipWaiting\(\)/, /clients\.claim\(\)/,
  /WARM_PRIVATE_DATA/, /CLEAR_PRIVATE_DATA/, /GET_CACHE_STATUS/,
  /\/api\/registry/, /\/api\/dosage/, /\/api\/icd/, /\/api\/drug-search/,
  /\/data\/protocols\.json/, /\/api\/protocol-document/, /Content-Range/,
  /medindex-private-/, /medindex-documents-/, /page-network/, /event\.waitUntil/,
].forEach(pattern => assert.match(worker, pattern, `sw.js missing ${pattern}`));
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.match(worker, /url\.pathname === '\/api\/gemini-prescription'[\s\S]*geminiResponse/, 'Gemini POST must have an explicit offline route');
assert.match(worker, /privateCacheStatus/, 'offline readiness must validate the exact required datasets');
const appShellStart = worker.indexOf('const APP_SHELL = [');
const appShellEnd = worker.indexOf('];', appShellStart);
assert.ok(appShellStart >= 0 && appShellEnd > appShellStart, 'critical APP_SHELL block is missing');
const appShell = worker.slice(appShellStart, appShellEnd + 2);
for (const page of ['/index.html', '/analizat.html', '/recetat.html']) {
  assert.ok(appShell.includes(`'${page}'`), `${page} must remain in the install-time clinical shell`);
}
assert.doesNotMatch(worker, /await refreshSafeClinicalPages\(\)/, 'activation must not force-refresh clinical pages');
assert.doesNotMatch(worker, /cache\.put\([^\n]*api\/auth/, 'auth responses must never be cached');
assert.doesNotMatch(worker, /self\.waitUntil/, 'waitUntil must be called on the fetch event');

const navigation = worker.slice(worker.indexOf('async function navigationResponse'), worker.indexOf('async function staticResponse'));
assert.ok(navigation.indexOf('timeoutFetch') < navigation.indexOf('cache.match'), 'HTML must be network-first while online');
const staticRuntime = worker.slice(worker.indexOf('async function staticResponse'), worker.indexOf('async function refreshPrivate'));
assert.ok(staticRuntime.indexOf('timeoutFetch') < staticRuntime.indexOf('caches.match'), 'unversioned CSS/JS must retain a network-first fallback while versioned assets may hit cache first');
assert.match(staticRuntime, /static-versioned-hit/, 'versioned static assets must support immediate cache hits');

const workerShim = read('sw-resilient-v3.js');
assert.match(workerShim, /importScripts\('\/sw\.js\?v=/);
assert.doesNotMatch(workerShim, /WARM_PRIVATE_DATA|PRIVATE_DATA_PATHS|navigationResponse/, 'legacy worker route must be only a migration shim');

const runtime = read('offline-runtime.js');
[
  /serviceWorker\.register/, /updateViaCache:'none'/, /navigator\.storage\.persist/,
  /WARM_PRIVATE_DATA/, /beforeinstallprompt/, /medindex:offline-runtime-ready/,
  /clinical-workflow\.js/, /Përditësim gati/, /Pa internet/, /\/sw\.js\?v=/,
  /verifyNetworkReachability/, /offline_probe=1/, /networkReachable/, /window\.MEDINDEX_AUTH_READY/,
  /authConnectivitySignal/, /fallbackNetworkProbe/, /reachabilityPromise/,
  /RELEASE_ENDPOINT = '\/api\/auth\?release=1'/, /checkRelease/, /single-version-release-runtime-v1/,
].forEach(pattern => assert.match(runtime, pattern, `offline-runtime.js missing ${pattern}`));
assert.match(runtime, /installListeners\(\);[\s\S]*installReleaseListener\(\);[\s\S]*scheduleReleaseCheck\(\);[\s\S]*void verifyNetworkReachability\(\);/, 'release and reachability checks must be coordinated during startup');
assert.match(runtime, /NETWORK_PROBE_TIMEOUT_MS = 6000[\s\S]*AbortController/, 'the standalone fallback probe must have a deterministic timeout');
assert.match(runtime, /fetch\('\/api\/auth\?offline_probe=1',[\s\S]*cache:'no-store'/, 'network reachability must use a network-only endpoint');
assert.match(runtime, /RELEASE_ENDPOINT[\s\S]*cache:'no-store'/, 'release identity must bypass browser caches');
assert.equal((runtime.match(/fetch\('\/api\/auth\?offline_probe=1'/g) || []).length, 1, 'offline runtime must define exactly one fallback network probe');
assert.doesNotMatch(runtime, /sw-resilient-v3\.js|RESILIENCE_VERSION/, 'canonical runtime must not register legacy workers');
assert.doesNotMatch(runtime, /\/api\/gemini-prescription|password/i, 'offline runtime must not call AI or handle passwords');

const authApi = read('api/auth.js');
assert.match(authApi, /single-version-release-endpoint-v1/);
assert.match(authApi, /queryValue\(req, 'release'\) === '1'/);
assert.match(authApi, /strategy:'single-version-v1'/);
assert.match(authApi, /Cache-Control', 'no-store, max-age=0'/);
assert.equal(exists('api/release.js'), false, 'release identity must reuse the existing auth function');

const auth = read('auth-client.js');
[
  /medindex_offline_lease_v3/, /medindex_offline_lease_v2/, /LEGACY_OFFLINE_LEASE_KEYS/, /MAX_OFFLINE_LEASE_MS = 8 \* 60 \* 60 \* 1000/,
  /lease\.version !== 3/, /lease\.hardened !== true/, /payload\.hardened !== true/,
  /payload\.supabaseAuthenticated === true \|\| payload\.rollbackSession === true/,
  /AUTH_TIMEOUT_MS = 3200/, /activateOfflineLease/, /auth-offline/, /CLEAR_PRIVATE_DATA/,
  /deleteDatabase\('medindex-registry-v1'\)/, /offline-runtime\.js\?v=/, /revalidateOnlineSession/,
  /medindex:offline-auth-invalid/, /AUTH_NOT_CONFIGURED/, /configurationUnavailable/,
].forEach(pattern => assert.match(auth, pattern, `auth-client.js missing ${pattern}`));
assert.doesNotMatch(auth, /offline-runtime-performance\.js/, 'auth must not start a legacy offline runtime');
assert.match(auth, /response\.status === 401 \|\| response\.status === 403[\s\S]*goToLogin/, '401/403 must never use an offline lease');
assert.match(auth, /configurationUnavailable\(response, payload\)[\s\S]*goToLogin\('auth-not-configured'\)/, 'missing server configuration must never use an offline lease');
assert.match(auth, /if \(!navigator\.onLine\)[\s\S]*activateOfflineLease/, 'offline lease must be attempted without waiting for a timeout');

const app = read('app-performance.js');
[
  /medindex-registry-v1/, /indexedDB\.open/, /databaseGet/, /databasePut/,
  /indexeddb-offline-cache/, /service-worker-offline-cache/, /requestIdleCallback/,
  /app-runtime-performance\.js/, /parseRegistryPayload/, /scheduleBrowserCacheSave/,
].forEach(pattern => assert.match(app, pattern, `app-performance.js missing ${pattern}`));
const startup = app.slice(app.indexOf('if (hasRegistryData())'));
assert.ok(startup.indexOf('await loadBrowserCache()') >= 0, 'startup must attempt the local registry');
assert.ok(startup.indexOf('await loadBrowserCache()') < startup.indexOf('await loadRegistrySource()'), 'local registry must be attempted before the network');
assert.doesNotMatch(app, /JSON\.stringify\(window\.DRUG_DATA_PARTS\)/, 'large localStorage registry fallback must not block startup');

const index = read('index.html');
assert.match(index, /offline-runtime\.js\?v=[^\"]+[^>]+data-medindex-offline-runtime/);
assert.doesNotMatch(index, /offline-runtime-performance\.js/);

const vercel = JSON.parse(read('vercel.json'));
const serializedHeaders = JSON.stringify(vercel.headers);
assert.match(serializedHeaders, /"source":"\/sw\.js"/, 'canonical service worker cache policy is missing');
assert.match(serializedHeaders, /Service-Worker-Allowed/, 'service worker scope header is missing');
assert.match(serializedHeaders, /worker-src/, 'CSP worker-src is missing');
assert.match(serializedHeaders, /manifest-src/, 'CSP manifest-src is missing');

console.log('Offline-first single-version, tiered install shell, versioned static cache, private-cache and PWA audit passed.');