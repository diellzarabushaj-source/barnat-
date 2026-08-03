const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

[
  'registry-runtime-loader.js',
  'app-performance.js',
  'registry-parser-worker-v2.js',
  'registry-dosage-loader.js',
  'registry-dosage-columns-v2.js',
  'registry-row-expand.js',
  'registry-unified-table.js',
  'scripts/build-static-runtime.js',
].forEach(syntax);

const index = read('index.html');
const runtimeLoader = read('registry-runtime-loader.js');
const bootstrap = read('app-performance.js');
const worker = read('registry-parser-worker-v2.js');
const part = read('app-parts/part-01.txt');
const loader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v2.js');
const rowExpand = read('registry-row-expand.js');
const disclosureCss = read('registry-dosage-disclosure-fix.css');
const unified = read('registry-unified-table.js');
const builder = read('scripts/build-static-runtime.js');
const middleware = read('middleware.ts');

assert.match(index, /registry-runtime-loader\.js\?v=20260803-unverified-1/);
assert.match(index, /registry-row-expand\.js\?v=20260803-6/);
assert.match(index, /registry-dosage-disclosure-fix\.css\?v=20260803-3/);
assert.match(index, /registry-unified-table\.js\?v=20260801-1/);
assert.doesNotMatch(index, /<script src="app-performance\.js"/);
assert.match(index, /app-runtime-performance\.js\?v=clinical-audit-v6-unverified-visible/);
assert.match(index, /registry-dosage-loader\.js/);
assert.doesNotMatch(index, /src="app\.js|src="registry-dosage-columns(?:-v2)?\.js/);
assert.doesNotMatch(index, /(?:registry-table-integrity|registry-clinical-view|registry-tailgrids-refinement|registry-columns-filters|registry-table-final)\.js/);
assert.match(runtimeLoader, /registry-runtime-loader-v7-unverified-visible/);
assert.match(runtimeLoader, /app-performance\.js\?v=20260803-unverified-1/);
assert.match(runtimeLoader, /classList\.contains\('auth-ready'\)/);
assert.match(runtimeLoader, /requestAnimationFrame\(\(\) => \{[\s\S]*loadRuntime\(\)/);
assert.doesNotMatch(runtimeLoader, /FIRST_INTERACTION_FALLBACK_MS|POST_INTERACTION_GRACE_MS|MEDINDEX_REGISTRY_UI_READY\s*=\s*new Promise/);

assert.match(bootstrap, /clinical-audit-v6-unverified-visible/);
assert.match(bootstrap, /registry-parts-prescription-v2/);
assert.match(bootstrap, /barnat-registry-cached-at-v5/);
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
assert.match(loader, /registry-dosage-columns-v2\.js/);
assert.match(loader, /dataset\.registryDosageRuntime/);

assert.match(dosage, /waitForRegistryRows/);
assert.match(dosage, /window\.MEDINDEX_REGISTRY_ROWS/);
assert.match(dosage, /INDEX_BATCH_SIZE = 250/);
assert.match(dosage, /await yieldToBrowser\(\)/);
assert.match(dosage, /disconnectTableObservers/);
assert.match(dosage, /existing\.innerHTML !== desired\.innerHTML/);
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/);
assert.doesNotMatch(dosage, /observe\([^\n]+subtree\s*:\s*true/);

assert.match(rowExpand, /registry-row-expand-20260803-6/);
assert.match(rowExpand, /document\.addEventListener\('click', onClick, true\)/);
assert.match(rowExpand, /const dosageTrigger = event\.target\.closest\?\.\('\.registry-dosage-dose'\)/);
assert.match(rowExpand, /event\.stopImmediatePropagation\(\)/);
assert.match(rowExpand, /syncDosageControls\(row, expanded\)/);
assert.match(rowExpand, /data-registry-dosage-disclosure-fix-css/);
assert.match(rowExpand, /new CustomEvent\('medindex:registry-row-toggle'/);
assert.doesNotMatch(rowExpand, /setInterval|document\.body.*subtree\s*:\s*true/);

assert.match(disclosureCss, /data-dosage-expanded="true"/);
assert.match(disclosureCss, /contain:none!important/);
assert.match(disclosureCss, /max-height:none!important/);
assert.match(disclosureCss, /overflow:visible!important/);
assert.match(disclosureCss, /-webkit-line-clamp:unset!important/);

assert.match(unified, /const CLINICAL_ORDER = Object\.freeze/);
assert.match(unified, /observer\.observe\(header, \{ childList:true \}\)/);
assert.match(unified, /observer\.observe\(tbody, \{ childList:true \}\)/);
assert.doesNotMatch(unified, /subtree\s*:\s*true|observe\(document\.body/);
assert.match(unified, /lastGeometry/,'unified geometry must be idempotent');
assert.match(unified, /MEDINDEX_REGISTRY_TABLE_AUDIT/,'table alignment must expose an audit contract');

assert.match(builder, /runtimeOutputs/);
assert.match(builder, /app-runtime-performance\.js/);
assert.match(middleware, /registry-parser-worker-v2\.js/);

console.log('Registry loader v7, full dosage disclosure, single controller and main-thread deep audit passed.');
