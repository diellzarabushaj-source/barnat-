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
assert.match(index, /registry-runtime-loader\.js\?v=20260803-unverified-1/, 'index.html: current registry loader is missing');
assert.match(index, /registry-unified-table\.js\?v=20260801-1/, 'index.html: unified table controller is missing');
assert.match(index, /registry-unified-table\.css\?v=20260801-1/, 'index.html: unified table stylesheet is missing');
assert.match(index, /registry-full-text-expansion\.css\?v=20260801-1/, 'index.html: full-row text reveal stylesheet is missing');
assert.match(index, /registry-dosage-disclosure-fix\.css\?v=20260803-3/, 'index.html: hardened dosage disclosure stylesheet is missing');
assert.match(index, /registry-row-expand\.js\?v=20260803-7/, 'index.html: idempotent row expansion controller is missing');
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.(?:js|css)/, 'index.html: a legacy table controller is still loaded');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'index.html: heavy registry bootstrap must not be parser ordered');
assert.doesNotMatch(index, /src="app\.js/, 'index.html: legacy registry bootstrap must not be loaded');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v6-unverified-visible/, 'index.html: generated registry runtime preload is stale');
assert.match(index, /registry-dosage-loader\.js/, 'index.html: idle dosage loader is missing');
assert.doesNotMatch(index, /src="registry-dosage-columns-v2\.js/, 'index.html: dosage enrichment must not block initial parsing');
assert.match(index, /offline-runtime-performance\.js[^>]+data-medindex-offline-runtime/, 'index.html: cache-isolated offline runtime must be loaded explicitly');
assert.match(index, /registry-fast-start\.js\?v=registry-fast-start-v2/, 'index.html: fast-start guard version is stale');
assert.match(index, /<script id="drug-data" type="application\/json">\[\]<\/script>/, 'registry JSON fallback must remain inert');
assert.match(index, /data-registry-ui-release="20260801-14"/, 'registry UI release is stale');

const runtimeLoader = read('registry-runtime-loader.js');
assert.match(runtimeLoader, /registry-runtime-loader-v7-unverified-visible/, 'current registry loader version is stale');
assert.match(runtimeLoader, /app-performance\.js\?v=20260803-unverified-1/, 'registry loader must request the versioned bootstrap');
assert.match(runtimeLoader, /classList\.contains\('auth-ready'\)/, 'registry loader must wait for authentication');
assert.doesNotMatch(runtimeLoader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'old interaction gate must not return');
assert.doesNotMatch(runtimeLoader, /MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/, 'loader must not create a circular readiness promise');

const app = read('app-performance.js');
assert.match(app, /clinical-audit-v6-unverified-visible/);
assert.match(app, /registry-parts-prescription-v2/);
assert.match(app, /barnat-registry-cached-at-v5/);
assert.match(app, /app-runtime-performance\.js/);

const rowExpand = read('registry-row-expand.js');
assert.match(rowExpand, /registry-row-expand-20260803-7/);
assert.match(rowExpand, /registry-dosage-disclosure-fix-css/);
assert.match(rowExpand, /data-dosage-expanded/);
assert.match(rowExpand, /Më pak/);
assert.match(rowExpand, /const desiredTail = \[finalStyle, fullText, dosageDisclosure\]\.filter\(Boolean\)/);
assert.match(rowExpand, /const alreadyStable = desiredTail\.length > 0/);
assert.match(rowExpand, /if \(!alreadyStable\) desiredTail\.forEach\(node => document\.head\.appendChild\(node\)\)/);
assert.doesNotMatch(rowExpand, /document\.head\.lastElementChild !== finalStyle/);

const dosageDisclosure = read('registry-dosage-disclosure-fix.css');
assert.match(dosageDisclosure, /data-dosage-expanded="true"/);
assert.match(dosageDisclosure, /contain:none!important/);
assert.match(dosageDisclosure, /-webkit-line-clamp:unset!important/);
assert.match(dosageDisclosure, /max-height:none!important/);

const dosageLoader = read('registry-dosage-loader.js');
assert.match(dosageLoader, /medindex:registry-ready/);
assert.match(dosageLoader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/);
assert.match(dosageLoader, /registry-dosage-columns-v2\.js/);

const auth = read('auth-client.js');
assert.match(auth, /offline-runtime-performance\.js\?v=low-bandwidth-v3/, 'every private page must use the same cache-isolated offline runtime');
assert.match(auth, /tailadmin-professional\.js\?v=production-audit-v2/, 'auth client must migrate a stale professional runtime');
assert.match(auth, /ensureProfessionalRuntime/, 'professional runtime migration guard is missing');
assert.match(auth, /miProfessionalVersion/, 'professional runtime version must be checked before migration');
assert.match(auth, /barnat-registry-cached-at-v5/, 'logout must remove the current registry cache timestamp');

const professional = read('tailadmin-professional.js');
assert.match(professional, /PROFESSIONAL_VERSION = 'production-audit-v2'/, 'professional runtime version is stale');
assert.match(professional, /dataset\.miProfessionalVersion = PROFESSIONAL_VERSION/, 'professional runtime must expose its active version');

const sourceRuntime = read('offline-runtime.js');
assert.match(sourceRuntime, /VERSION = 'production-audit-v2'/, 'offline runtime source version is stale');
const performanceRuntime = read('offline-runtime-performance.js');
const performanceWorker = read('sw-resilient-v3.js');
assert.match(performanceRuntime, /RESILIENCE_VERSION = 'low-bandwidth-v3'/, 'cache-isolated offline runtime version is stale');
assert.match(performanceRuntime, /SERVICE_WORKER_URL = `\/sw-resilient-v3\.js\?v=\$\{RESILIENCE_VERSION\}`/, 'cache-isolated offline runtime must load the v3 worker');
assert.match(performanceWorker, /VERSION = 'low-bandwidth-v3'/, 'cache-isolated service worker version is stale');
assert.match(performanceRuntime, /CLINICAL_WORKFLOW_URL = `\/clinical-workflow\.js\?v=\$\{VERSION\}`/, 'offline runtime must version the clinical workflow');

console.log('Clinical runtime cache-version, unverified registry and idempotent dosage disclosure audit passed.');
