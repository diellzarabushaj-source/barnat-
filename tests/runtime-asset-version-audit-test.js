const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html', 'analizat.html', 'dozologjia.html', 'protokollet.html', 'recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=production-audit-v2/, `${page}: auth runtime cache version is stale`);
  assert.equal((html.match(/auth-client\.js/gi) || []).length, 1, `${page}: auth runtime must load once`);
}

const index = read('index.html');
assert.match(index, /registry-mobile-lite\.js\?v=20260812-1/, 'index.html: Phase 2 mobile lightweight client is missing');
assert.match(index, /registry-mobile-lite\.css\?v=20260812-1/, 'index.html: Phase 2 mobile lightweight stylesheet is missing');
assert.match(index, /registry-runtime-loader\.js\?v=20260812-7/, 'index.html: current mobile-aware registry loader is missing');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-runtime-loader.js'), 'mobile lightweight client must register before the full loader');
assert.match(index, /registry-unified-table\.js\?v=20260801-1/, 'index.html: unified table controller is missing');
assert.match(index, /registry-unified-table\.css\?v=20260801-1/, 'index.html: unified table stylesheet is missing');
assert.match(index, /registry-full-text-expansion\.css\?v=20260805-2/, 'index.html: full-row text reveal stylesheet is missing');
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:js|css)/, 'index.html: a legacy table controller is still loaded');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'index.html: heavy registry bootstrap must not be parser ordered');
assert.doesNotMatch(index, /src="app\.js/, 'index.html: legacy registry bootstrap must not be loaded');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v5-performance-runtime/, 'index.html: generated registry runtime preload is stale');
assert.match(index, /registry-dosage-loader\.js/, 'index.html: idle dosage loader is missing');
assert.match(index, /offline-runtime\.js\?v=[^\"]+[^>]+data-medindex-offline-runtime/, 'index.html: canonical offline runtime must be loaded explicitly');
assert.doesNotMatch(index, /offline-runtime-performance\.js/, 'index.html: legacy offline runtime path must not be loaded');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/, 'index.html: fast-start guard version is stale');
assert.match(index, /<script id="drug-data" type="application\/json">\[\]<\/script>/, 'registry JSON fallback must remain inert');
assert.match(index, /data-registry-ui-release="20260809-1"/, 'registry UI release is stale');
assert.match(index, /registry-cell-preview\.js\?v=20260811-2/, 'cell preview runtime version is stale');
assert.match(index, /registry-dose-10s-flow\.js\?v=20260811-2/, 'observer-safe dose fast-flow runtime is stale');
assert.match(index, /registry-dose-calculator\.js\?v=20260810-2/, 'canonical dose calculator runtime is stale');
assert.doesNotMatch(index, /registry-dose-calculator-fast-ui\.(?:js|css)/, 'obsolete dose fast UI layer must not be loaded');
assert.match(index, /registry-dose-table-button\.js\?v=20260811-1/, 'dose table button runtime is missing');
assert.match(index, /registry-dose-table-button\.css\?v=20260810-1/, 'dose table button stylesheet is missing');
assert.match(index, /registry-dose-modal-accessibility\.js\?v=20260809-1/, 'dose modal accessibility runtime is stale');
assert.match(index, /registry-ui-release\.js\?v=20260809-1/, 'registry UI release runtime is stale');

const registryRelease = read('registry-ui-release.js');
assert.match(registryRelease, /registry-ui-20260809-1/, 'registry UI cache-clear release is stale');

const mobile = read('registry-mobile-lite.js');
assert.match(mobile, /registry-mobile-lite-v1/, 'mobile lightweight client version is stale');
assert.match(mobile, /\(max-width: 767px\)/, 'mobile lightweight client must not activate on desktop');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile lightweight client must keep the 25-row default');
assert.match(mobile, /MAX_PAGE_SIZE = 50/, 'mobile lightweight client must keep the 50-row cap');
assert.match(mobile, /view:'registry-page'/, 'mobile lightweight client must use the lightweight registry gateway');
assert.match(mobile, /view:'registry-detail'/, 'mobile detail must remain targeted');
assert.doesNotMatch(mobile, /DRUG_DATA_PARTS|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'browser mobile client must not contain full-registry or direct-Neon access');

const runtimeLoader = read('registry-runtime-loader.js');
assert.match(runtimeLoader, /registry-runtime-loader-v7/, 'mobile-aware registry loader version is stale');
assert.match(runtimeLoader, /app-performance\.js\?v=20260801-2/, 'registry loader must request the versioned full bootstrap');
assert.match(runtimeLoader, /classList\.contains\('auth-ready'\)/, 'registry loader must wait for authentication');
assert.match(runtimeLoader, /MOBILE_LITE_GRACE_MS = 5000/, 'mobile lightweight startup must have a bounded fallback');
assert.match(runtimeLoader, /mobile-lite-deferred/, 'full runtime must defer on healthy phone startup');
assert.match(runtimeLoader, /desktop-or-legacy/, 'desktop startup must remain full-runtime');
assert.doesNotMatch(runtimeLoader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'old interaction gate must not return');

const app = read('app-performance.js');
assert.match(app, /clinical-audit-v5-performance-runtime/);
assert.match(app, /app-runtime-performance\.js/);

const auth = read('auth-client.js');
assert.match(auth, /OFFLINE_RUNTIME_SRC = '\/offline-runtime\.js\?v=/, 'every private page must use the canonical offline runtime');
assert.doesNotMatch(auth, /offline-runtime-performance\.js/, 'auth must not load the migration runtime path');
assert.match(auth, /tailadmin-professional\.js\?v=production-audit-v2/, 'auth client must migrate a stale professional runtime');

const professional = read('tailadmin-professional.js');
assert.match(professional, /PROFESSIONAL_VERSION = 'production-audit-v2'/, 'professional runtime version is stale');
assert.match(professional, /dataset\.miProfessionalVersion = PROFESSIONAL_VERSION/, 'professional runtime must expose its active version');

const sourceRuntime = read('offline-runtime.js');
assert.match(sourceRuntime, /VERSION = 'single-version-v1'/, 'offline runtime must use the single-version strategy');
assert.match(sourceRuntime, /const RELEASE_ID = '[^']+'/);
assert.match(sourceRuntime, /SERVICE_WORKER_URL = `\/sw\.js\?v=\$\{RELEASE_ID\}`/);
assert.match(sourceRuntime, /RELEASE_ENDPOINT = '\/api\/auth\?release=1'/);
assert.match(sourceRuntime, /checkRelease/);
assert.doesNotMatch(sourceRuntime, /RESILIENCE_VERSION|sw-resilient-v3\.js/);

const authApi = read('api/auth.js');
assert.match(authApi, /single-version-release-endpoint-v1/);
assert.match(authApi, /queryValue\(req, 'release'\) === '1'/);
assert.match(authApi, /VERCEL_GIT_COMMIT_SHA/);
assert.match(authApi, /strategy:'single-version-v1'/);
assert.equal(fs.existsSync(path.join(ROOT, 'api/release.js')), false, 'release identity must not use an additional serverless function');

const canonicalWorker = read('sw.js');
assert.match(canonicalWorker, /VERSION = 'single-version-v1'/);
assert.match(canonicalWorker, /CACHE_NAMESPACE = `\$\{VERSION\}-\$\{RELEASE_ID\}`/);
assert.doesNotMatch(canonicalWorker, /'\/ui-enhancements\.js'/);

const runtimeShim = read('offline-runtime-performance.js');
assert.match(runtimeShim, /single-version-migration/);
assert.match(runtimeShim, /offline-runtime\.js\?v=/);
const workerShim = read('sw-resilient-v3.js');
assert.match(workerShim, /importScripts\('\/sw\.js\?v=/);
assert.doesNotMatch(workerShim, /navigationResponse|PRIVATE_DATA_PATHS/);

console.log('Clinical runtime single-version, Phase 2 mobile lightweight path and canonical dose runtime audit passed.');