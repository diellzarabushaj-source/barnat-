const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

[
  'registry-mobile-lite.js',
  'registry-runtime-loader.js',
  'app-performance.js',
  'registry-parser-worker-v2.js',
  'registry-dosage-loader.js',
  'registry-dosage-columns-v3.js',
  'registry-unified-table.js',
  'scripts/build-static-runtime.js',
].forEach(syntax);

const index = read('index.html');
const mobile = read('registry-mobile-lite.js');
const runtimeLoader = read('registry-runtime-loader.js');
const bootstrap = read('app-performance.js');
const worker = read('registry-parser-worker-v2.js');
const part = read('app-parts/part-01.txt');
const loader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v3.js');
const unified = read('registry-unified-table.js');
const builder = read('scripts/build-static-runtime.js');
const middleware = read('middleware.ts');

assert.match(index, /registry-mobile-lite\.js\?v=20260812-1/);
assert.match(index, /registry-runtime-loader\.js\?v=20260812-7/);
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-runtime-loader.js'), 'mobile lightweight path must run before the full runtime loader');
assert.match(index, /registry-unified-table\.js\?v=20260801-1/);
assert.doesNotMatch(index, /<script src="app-performance\.js"/);
assert.match(index, /app-runtime-performance\.js/);
assert.match(index, /registry-dosage-loader\.js\?v=20260812-1/);
assert.doesNotMatch(index, /src="app\.js|src="registry-dosage-columns-v[23]\.js/);
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.js/);

assert.match(mobile, /registry-mobile-lite-v1/);
assert.match(mobile, /DEFAULT_PAGE_SIZE = 25/);
assert.match(mobile, /MAX_PAGE_SIZE = 50/);
assert.match(mobile, /SEARCH_DEBOUNCE_MS = 250/);
assert.match(mobile, /view:'registry-page'/);
assert.match(mobile, /view:'registry-detail'/);
assert.match(mobile, /medindex:mobile-lite-ready/);
assert.doesNotMatch(mobile, /MEDINDEX_REGISTRY_ROWS|medindex:registry-data-ready|medindex:registry-ready/, 'mobile lightweight mode must not impersonate full registry readiness');
assert.doesNotMatch(mobile, /DRUG_DATA_PARTS|DecompressionStream|Uint8Array\.from\(atob/);

assert.match(runtimeLoader, /registry-runtime-loader-v7/);
assert.match(runtimeLoader, /app-performance\.js\?v=20260801-2/);
assert.match(runtimeLoader, /classList\.contains\('auth-ready'\)/);
assert.match(runtimeLoader, /MOBILE_LITE_GRACE_MS = 5000/);
assert.match(runtimeLoader, /mobile-lite-deferred/);
assert.match(runtimeLoader, /desktop-or-legacy/);
assert.match(runtimeLoader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(/);
assert.doesNotMatch(runtimeLoader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/);

assert.match(bootstrap, /scheduleBrowserCacheSave/);
assert.match(bootstrap, /requestIdleCallback\(run/);
assert.match(bootstrap, /await loadRegistryRuntime\(\)/);
assert.ok(
  bootstrap.indexOf('await loadRegistryRuntime()') < bootstrap.lastIndexOf('scheduleBrowserCacheSave()'),
  'cache persistence must be re-scheduled after the UI runtime is ready'
);
assert.doesNotMatch(bootstrap, /JSON\.stringify\(window\.DRUG_DATA_PARTS\)/);
assert.doesNotMatch(bootstrap, /localStorage\.setItem\([^\n]*DRUG_DATA_PARTS/);
assert.match(bootstrap, /text\.indexOf\(prefix\)/, 'registry source parsing must avoid splitting the entire response');

assert.match(worker, /decodeBase64Parts/);
assert.match(worker, /DecompressionStream\('gzip'\)/);
assert.match(worker, /normalizeDrugRow/);
assert.match(worker, /MedIndexRegistryQuality\?\.applyRows/);
assert.match(worker, /REGISTRY_PROGRESS/);
assert.doesNotMatch(worker, /document\.|window\./);

assert.match(part, /window\.MEDINDEX_REGISTRY_ROWS = RAW/);
assert.match(part, /medindex:registry-data-ready/);
assert.match(part, /registry-parser-worker-v2\.js/);

assert.match(loader, /function schedule\(\)[\s\S]*requestIdleCallback\(run, \{ timeout:5000 \}\)/);
assert.match(loader, /addEventListener\('medindex:registry-ready', schedule, \{ once:true \}\)/);
assert.match(loader, /registry-dosage-columns-v3\.js/);
assert.match(loader, /dataset\.registryDosageRuntime/);

assert.match(dosage, /waitForRegistryRows/);
assert.match(dosage, /window\.MEDINDEX_REGISTRY_ROWS/);
assert.match(dosage, /INDEX_BATCH_SIZE = 250/);
assert.match(dosage, /REQUEST_BATCH_SIZE = 100/);
assert.match(dosage, /view=cards/);
assert.match(dosage, /await yieldToBrowser\(\)/);
assert.match(dosage, /disconnectTableObservers/);
assert.match(dosage, /existing\.innerHTML !== desired\.innerHTML/);
assert.doesNotMatch(dosage, /fetch\('\/api\/dosage'\s*,/);
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/);
assert.doesNotMatch(dosage, /observe\([^\n]+subtree\s*:\s*true/);

assert.match(unified, /const CLINICAL_ORDER = Object\.freeze/);
assert.match(unified, /observer\.observe\(header, \{ childList:true \}\)/);
assert.match(unified, /observer\.observe\(tbody, \{ childList:true \}\)/);
assert.doesNotMatch(unified, /subtree\s*:\s*true|observe\(document\.body/);
assert.match(unified, /lastGeometry/,'unified geometry must be idempotent');
assert.match(unified, /MEDINDEX_REGISTRY_TABLE_AUDIT/,'table alignment must expose an audit contract');

assert.match(builder, /runtimeOutputs/);
assert.match(builder, /app-runtime-performance\.js/);
assert.match(middleware, /registry-parser-worker-v2\.js/);

console.log('Registry isolated mobile lightweight loader v7, single controller and visible-row dosage main-thread audit passed.');
