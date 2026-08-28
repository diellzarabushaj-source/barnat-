const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = ['index.html', 'klasifikimi.html', 'icd.html'];


const labs = read('analizat.html');
assert.match(labs, /analizat-v2\.css\?v=1/, 'analizat.html: V2 stylesheet version is stale');
assert.match(labs, /analizat-v2\.js\?v=1/, 'analizat.html: V2 runtime version is stale');
assert.match(labs, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/, 'analizat.html: canonical Stripe shell is missing');
assert.doesNotMatch(labs, /auth-client\.js|analizat-polish\.css|lab-sheet-data\.js|analizat\.js/, 'analizat.html: legacy laboratory runtime must stay removed');

const protocols = read('protokollet.html');
assert.match(protocols, /protokollet-v2\.css\?v=1/, 'protokollet.html: V2 stylesheet version is stale');
assert.match(protocols, /protokollet-v2\.js\?v=1/, 'protokollet.html: V2 runtime version is stale');
assert.match(protocols, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/, 'protokollet.html: canonical Stripe shell is missing');
assert.doesNotMatch(protocols, /auth-client\.js|tailadmin-|protocol-reader\.css|protocol-interactive\.css|protokollet\.js/, 'protokollet.html: legacy protocol runtime must stay removed');

const prescriptions = read('recetat.html');
assert.match(prescriptions, /recetat-v2\.css\?v=1/, 'recetat.html: V2 stylesheet version is stale');
assert.match(prescriptions, /recetat-v2\.js\?v=1/, 'recetat.html: V2 runtime version is stale');
assert.match(prescriptions, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/, 'recetat.html: canonical Stripe shell is missing');
assert.doesNotMatch(prescriptions, /auth-client\.js|tailadmin-|recetat-style-loader\.js|recetat\.css|recetat\.js/, 'recetat.html: legacy prescription runtime must stay removed');

const dosagePage = read('dozologjia.html');
assert.match(dosagePage, /dozologjia-v2\.css\?v=1/, 'dozologjia.html: V2 stylesheet version is stale');
assert.match(dosagePage, /dozologjia-v2\.js\?v=1/, 'dozologjia.html: V2 runtime version is stale');
assert.match(dosagePage, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/, 'dozologjia.html: canonical Stripe shell is missing');
assert.doesNotMatch(dosagePage, /auth-client\.js|tailadmin-|dozologjia-deep-audit\.js|style-loader|dozologjia\.js/, 'dozologjia.html: legacy dosage runtime must stay removed');

const systemPage = read('sistemi.html');
assert.match(systemPage, /sistemi-v2\.css\?v=1/, 'sistemi.html: V2 stylesheet version is stale');
assert.match(systemPage, /sistemi-v2\.js\?v=1/, 'sistemi.html: V2 runtime version is stale');
assert.match(systemPage, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/, 'sistemi.html: canonical Stripe shell is missing');
assert.doesNotMatch(systemPage, /auth-client\.js|tailadmin-|system-health\.js|media-library\.js|admin-entry\.js/, 'sistemi.html: legacy operational runtime must stay removed');

for (const page of pages) {
  const html = read(page);
  assert.match(html, /auth-client\.js\?v=production-audit-v2/, `${page}: auth runtime cache version is stale`);
  assert.equal((html.match(/auth-client\.js/gi) || []).length, 1, `${page}: auth runtime must load once`);
}

const index = read('index.html');
assert.match(index, /registry-mobile-lite\.js\?v=20260812-2/, 'index.html: current mobile lightweight client is missing');
assert.match(index, /registry-mobile-lite\.css\?v=20260812-2/, 'index.html: current mobile lightweight stylesheet is missing');
assert.match(index, /registry-desktop-lite\.js\?v=20260812-1/, 'index.html: Phase 10 desktop lightweight client is missing');
assert.match(index, /registry-runtime-loader\.js\?v=20260813-10/, 'index.html: current single-owner mobile-and-desktop-aware registry loader is missing');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-desktop-lite.js'), 'mobile lightweight client must register before desktop lightweight startup');
assert.ok(index.indexOf('registry-desktop-lite.js') < index.indexOf('registry-runtime-loader.js'), 'desktop lightweight client must register before the full loader');
assert.match(index, /registry-unified-table\.js\?v=registry-canonical-main-table-v1/, 'index.html: canonical one-owner unified table controller is missing');
assert.match(index, /registry-unified-table\.css\?v=registry-canonical-main-table-v1/, 'index.html: canonical one-owner unified table stylesheet is missing');
assert.match(index, /registry-dose-clinical-row-markers\.js\?v=20260820-registry-columns-v2/, 'index.html: approved-population row marker runtime is missing');
assert.match(index, /registry-full-text-expansion\.css\?v=20260805-2/, 'index.html: full-row text reveal stylesheet is missing');
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:js|css)/, 'index.html: a legacy table controller is still loaded');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'index.html: heavy registry bootstrap must not be parser ordered');
assert.doesNotMatch(index, /src="app\.js/, 'index.html: legacy registry bootstrap must not be loaded');
assert.doesNotMatch(index, /rel="preload" href="app-runtime-performance\.js/, 'index.html: full generated registry runtime must not be preloaded on normal lightweight startup');
assert.match(index, /registry-dosage-loader\.js/, 'index.html: idle dosage loader is missing');
assert.match(index, /offline-runtime\.js\?v=[^\"]+[^>]+data-medindex-offline-runtime/, 'index.html: canonical offline runtime must be loaded explicitly');
assert.doesNotMatch(index, /offline-runtime-performance\.js/, 'index.html: legacy offline runtime path must not be loaded');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/, 'index.html: fast-start guard version is stale');
assert.match(index, /<script id="drug-data" type="application\/json">\[\]<\/script>/, 'registry JSON fallback must remain inert');
assert.match(index, /data-registry-ui-release="20260812-1"/, 'registry UI release is stale');
assert.match(index, /registry-cell-preview\.js\?v=20260811-2/, 'cell preview runtime version is stale');
assert.match(index, /registry-dose-10s-flow\.js\?v=20260811-2/, 'observer-safe dose fast-flow runtime is stale');
assert.match(index, /registry-dose-calculator\.js\?v=20260810-2/, 'canonical dose calculator runtime is stale');
assert.doesNotMatch(index, /registry-dose-calculator-fast-ui\.(?:js|css)/, 'obsolete dose fast UI layer must not be loaded');
assert.match(index, /registry-dose-table-button\.js\?v=20260811-1/, 'dose table button runtime is missing');
assert.match(index, /registry-dose-table-button\.css\?v=20260810-1/, 'dose table button stylesheet is missing');
assert.match(index, /registry-dose-modal-accessibility\.js\?v=20260809-1/, 'dose modal accessibility runtime is stale');
assert.match(index, /registry-ui-release\.js\?v=20260812-1/, 'registry UI release runtime is stale');

const registryRelease = read('registry-ui-release.js');
assert.match(registryRelease, /registry-ui-20260812-1/, 'registry UI cache-clear release is stale');

const mobile = read('registry-mobile-lite.js');
assert.match(mobile, /registry-mobile-lite-v2/, 'mobile lightweight client version is stale');
assert.match(mobile, /\(max-width: 767px\)/, 'mobile lightweight client must not activate on desktop');
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/, 'mobile lightweight client must keep the 25-row default');
assert.match(mobile, /MAX_PAGE_SIZE = 50/, 'mobile lightweight client must keep the 50-row cap');
assert.match(mobile, /view:'registry-page'/, 'mobile lightweight client must use the lightweight registry gateway');
assert.match(mobile, /view:'registry-detail'/, 'mobile detail must remain targeted');
assert.match(mobile, /fatal-mobile-lite-recovery/, 'mobile client must retain explicit fatal recovery');
assert.doesNotMatch(mobile, /requestFullRegistry\('mobile-lite-error'\)|requestFullRegistry\('drug-full-detail'\)/, 'ordinary mobile paths must never wake the full renderer');
assert.doesNotMatch(mobile, /DRUG_DATA_PARTS|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'browser mobile client must not contain full-registry or direct-Neon access');

const desktop = read('registry-desktop-lite.js');
assert.match(desktop, /registry-desktop-lite-v1/, 'desktop lightweight client version is stale');
assert.match(desktop, /\(min-width: 768px\)/, 'desktop lightweight client must not activate on phone');
assert.match(desktop, /DEFAULT_PAGE_SIZE = 50/, 'desktop lightweight client must keep the 50-row default');
assert.match(desktop, /view:'registry-page'/, 'desktop lightweight client must use the bounded registry gateway');
assert.match(desktop, /medindex:request-full-registry/, 'desktop advanced features must retain an explicit full-runtime handoff');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'browser desktop lightweight client must not contain full-registry or direct-Neon access');

const runtimeLoader = read('registry-runtime-loader.js');
assert.match(runtimeLoader, /registry-runtime-loader-v10/, 'single-owner mobile-and-desktop-aware registry loader version is stale');
assert.match(runtimeLoader, /app-performance\.js\?v=20260801-2/, 'registry loader must retain the versioned full bootstrap for explicit fatal/desktop handoff');
assert.match(runtimeLoader, /classList\.contains\('auth-ready'\)/, 'registry loader must wait for authentication');
assert.match(runtimeLoader, /MOBILE_LITE_STALL_MS = 12000/, 'mobile lightweight startup must have a diagnostic stall watch');
assert.match(runtimeLoader, /DESKTOP_LITE_GRACE_MS = 5000/, 'desktop lightweight startup must have a bounded fallback');
assert.match(runtimeLoader, /mobile-lite-deferred/, 'full runtime must defer on healthy phone startup');
assert.match(runtimeLoader, /mobile-lite-stalled/, 'slow phone startup must remain under lightweight ownership');
assert.match(runtimeLoader, /medindex:mobile-lite-stalled/, 'mobile stall state must be observable');
assert.match(runtimeLoader, /mobile-full-registry-blocked/, 'nonfatal mobile full-runtime requests must be blocked');
assert.match(runtimeLoader, /isExplicitMobileFullRequest/, 'mobile full-runtime transition must be restricted to fatal/desktop transition');
assert.doesNotMatch(runtimeLoader, /scheduleRuntime\('mobile-lite-timeout'\)/, 'old mobile timeout takeover must never return');
assert.match(runtimeLoader, /desktop-lite-deferred/, 'full runtime must defer on healthy desktop startup');
assert.match(runtimeLoader, /desktop-lite-timeout/, 'desktop lightweight startup must retain a bounded fallback');
assert.match(runtimeLoader, /legacy-no-lite/, 'unsupported environments must retain the audited legacy fallback');
assert.match(runtimeLoader, /medindex:request-full-registry/, 'explicit fatal/desktop lightweight flows must retain full-runtime handoff');
assert.doesNotMatch(runtimeLoader, /scheduleRuntime\('desktop-or-legacy'\)/, 'normal authenticated desktop must not eagerly load the full registry');
assert.doesNotMatch(runtimeLoader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'old interaction gate must not return');

const app = read('app-performance.js');
assert.match(app, /clinical-audit-v5-performance-runtime/);
assert.match(app, /app-runtime-performance\.js/, 'full fallback bootstrap must retain the generated runtime path');

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

console.log('Clinical runtime single-version, v10 single-owner mobile/desktop lightweight paths, canonical unified table, approved-population column and canonical dose runtime audit passed.');
