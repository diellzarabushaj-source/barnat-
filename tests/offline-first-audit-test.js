const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(ROOT, relative));

['sw.js', 'offline-runtime.js', 'auth-client.js', 'app.js'].forEach(file => {
  assert.ok(exists(file), `${file} is missing`);
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
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
  /5a3e284e-offline-v1/,
  /skipWaiting\(\)/,
  /clients\.claim\(\)/,
  /WARM_PRIVATE_DATA/,
  /CLEAR_PRIVATE_DATA/,
  /\/api\/registry/,
  /\/api\/dosage/,
  /\/data\/protocols\.json/,
  /\/api\/protocol-document/,
  /X-MedIndex-Offline/,
  /Content-Range/,
  /medindex-private-/,
  /medindex-documents-/,
].forEach(pattern => assert.match(worker, pattern, `sw.js missing ${pattern}`));
assert.match(worker, /url\.pathname === '\/api\/auth'[\s\S]*fetch\(request\)/, 'auth must remain network-only');
assert.match(worker, /url\.pathname === '\/api\/gemini-prescription'/, 'Gemini must have an explicit online-only route');
assert.doesNotMatch(worker, /cache\.put\([^\n]*api\/auth/, 'auth responses must never be cached');

const runtime = read('offline-runtime.js');
[
  /serviceWorker\.register/,
  /updateViaCache:\s*'none'/,
  /navigator\.storage\.persist/,
  /WARM_PRIVATE_DATA/,
  /beforeinstallprompt/,
  /medindex:offline-runtime-ready/,
  /Pa internet/,
].forEach(pattern => assert.match(runtime, pattern, `offline-runtime.js missing ${pattern}`));
assert.doesNotMatch(runtime, /\/api\/gemini-prescription|password/i, 'offline runtime must not call AI or handle passwords');

const auth = read('auth-client.js');
[
  /medindex_offline_lease_v1/,
  /MAX_OFFLINE_LEASE_MS/,
  /activateOfflineLease/,
  /auth-offline/,
  /CLEAR_PRIVATE_DATA/,
  /indexedDB\.deleteDatabase\('medindex-registry-v1'\)/,
  /offline-runtime\.js/,
  /revalidateOnlineSession/,
].forEach(pattern => assert.match(auth, pattern, `auth-client.js missing ${pattern}`));
assert.match(auth, /response\.status === 401 \|\| response\.status === 403[\s\S]*goToLogin/, '401/403 must never use an offline lease');

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
assert.ok(app.indexOf('await loadBrowserCache()') < app.indexOf('loadGoogleDriveFallback()'), 'local registry must be attempted before the network');

const vercel = JSON.parse(read('vercel.json'));
const serializedHeaders = JSON.stringify(vercel.headers);
assert.match(serializedHeaders, /sw\\\.js|sw\.js/, 'service worker cache policy is missing');
assert.match(serializedHeaders, /Service-Worker-Allowed/, 'service worker scope header is missing');
assert.match(serializedHeaders, /worker-src/, 'CSP worker-src is missing');
assert.match(serializedHeaders, /manifest-src/, 'CSP manifest-src is missing');

console.log('Offline-first, private-cache and PWA audit passed.');
