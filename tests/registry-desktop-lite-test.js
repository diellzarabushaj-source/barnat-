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
const phase11Patch = read('scripts/patch-phase11-desktop-advanced-lite.js');
const phase13Patch = read('scripts/patch-phase13-prescription-lite.js');
const api = read('api/drug-search.js');
const packageJson = JSON.parse(read('package.json'));

for (const file of [
  'registry-desktop-lite.js',
  'registry-runtime-loader.js',
  'registry-dosage-columns-v3.js',
  'registry-dose-clinical-row-markers.js',
  'scripts/patch-phase10-desktop-lite.js',
  'scripts/patch-phase11-desktop-advanced-lite.js',
  'scripts/patch-phase13-prescription-lite.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const desktopScript = 'registry-desktop-lite.js?v=20260812-1';
const loaderScript = 'registry-runtime-loader.js?v=20260813-10';
assert(index.includes(desktopScript), 'Desktop lightweight runtime must be present in the registry page.');
assert(index.includes(loaderScript), 'Single-owner runtime-loader cache bust must be active.');
assert(index.indexOf(desktopScript) < index.indexOf(loaderScript), 'Desktop lightweight runtime must initialize before the full-runtime loader.');
assert.doesNotMatch(index, /rel="preload" href="app-runtime-performance\.js/, 'The deferred full registry runtime must not be preloaded on normal lightweight visits.');

assert.match(desktop, /const VERSION = 'registry-desktop-lite-v1'/);
assert.match(desktop, /const API = '\/api\/drug-search'/);
assert.match(desktop, /view:'registry-page'/);
assert.match(desktop, /const DEFAULT_PAGE_SIZE = 50/);
assert.match(desktop, /const SERVER_PAGE_SIZE = 50/);
assert.match(desktop, /const MAX_LOGICAL_PAGE_SIZE = 500/);
assert.match(desktop, /pageSize:String\(boundedPageSize\)/, 'Every Neon registry-page request must remain capped to the bounded server page size.');
assert.match(desktop, /credentials:'same-origin', cache:'default', signal/, 'Desktop page requests must honor the private short-lived browser cache contract.');
assert.doesNotMatch(desktop, /credentials:'same-origin', cache:'no-store', signal/, 'Desktop lightweight page requests must not bypass the server-authorized private cache.');
assert.match(desktop, /sort:state\.sort/);
assert.match(desktop, /direction:state\.direction/);
assert.match(desktop, /params\.set\('q', state\.q\)/);
assert.match(desktop, /params\.set\('status', state\.status\)/);
assert.match(desktop, /params\.set\('formExact', state\.formValue\)/, 'Exact pharmaceutical form must stay on the lightweight server filter.');
assert.match(desktop, /params\.set\('formCategory', state\.formValue\)/, 'Pharmaceutical-form categories must stay on the lightweight server filter.');
assert.match(desktop, /const nextQuery = clean\(search\.value\)\.slice\(0, 80\)/, 'Desktop search must resolve a bounded settled query before requesting data.');
assert.match(desktop, /if \(nextQuery\.length === 1\) return;/, 'One-character desktop search must not trigger an unfiltered registry request.');
assert.match(desktop, /state\.total = null;\s*state\.totalPages = null;/, 'Count-free desktop searches must clear stale totals.');
assert.match(desktop, /loadPage\(\{ includeTotal:nextQuery\.length === 0, scroll:false \}\)/, 'Non-empty desktop search must skip exact total counting; clearing search restores it.');
assert.match(desktop, /desktopLiteHeaderSignature/, 'Desktop header rebuilds must be deduplicated by sort state.');
assert.match(desktop, /function onDesktopLitePaginationClick\(event\)/, 'Desktop pagination must use one delegated interaction handler.');
assert.match(desktop, /document\.getElementById\('pagination'\)\?\.addEventListener\('click', onDesktopLitePaginationClick\)/, 'Desktop pagination delegation must be bound once during control setup.');
assert.doesNotMatch(desktop, /pagination\.querySelector\('\[data-desktop-lite-page="(?:prev|next)"\]'\)\?\.addEventListener/, 'Desktop pagination must not rebind buttons on every render.');
assert.match(desktop, /medindex:registry-page-ready/);
assert.match(desktop, /MEDINDEX_REGISTRY_ROWS = canonical/);
assert.match(desktop, /medindex:request-full-registry/);
assert.doesNotMatch(desktop, /prescription-builder|prescription-selection|select-page-for-prescription/, 'Phase 13 prescription flow must remain lightweight until an explicit advanced handoff.');
assert.doesNotMatch(desktop, /desktop-full-detail/, 'Delegated row expansion/targeted detail must own normal desktop detail clicks without per-row full-runtime listeners.');
assert.doesNotMatch(desktop, /tbody\.querySelectorAll\('\[data-registry-column-key="trade-name"\]'\)\.forEach/, 'Desktop rendering must not attach one trade-name click listener per rendered row.');
assert.doesNotMatch(desktop, /\['colPickerBtn', 'column-picker'\]|column-picker/, 'Phase 14 column picker must stay on the bounded lightweight column runtime.');
assert.doesNotMatch(desktop, /\['formPickerBtn', 'form-picker'\]/, 'Form picker must not trigger the full registry in Phase 11.');
assert.doesNotMatch(desktop, /desktop-large-page-size/, '50/100/250/500 page-size selection must remain lightweight in Phase 11.');
assert.doesNotMatch(desktop, /\/api\/registry(?:\?|['"`])/, 'Normal desktop lightweight mode must not call the full registry endpoint.');
assert.doesNotMatch(desktop, /DRUG_DATA_PARTS/, 'Desktop lightweight mode must not hydrate the compressed full-registry payload.');

assert.match(loader, /const VERSION = 'registry-runtime-loader-v10'/);
assert.match(loader, /function desktopLiteCandidate\(\)/);
assert.match(loader, /desktop-lite-deferred/);
assert.match(loader, /registryDesktopLiteReady === '1'/);
assert.match(loader, /desktop-lite-timeout/);
assert.match(loader, /legacy-no-lite/);
assert.match(loader, /MOBILE_LITE_STALL_MS = 12000/);
assert.match(loader, /medindex:mobile-lite-stalled/);
assert.match(loader, /medindex:mobile-full-registry-blocked/);
assert.doesNotMatch(loader, /scheduleRuntime\('mobile-lite-timeout'\)/, 'Desktop Phase 10 patch must never restore the old mobile takeover.');
assert.doesNotMatch(loader, /scheduleRuntime\('desktop-or-legacy'\)/, 'Authenticated desktop must not eagerly launch the full desktop registry.');

assert.match(dosage, /registryIndexSource/);
assert.match(dosage, /function indexRegistryRows\(rows\)/);
assert.match(dosage, /registryIndexSource === rows/);
assert.match(dosage, /medindex:registry-page-ready/);
assert.match(dosage, /medindex:registry-data-ready/);
assert.match(dosage, /REQUEST_BATCH_SIZE = 100/, 'Visible dosage reads must remain bounded.');

assert.match(api, /REGISTRY_MAX_PAGE_SIZE = 50/);
assert.match(api, /REGISTRY_LIST_SELECT/);
assert.match(api, /request\.includeTotal \? \{ prefer:'count=exact' \} : \{\}/, 'Exact Neon count work must remain conditional on includeTotal.');
assert.match(api, /Cache-Control', 'private, max-age=30, stale-while-revalidate=120'/, 'Registry pages must remain private and short-lived when browser caching is enabled.');
assert.doesNotMatch(api, /params\.set\('select', '\*'\)/, 'Registry-page API must never regress to SELECT *.');

assert.match(phase10Patch, /ApprovedPopulation = require\('\.\.\/lib\/approved-population-handler\.js'\)/,
  'Phase 10 must reuse the existing approved-population snapshot on the server.');
assert.match(phase10Patch, /ApprovedPopulation\.snapshotItems\(\)/,
  'Approved population must be indexed locally from the existing snapshot, not fetched by the browser.');
assert.match(phase10Patch, /approvedPopulation:approvedPopulationForRegistryNumber\(row\.registry_number\)/,
  'Each lightweight registry row must carry its approved population metadata.');
assert.match(phase10Patch, /'Popullata e aprovuar':clean\(row\.approvedPopulation\)/,
  'Desktop canonical rows must expose approved population to downstream clinical UI.');
assert.match(phase10Patch, /registry-runtime-loader-v10/, 'Phase 10 build patch must preserve the single-owner v10 loader.');
assert.doesNotMatch(phase10Patch, /MOBILE_LITE_GRACE_MS = 5000/, 'Phase 10 build patch must not recreate the removed mobile timeout contract.');
assert.match(phase11Patch, /function patchDesktopSearchCounting\(\)/, 'Phase 11 must own the desktop search count optimization deterministically.');
assert.match(phase11Patch, /credentials:'same-origin', cache:'default', signal/, 'Phase 11 build must preserve private cache-friendly desktop page requests.');
assert.match(phase11Patch, /includeTotal:nextQuery\.length === 0/, 'Phase 11 build must preserve count-free non-empty desktop search.');
assert.match(phase13Patch, /patchHeaderRenderChurn/, 'Phase 13 must own desktop header rebuild deduplication.');
assert.match(phase13Patch, /patchPaginationDelegation/, 'Phase 13 must own delegated desktop pagination.');
assert.match(phase13Patch, /redundant per-row trade-name detail listeners/, 'Phase 13 must explicitly remove redundant row detail listeners during runtime build.');
assert.match(phase13Patch, /desktop-full-detail/, 'Phase 13 must fail the build if the old full-detail handoff returns.');
assert.match(marker, /medindex:registry-page-ready/,
  'Clinical row markers must rebuild population state whenever the lightweight page changes.');
assert.match(marker, /item\['Popullata e aprovuar'\]/,
  'Clinical row markers must read approved population from local row metadata.');
assert.doesNotMatch(marker, /fetch\s*\(/,
  'Clinical row markers must not perform a second browser request for population metadata.');
assert.doesNotMatch(marker, /\/api\/pediatric-only-population/,
  'The legacy pediatric-only endpoint must not be required by normal lightweight rendering.');

assert.match(packageJson.scripts['build:runtime'], /patch-phase10-desktop-lite\.js/, 'Phase 10 wiring must be deterministic in build:runtime.');
assert.match(packageJson.scripts['build:runtime'], /patch-phase11-desktop-advanced-lite\.js/, 'Phase 11-14 desktop lightweight build chain must remain deterministic.');
assert.match(packageJson.scripts.test, /registry-desktop-lite-test\.js/, 'Desktop lightweight regression test must run in the main test suite.');
assert.match(packageJson.scripts.test, /registry-desktop-large-page-lite-test\.js/, 'Phase 11-14 composed regression gate must run in the main test suite.');

console.log('Phase 14 desktop bounded pagination, private cache-aware requests, count-efficient search, stable header/pagination delegation, delegated row interactions, single-owner mobile loader, form filtering, inline population, targeted dosage, prescription and column customization contract passed.');
