const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(ROOT, relative));

[
  'sw.js', 'sw-resilient-v3.js', 'offline-runtime-performance.js',
  'auth-client.js', 'app-performance.js', 'clinical-workflow.js', 'local-registry.js'
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

const worker = read('sw-resilient-v3.js');
[
  /low-bandwidth-v3/, /skipWaiting\(\)/, /clients\.claim\(\)/,
  /WARM_PRIVATE_DATA/, /CLEAR_PRIVATE_DATA/, /GET_CACHE_STATUS/,
  /\/api\/registry/, /\/api\/dosage/, /\/api\/icd/, /\/api\/drug-search/,
  /\/data\/protocols\.json/, /\/api\/protocol-document/, /Content-Range/,
  /medindex-private-/, /medindex-documents-/, /page-fast-hit/, /private-fast-hit/, /event\.waitUntil/,
].forEach(pattern => assert.match(worker, pattern, `sw-resilient-v3.js missing ${pattern}`));
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.match(worker, /url\.pathname === '\/api\/gemini-prescription'[\s\S]*geminiResponse/, 'Gemini POST must have an explicit offline route');
assert.match(worker, /privateCacheStatus/, 'offline readiness must validate the exact required datasets');
assert.match(worker, /'\/index\.html',[\s\S]*'\/analizat\.html',[\s\S]*'\/recetat\.html'/, 'clinical pages must be part of the install-time offline shell');
assert.match(worker, /const privatePage = PRIVATE_PAGES\.has\(expectedPath\)/, 'clinical page precache must be classified separately');
assert.match(worker, /privatePage && !validHtmlResponse\(response, expectedPath\)/, 'redirected or invalid private HTML must never be cached');
assert.match(worker, /privatePage \? PAGE_CACHE : STATIC_CACHE/, 'clinical HTML must use PAGE_CACHE rather than the static asset cache');
assert.match(worker, /MEDINDEX_NETWORK_STATUS/, 'worker must broadcast confirmed network loss');
assert.match(worker, /networkProfile\.online = false/, 'failed navigation refresh must mark the worker offline');
assert.match(worker, /online:networkProfile\.online/, 'cache status must include the worker network state');
assert.doesNotMatch(worker, /cache\.put\([^\n]*api\/auth/, 'auth responses must never be cached');
assert.doesNotMatch(worker, /self\.waitUntil/, 'waitUntil must be called on the fetch event');

const runtime = read('offline-runtime-performance.js');
[
  /serviceWorker\.register/, /updateViaCache:'none'/, /navigator\.storage\.persist/,
  /WARM_PRIVATE_DATA/, /beforeinstallprompt/, /medindex:offline-runtime-ready/,
  /clinical-workflow\.js/, /Përditësim gati/, /Pa internet/, /sw-resilient-v3\.js/,
  /verifyNetworkReachability/, /offline_probe=1/, /networkReachable/,
].forEach(pattern => assert.match(runtime, pattern, `offline-runtime-performance.js missing ${pattern}`));
assert.match(runtime, /message\.type === 'MEDINDEX_NETWORK_STATUS'[\s\S]*setStatus\('offline'/, 'worker network-loss messages must immediately update the UI');
assert.match(runtime, /message\.online === false \|\| !networkReachable \|\| !navigator\.onLine[\s\S]*setStatus\('offline'/, 'cache-ready messages must not overwrite a confirmed offline state');
assert.match(runtime, /fetch\('\/api\/auth\?offline_probe=1',[\s\S]*cache:'no-store'/, 'network reachability must use a network-only endpoint');
assert.doesNotMatch(runtime, /\/api\/gemini-prescription|password/i, 'offline runtime must not call AI or handle passwords');

const auth = read('auth-client.js');
[
  /medindex_offline_lease_v2/, /LEGACY_OFFLINE_LEASE_KEYS/, /MAX_OFFLINE_LEASE_MS = 8 \* 60 \* 60 \* 1000/,
  /lease\.version !== 2/, /lease\.hardened !== true/, /payload\.hardened !== true/,
  /AUTH_TIMEOUT_MS = 3200/, /activateOfflineLease/, /auth-offline/, /CLEAR_PRIVATE_DATA/,
  /deleteDatabase\('medindex-registry-v1'\)/, /offline-runtime\.js/, /revalidateOnlineSession/,
  /medindex:offline-auth-invalid/, /AUTH_NOT_CONFIGURED/, /configurationUnavailable/,
].forEach(pattern => assert.match(auth, pattern, `auth-client.js missing ${pattern}`));
assert.match(auth, /response\.status === 401 \|\| response\.status === 403[\s\S]*goToLogin/, '401/403 must never use an offline lease');
assert.match(auth, /configurationUnavailable\(response, payload\)[\s\S]*goToLogin\('auth-not-configured'\)/, 'missing server configuration must never use an offline lease');
assert.match(auth, /if \(!navigator\.onLine\)[\s\S]*activateOfflineLease/, 'offline lease must be attempted without waiting for a timeout');
assert.doesNotMatch(auth, /lease\.version !== 1/, 'legacy offline lease version must not remain active');

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
assert.match(index, /offline-runtime-performance\.js[^>]+data-medindex-offline-runtime/);

const vercel = JSON.parse(read('vercel.json'));
const serializedHeaders = JSON.stringify(vercel.headers);
assert.match(serializedHeaders, /sw-resilient-v3\.js/, 'cache-isolated service worker cache policy is missing');
assert.match(serializedHeaders, /Service-Worker-Allowed/, 'service worker scope header is missing');
assert.match(serializedHeaders, /worker-src/, 'CSP worker-src is missing');
assert.match(serializedHeaders, /manifest-src/, 'CSP manifest-src is missing');

console.log('Offline-first, verified clinical page precache, network reachability, private-cache and PWA audit passed.');
