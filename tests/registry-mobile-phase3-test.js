'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of [
  'registry-mobile-phase3.js',
  'registry-mobile-phase3.css',
  'registry-mobile-phone-hardening.css',
  'registry-mobile-phone-hardening.js',
  'registry-mobile-lite.js',
  'scripts/patch-phase2-mobile-card-stability.js',
  'index.html',
]) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
for (const file of [
  'registry-mobile-phase3.js',
  'registry-mobile-lite.js',
  'scripts/patch-phase2-mobile-card-stability.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

const js = read('registry-mobile-phase3.js');
const css = read('registry-mobile-phase3.css');
const phoneHardening = read('registry-mobile-phone-hardening.css');
const phoneHardeningRuntime = read('registry-mobile-phone-hardening.js');
const mobileLite = read('registry-mobile-lite.js');
const phase2Patch = read('scripts/patch-phase2-mobile-card-stability.js');
const index = read('index.html');

assert.match(js, /registry-mobile-phase3-v1/, 'Phase 3 runtime version is missing');
assert.match(js, /max-width: 767px/, 'Phase 3 must be phone-only');
assert.match(js, /Barnat[\s\S]*Kërko[\s\S]*Kategoritë[\s\S]*Recetat[\s\S]*Më shumë/, 'five-item mobile navigation is incomplete');
assert.match(js, /href="\/klasifikimi\.html"/, 'ATC categories shortcut is missing');
assert.match(js, /href="\/recetat\.html"/, 'prescriptions shortcut is missing');
assert.match(js, /data-mi-sidebar-toggle/, 'More must reuse the existing TailAdmin sidebar');
assert.match(js, /statusFilter/, 'Phase 3 filters must reuse the existing server-side status control');
assert.match(js, /pageSize/, 'Phase 3 filters must reuse the existing server-side page-size control');
assert.match(js, /data-mi-phase3-search-mode="atc"/, 'ATC search shortcut is missing');
assert.match(js, /data-mi-phase3-search-mode="form"/, 'pharmaceutical-form search shortcut is missing');
assert.match(js, /sheet\.parentElement !== document\.body[\s\S]*document\.body\.appendChild\(sheet\)/, 'filter sheet must escape the inert application shell before opening');

assert.match(js, /function modalSurfaceOpen\(\)/, 'Phase 3 must have one canonical transient-surface detector');
assert.match(js, /mi-sidebar-open[\s\S]*mi-mobile-search-open[\s\S]*mi-registry-filter-open[\s\S]*mobile-lite-detail-open/, 'all mobile modal surfaces must participate in navigation ownership');
assert.match(js, /root\.dataset\.miKeyboardOpen === 'true'/, 'software keyboard state must participate in navigation ownership');
assert.match(js, /nav\.inert = blocked/, 'bottom navigation must be non-interactive behind a modal surface or keyboard');
assert.match(js, /nav\.dataset\.miRegistryNavBlocked = String\(blocked\)/, 'bottom navigation must expose a deterministic blocked state');
assert.match(js, /nav\.setAttribute\('aria-hidden', String\(blocked\)\)/, 'bottom navigation accessibility state must follow visual blocking');
assert.match(js, /MedIndexMobileExperience\?\.closeSearch/, 'filters/sidebar flows must reuse the canonical mobile search closer');
assert.match(js, /medindex:mobile-keyboard-change/, 'Phase 3 must react to visualViewport keyboard changes');
assert.match(js, /medindex:mobile-search-opened/, 'Phase 3 must react when global mobile search opens');
assert.match(js, /medindex:mobile-search-closed/, 'Phase 3 must restore state when global mobile search closes');
assert.match(js, /bodyClassObserver = new MutationObserver\(syncBottomNavAvailability\)/, 'drawer/detail class changes must update bottom navigation deterministically');
assert.match(js, /registryMobilePhase3ModalPolicy = 'single-surface-v1'/, 'single-surface policy marker is missing');
assert.match(js, /MedIndexRegistryMobilePhase3 = Object\.freeze/, 'Phase 3 must expose a small diagnostic/control surface');
assert.doesNotMatch(js, /\bfetch\s*\(|\/api\//, 'Phase 3 must not create an independent data-fetching path');
assert.doesNotMatch(js, /MEDINDEX_REGISTRY_ROWS|DRUG_DATA_PARTS|DecompressionStream|Uint8Array\.from\(atob/, 'Phase 3 must not wake or rebuild the full registry dataset');

assert.match(mobileLite, /function onMobileLiteDetailClick\(event\)/, 'mobile detail interactions must use one delegated tbody handler');
assert.match(mobileLite, /event\.target\.closest\?\.\('\[data-mobile-lite-detail\]'\)/, 'delegated detail handler must resolve the clicked detail control');
assert.match(mobileLite, /getElementById\('tbody'\)\?\.addEventListener\('click', onMobileLiteDetailClick\)/, 'tbody must own the single mobile detail click listener');
assert.doesNotMatch(mobileLite, /querySelectorAll\('\[data-mobile-lite-detail\]'\)\.forEach/, 'row renders must not bind one detail listener per control');
assert.match(phase2Patch, /perControlDetailListeners/, 'Phase 2 build patch must remove legacy per-control detail listeners deterministically');
assert.match(phase2Patch, /onMobileLiteDetailClick/, 'Phase 2 build patch must preserve delegated mobile detail handling');

assert.match(css, /^@media \(max-width:767px\)/, 'Phase 3 CSS must be scoped to phones');
assert.match(css, /safe-area-inset-bottom/, 'bottom navigation must respect device safe areas');
assert.match(css, /\.mi-registry-bottom-nav/, 'bottom navigation styles are missing');
assert.match(css, /\.mi-registry-filter-sheet/, 'filter bottom-sheet styles are missing');
assert.match(css, /data-mi-registry-nav-blocked="true"/, 'blocked navigation must be hidden by its deterministic state marker');
assert.match(css, /body\.mi-sidebar-open \.mi-registry-bottom-nav/, 'bottom navigation must hide behind the sidebar');
assert.match(css, /body\.mi-mobile-search-open \.mi-registry-bottom-nav/, 'bottom navigation must hide behind global search');
assert.match(css, /body\.mi-registry-filter-open \.mi-registry-bottom-nav/, 'bottom navigation must hide behind the filter sheet');
assert.match(css, /body\.mobile-lite-detail-open \.mi-registry-bottom-nav/, 'bottom navigation must hide behind the drug detail sheet');
assert.match(css, /html\[data-mi-keyboard-open="true"\] \.mi-registry-bottom-nav/, 'bottom navigation must hide while the software keyboard is open');
assert.match(css, /visibility:hidden!important/, 'hidden bottom navigation must be removed from visual interaction, not only made transparent');
assert.match(css, /pointer-events:none!important/, 'hidden bottom navigation must not intercept touches');
assert.match(css, /data-registry-mobile-lite-state="handoff"/, 'mobile controls must disappear on full-runtime handoff');
assert.doesNotMatch(css, /https?:\/\//, 'Phase 3 styles must not load third-party assets');
assert.match(phoneHardening, /body\.mi-registry-filter-open > #miRegistryFilterSheet\.mi-registry-filter-sheet\{[\s\S]*z-index:2147483646!important;[\s\S]*pointer-events:auto!important;/, 'WebKit filter sheet must own the top hit-testing layer');
assert.match(phoneHardening, /#miRegistryFilterSheet :is\([\s\S]*button,[\s\S]*select[\s\S]*\)\{[\s\S]*pointer-events:auto!important;/, 'WebKit filter controls must remain pointer-interactive');
assert.match(phoneHardeningRuntime, /MedIndexRegistryMobilePhase3\.syncNavigation\(\)/, 'modal cleanup must return bottom-navigation ownership to Phase 3');
assert.doesNotMatch(phoneHardeningRuntime, /navWasInert/, 'modal cleanup must not restore a stale blocked-navigation snapshot');

assert.match(index, /registry-mobile-phase3\.css\?v=20260812-1/, 'Phase 3 stylesheet is not wired');
assert.match(index, /registry-mobile-phase3\.js\?v=20260812-1/, 'Phase 3 runtime is not wired');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-mobile-phase3.js'), 'Phase 2 mobile-lite must load before Phase 3');
assert.ok(index.indexOf('registry-mobile-phase3.js') < index.indexOf('registry-runtime-loader.js'), 'Phase 3 must load before the full runtime loader');
assert.ok(index.indexOf('registry-mobile-lite.css') < index.indexOf('registry-mobile-phase3.css'), 'Phase 3 CSS must refine Phase 2 mobile-lite');

console.log('Phase 3 phone navigation, delegated mobile detail handling, single-surface modal ownership, keyboard coordination, filter sheet and lightweight handoff contract passed.');
