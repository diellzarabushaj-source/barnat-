const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

[
  'app-performance.js',
  'registry-parser-worker-v2.js',
  'registry-dosage-loader.js',
  'registry-dosage-columns-v2.js',
  'scripts/build-static-runtime.js',
].forEach(syntax);

const index = read('index.html');
const bootstrap = read('app-performance.js');
const worker = read('registry-parser-worker-v2.js');
const part = read('app-parts/part-01.txt');
const loader = read('registry-dosage-loader.js');
const dosage = read('registry-dosage-columns-v2.js');
const builder = read('scripts/build-static-runtime.js');
const middleware = read('middleware.ts');

assert.match(index, /app-performance\.js/);
assert.match(index, /app-runtime-performance\.js/);
assert.match(index, /registry-dosage-loader\.js/);
assert.doesNotMatch(index, /src="app\.js|src="registry-dosage-columns(?:-v2)?\.js/);

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

assert.match(loader, /medindex:registry-ready/);
assert.match(loader, /requestIdleCallback\(run, \{ timeout:5000 \}\)/);
assert.match(loader, /registry-dosage-columns-v2\.js/);
assert.match(loader, /dataset\.registryDosageRuntime/);
assert.ok(loader.indexOf('medindex:registry-ready') < loader.indexOf('requestIdleCallback'), 'dosage loading must be gated by registry readiness before idle scheduling');

assert.match(dosage, /waitForRegistryRows/);
assert.match(dosage, /window\.MEDINDEX_REGISTRY_ROWS/);
assert.match(dosage, /INDEX_BATCH_SIZE = 250/);
assert.match(dosage, /await yieldToBrowser\(\)/);
assert.match(dosage, /disconnectTableObservers/);
assert.match(dosage, /existing\.innerHTML !== desired\.innerHTML/);
assert.doesNotMatch(dosage, /DRUG_DATA_PARTS|\batob\s*\(|DecompressionStream|Uint8Array/);
assert.doesNotMatch(dosage, /observe\([^\n]+subtree\s*:\s*true/);

assert.match(builder, /runtimeOutputs/);
assert.match(builder, /app-runtime-performance\.js/);
assert.match(middleware, /registry-parser-worker-v2\.js/);

console.log('Registry main-thread deep audit passed.');
