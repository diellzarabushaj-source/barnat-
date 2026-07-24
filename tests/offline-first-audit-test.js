const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(ROOT, relative));

['sw.js', 'offline-runtime.js', 'auth-client.js', 'app.js', 'clinical-workflow.js', 'local-registry.js'].forEach(file => {
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
  /clinical-audit-v2/,
  /skipWaiting\(\)/,
  /clients\.claim\(\)/,
  /WARM_PRIVATE_DATA/,
  /CLEAR_PRIVATE_DATA/,
  /GET_CACHE_STATUS/,
  /\/api\/registry/,
  /\/api\/dosage/,
  /\/api\/icd/,
  /\/api\/drug-search/,
  /\/data\/protocols\.json/,
  /\/api\/protocol-document/,
  /Content-Range/,
  /medindex-private-/,
  /medindex-documents-/,
  /page-hit/,
  /private-hit/,
  /event\.waitUntil/,
].forEach(pattern => assert.match(worker, pattern, `sw.js missing ${pattern}`));
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.match(worker, /url\.pathname === '\/api\/gemini-prescription'/, 'Gemini must have an explicit online-only route');
assert.doesNotMatch(worker, /cache\.put\([^\n]*api\/auth/, 'auth responses must never be cached');
assert.doesNotMatch(worker, /self\.waitUntil/, 'waitUntil must be called on the fetch event');

const runtime = read('offline-runtime.js');
[
  /serviceWorker\.register/,
  /updateViaCache:'none'/,
  /navigator\.storage\.persist/,
  /WARM_PRIVATE_DATA/,
  /beforeinstallprompt/,
  /medindex:offline-runtime-ready/,
  /clinical-workflow\.js/,
  /Përditësim gati/,
  /Pa internet/,
].forEach(pattern => assert.match(runtime, pattern, `offline-runtime.js missing ${pattern}`));
assert.doesNotMatch(runtime, /\/api\/gemini-prescription|password/i, 'offline runtime must not call AI or handle passwords');

const auth = read('auth-client.js');
[
  /medindex_offline_lease_v1/,
  /MAX_OFFLINE_LEASE_MS/,
  /AUTH_TIMEOUT_MS = 3200/,
  /activateOfflineLease/,
  /auth-offline/,
  /CLEAR_PRIVATE_DATA/,
  /deleteDatabase\('medindex-registry-v1'\)/,
  /offline-runtime\.js/,
  /revalidateOnlineSession/,
  /medindex:offline-auth-invalid/,
].forEach(pattern => assert.match(auth, pattern, `auth-client.js missing ${pattern}`));
assert.match(auth, /response\.status === 401 \|\| response\.status === 403[\s\S]*goToLogin/, '401/403 must never use an offline lease');
assert.match(auth, /if \(!navigator\.onLine\)[\s\S]*activateOfflineLease/, 'offline lease must be attempted without waiting for a timeout');

const app = read('app.js');
[
  /medindex-registry-v1/,
  /indexedDB\.open/,
  /databaseGet/,
  /databasePut/,
  /indexeddb-offline-cache/,
  /service-worker-offline-cache/,
  /requestIdleCallback/,
].forEach(pattern => assert.match(app, pattern, `app.js missing ${pattern}`));
const startup = app.slice(app.indexOf('if (hasRegistryData())'));
assert.ok(startup.indexOf('await loadBrowserCache()') >= 0, 'startup must attempt the local registry');
assert.ok(startup.indexOf('await loadBrowserCache()') < startup.indexOf('await loadGoogleDriveFallback()'), 'local registry must be attempted before the network');

const vercel = JSON.parse(read('vercel.json'));
const serializedHeaders = JSON.stringify(vercel.headers);
assert.match(serializedHeaders, /sw\\\.js|sw\.js/, 'service worker cache policy is missing');
assert.match(serializedHeaders, /Service-Worker-Allowed/, 'service worker scope header is missing');
assert.match(serializedHeaders, /worker-src/, 'CSP worker-src is missing');
assert.match(serializedHeaders, /manifest-src/, 'CSP manifest-src is missing');

console.log('Offline-first, private-cache and PWA audit passed.');
