const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-runtime-loader.js', 'app-performance.js', 'registry-parser-worker-v2.js', 'registry-dosage-loader.js', 'registry-dosage-columns-v2.js', 'registry-row-expand.js', 'registry-unified-table.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const loader = read('registry-runtime-loader.js');
const app = read('app-performance.js');
const part = read('app-parts/part-01.txt');
const worker = read('registry-parser-worker-v2.js');
const dosageLoader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v2.js');
const rowExpand = read('registry-row-expand.js');
const disclosureCss = read('registry-dosage-disclosure-fix.css');
const unified = read('registry-unified-table.js');
const middleware = read('middleware.ts');
const index = read('index.html');
const builder = read('scripts/build-static-runtime.js');

assert.match(loader, /registry-runtime-loader-v7-unverified-visible/, 'authenticated loader version must be current');
assert.match(loader, /classList\.contains\('auth-ready'\)/, 'registry bootstrap must wait for the authenticated shell');
assert.match(loader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(\)/, 'registry bootstrap must yield a paint opportunity');
assert.match(loader, /app-performance\.js\?v=20260803-unverified-1/, 'loader must request the current registry bootstrap');
assert.doesNotMatch(loader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|INTERACTION_EVENTS/, 'loader must not wait for a click or multi-second fallback');
assert.doesNotMatch(loader, /MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/, 'loader must not shadow the runtime readiness promise');
assert.doesNotMatch(loader, /document\.write|eval\s*\(|new Function/, 'loader must not use dynamic-code shortcuts');

assert.match(app, /clinical-audit-v6-unverified-visible/, 'registry bootstrap version must isolate the current runtime');
assert.match(app, /registry-parts-prescription-v2/, 'current IndexedDB dataset key is missing');
assert.match(app, /barnat-registry-cached-at-v5/, 'current cache timestamp key is missing');
assert.match(app, /releaseStaleInteractionLock/, 'stale interaction locks must be removed');
assert.match(app, /document\.body\.style\.pointerEvents = ''/, 'body pointer events must be restored');
assert.match(app, /DATABASE_TIMEOUT_MS = 3500/, 'IndexedDB access must be bounded');
assert.match(app, /RUNTIME_TIMEOUT_MS = 40000/, 'runtime startup must be bounded');
assert.match(app, /requestIdleCallback\(run, \{ timeout:8000 \}\)/, 'registry cache writes must wait for idle time');
assert.doesNotMatch(app, /localStorage\.setItem\(CACHE_KEY,\s*JSON\.stringify/, 'full registry serialization must not block the UI thread');
assert.match(app, /medindex:registry-ready/, 'registry ready event must be dispatched');
assert.match(app, /app-runtime-performance\.js/, 'bootstrap must request the cache-isolated runtime path');

assert.match(part, /new Worker\(REGISTRY_WORKER_URL\)/, 'large registry processing must use a Web Worker');
assert.match(part, /registry-parser-worker-v2\.js/, 'the v2 worker path must be used');
assert.match(part, /NORMALIZE_BATCH = 120/, 'cooperative fallback normalization must remain bounded');
assert.match(part, /await yieldToBrowser\(\)/, 'fallback registry processing must yield to the browser');
assert.match(part, /parseRegistryCooperatively/, 'worker failure must retain a cooperative fallback');
assert.match(part, /MEDINDEX_REGISTRY_ROWS = RAW/, 'audited rows must be shared with dependent modules');
assert.match(part, /medindex:registry-data-ready/, 'shared rows must publish a readiness event');
assert.doesNotMatch(part, /Uint8Array\.from\(atob\(/, 'fallback must not decode the full payload synchronously');

assert.match(worker, /DecompressionStream\('gzip'\)/, 'worker must decompress the registry off the UI thread');
assert.match(worker, /BASE64_CHUNK = 256 \* 1024/, 'worker decoding must be chunked');
assert.match(worker, /normalizeDrugRow/, 'worker must normalize registry rows');
assert.match(worker, /importScripts\(QUALITY_URL\)/, 'worker must load the registry quality audit');
assert.match(worker, /MedIndexRegistryQuality\?\.applyRows/, 'worker must apply clinical quality rules');
assert.doesNotMatch(worker, /fetch\(/, 'parser worker must not perform independent network requests');

assert.match(dosageLoader, /medindex:registry-ready/, 'dosage enrichment must wait for an interactive registry');
assert.match(dosageLoader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/, 'dosage enrichment must start during idle time');
assert.match(dosageLoader, /registry-dosage-columns-v2\.js/, 'idle loader must inject the dosage runtime');
assert.match(dosage, /MEDINDEX_REGISTRY_ROWS/, 'dosage columns must reuse the shared registry');
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/, 'dosage columns must never parse the registry again');
assert.doesNotMatch(dosage, /subtree\s*:\s*true/, 'dosage observers must not watch their own subtree mutations');

assert.match(rowExpand, /registry-row-expand-20260803-7/, 'full-row disclosure controller must be current');
assert.match(rowExpand, /document\.addEventListener\('click', onClick, true\)/, 'disclosure must capture the click before the legacy listener');
assert.match(rowExpand, /const dosageTrigger = event\.target\.closest\?\.\('\.registry-dosage-dose'\)/, 'Më shumë must expand through the row controller');
assert.match(rowExpand, /event\.stopImmediatePropagation\(\)/, 'a dosage click must never toggle twice');
assert.match(rowExpand, /syncDosageControls\(row, expanded\)/, 'row and dosage state must remain synchronized');
assert.match(rowExpand, /trigger\.setAttribute\('aria-expanded', String\(expanded\)\)/, 'assistive technology must receive disclosure state');
assert.match(rowExpand, /toggle\.textContent = expanded \? 'Më pak' : 'Më shumë'/, 'visible disclosure label must be truthful');
assert.match(rowExpand, /return fallback \? `row:\$\{fallback\}` : ''/, 'rows without IDs need stable disclosure state');
assert.match(rowExpand, /link\[data-registry-dosage-disclosure-fix-css\]/, 'the unclamped stylesheet must stay after compact styles');
assert.match(rowExpand, /const desiredTail = \[finalStyle, fullText, dosageDisclosure\]\.filter\(Boolean\)/, 'disclosure styles need one canonical order');
assert.match(rowExpand, /const alreadyStable = desiredTail\.length > 0/, 'cascade stabilization needs a no-write steady state');
assert.match(rowExpand, /if \(!alreadyStable\) desiredTail\.forEach\(node => document\.head\.appendChild\(node\)\)/, 'cascade writes must happen only when needed');
assert.doesNotMatch(rowExpand, /document\.head\.lastElementChild !== finalStyle/, 'head observer must not sustain its own mutation loop');
assert.match(rowExpand, /new CustomEvent\('medindex:registry-row-toggle'/, 'other UI layers must be able to observe disclosure changes');

assert.match(disclosureCss, /data-dosage-expanded="true"/, 'CSS needs a non-:has expanded-state selector');
assert.match(disclosureCss, /contain:none!important/, 'expanded cells must not remain contained or clipped');
assert.match(disclosureCss, /max-height:none!important/, 'expanded cells must lose compact max-height');
assert.match(disclosureCss, /overflow:visible!important/, 'expanded cells must lose overflow clipping');
assert.match(disclosureCss, /-webkit-line-clamp:unset!important/, 'expanded text must lose WebKit line clamp');
assert.match(disclosureCss, /line-clamp:unset!important/, 'expanded text must lose standards line clamp');
assert.match(disclosureCss, /@media \(max-width:760px\)/, 'mobile expansion rules must remain present');

assert.match(unified, /registry-unified-table-20260801-1/, 'single table controller must be active');
assert.doesNotMatch(unified, /observe\(document\.body|subtree\s*:\s*true/, 'single controller must not scan the whole page or table subtree');
assert.match(unified, /observer\.observe\(tbody, \{ childList:true \}\)/, 'table body observer must react only to page-row replacement');

assert.match(middleware, /'\/registry-parser-worker-v2\.js'/, 'v2 parser worker must pass through auth middleware');
assert.match(index, /registry-runtime-loader\.js\?v=20260803-unverified-1/, 'index must request the current bootstrap');
assert.match(index, /registry-row-expand\.js\?v=20260803-7/, 'index must request the current disclosure controller');
assert.match(index, /registry-dosage-disclosure-fix\.css\?v=20260803-3/, 'index must request the current disclosure stylesheet');
assert.match(index, /registry-unified-table\.js\?v=20260801-1/, 'index must load the single table controller');
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.js/, 'legacy table controllers must not load');
assert.doesNotMatch(index, /<script src="app-performance\.js"/, 'heavy registry application must not be parser ordered');
assert.ok(index.indexOf('registry-fast-start.js') < index.indexOf('registry-runtime-loader.js'), 'fast-start must precede registry startup');
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v6-unverified-visible/, 'index must preload the current generated runtime');
assert.match(index, /registry-dosage-loader\.js/, 'index must load the idle dosage loader');
assert.doesNotMatch(index, /src="registry-dosage-columns-v2\.js/, 'heavy dosage integration must not be in the critical parser path');
assert.match(builder, /app-runtime-performance\.js/, 'build must generate the cache-isolated runtime artifact');

console.log('Registry interaction resilience, loader v7 and idempotent full dosage disclosure audit passed.');
