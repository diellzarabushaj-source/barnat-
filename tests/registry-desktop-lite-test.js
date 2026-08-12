'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const desktop = read('registry-desktop-lite.js');
const loader = read('registry-runtime-loader.js');
const dosage = read('registry-dosage-columns-v3.js');
const marker = read('registry-dose-clinical-row-markers.js');
const phase10Patch = read('scripts/patch-phase10-desktop-lite.js');
const api = read('api/drug-search.js');
const packageJson = JSON.parse(read('package.json'));

for (const file of [
  'registry-desktop-lite.js',
  'registry-runtime-loader.js',
  'registry-dosage-columns-v3.js',
  'registry-dose-clinical-row-markers.js',
  'scripts/patch-phase10-desktop-lite.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const desktopScript = 'registry-desktop-lite.js?v=20260812-1';
const loaderScript = 'registry-runtime-loader.js?v=20260812-8';
assert(index.includes(desktopScript), 'Desktop lightweight runtime must be present in the registry page.');
assert(index.includes(loaderScript), 'Phase 10 runtime-loader cache bust must be active.');
assert(index.indexOf(desktopScript) < index.indexOf(loaderScript), 'Desktop lightweight runtime must initialize before the full-runtime loader.');
assert.doesNotMatch(index, /rel="preload" href="app-runtime-performance\.js/, 'The deferred full registry runtime must not be preloaded on normal lightweight visits.');

assert.match(desktop, /const VERSION = 'registry-desktop-lite-v1'/);
assert.match(desktop, /const API = '\/api\/drug-search'/);
assert.match(desktop, /view:'registry-page'/);
assert.match(desktop, /const DEFAULT_PAGE_SIZE = 50/);
assert.match(desktop, /pageSize:String\(state\.pageSize\)/);
assert.match(desktop, /sort:state\.sort/);
assert.match(desktop, /direction:state\.direction/);
assert.match(desktop, /params\.set\('q', state\.q\)/);
assert.match(desktop, /params\.set\('status', state\.status\)/);
assert.match(desktop, /medindex:registry-page-ready/);
assert.match(desktop, /MEDINDEX_REGISTRY_ROWS = canonical/);
assert.match(desktop, /medindex:request-full-registry/);
assert.match(desktop, /prescription-builder/);
assert.match(desktop, /column-picker/);
assert.match(desktop, /form-picker/);
assert.match(desktop, /desktop-large-page-size/);
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])/, 'Normal desktop lightweight mode must not call the full registry endpoint.');
assert.doesNotMatch(desktop, /DRUG_DATA_PARTS/, 'Desktop lightweight mode must not hydrate the compressed full-registry payload.');

assert.match(loader, /const VERSION = 'registry-runtime-loader-v8'/);
assert.match(loader, /function desktopLiteCandidate\(\)/);
assert.match(loader, /desktop-lite-deferred/);
assert.match(loader, /registryDesktopLiteReady === '1'/);
assert.match(loader, /desktop-lite-timeout/);
assert.match(loader, /legacy-no-lite/);
assert.doesNotMatch(loader, /scheduleRuntime\('desktop-or-legacy'\)/, 'Authenticated desktop must not eagerly launch the full registry runtime.');

assert.match(dosage, /registryIndexSource/);
assert.match(dosage, /function indexRegistryRows\(rows\)/);
assert.match(dosage, /registryIndexSource === rows/);
assert.match(dosage, /medindex:registry-page-ready/);
assert.match(dosage, /medindex:registry-data-ready/);
assert.match(dosage, /REQUEST_BATCH_SIZE = 100/, 'Visible dosage reads must remain bounded.');

assert.match(api, /REGISTRY_MAX_PAGE_SIZE = 50/);
assert.match(api, /REGISTRY_LIST_SELECT/);
assert.doesNotMatch(api, /params\.set\('select', '\*'\)/, 'Registry-page API must never regress to SELECT *.');

assert.match(phase10Patch, /ApprovedPopulation = require\('\.\.\/lib\/approved-population-handler\.js'\)/,
  'Phase 10 must reuse the existing approved-population snapshot on the server.');
assert.match(phase10Patch, /ApprovedPopulation\.snapshotItems\(\)/,
  'Approved population must be indexed locally from the existing snapshot, not fetched by the browser.');
assert.match(phase10Patch, /approvedPopulation:approvedPopulationForRegistryNumber\(row\.registry_number\)/,
  'Each lightweight registry row must carry its approved population metadata.');
assert.match(phase10Patch, /'Popullata e aprovuar':clean\(row\.approvedPopulation\)/,
  'Desktop canonical rows must expose approved population to downstream clinical UI.');
assert.match(marker, /medindex:registry-page-ready/,
  'Clinical row markers must rebuild population state whenever the lightweight page changes.');
assert.match(marker, /item\['Popullata e aprovuar'\]/,
  'Clinical row markers must read approved population from local row metadata.');
assert.doesNotMatch(marker, /fetch\s*\(/,
  'Clinical row markers must not perform a second browser request for population metadata.');
assert.doesNotMatch(marker, /\/api\/pediatric-only-population/,
  'The legacy pediatric-only endpoint must not be required by normal lightweight rendering.');

assert.match(packageJson.scripts['build:runtime'], /patch-phase10-desktop-lite\.js/, 'Phase 10 wiring must be deterministic in build:runtime.');
assert.match(packageJson.scripts.test, /registry-desktop-lite-test\.js/, 'Phase 10 regression test must run in the main test suite.');

console.log('Phase 10 desktop pagination, inline population metadata, deferred full-registry handoff and page-aware targeted dosage contract passed.');
