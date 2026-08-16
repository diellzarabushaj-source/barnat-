'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const lite = read('registry-mobile-lite.js');
const phase8 = read('registry-mobile-phase8.js');
const css = read('registry-mobile-phase8.css');
const sharedPersonalization = read('registry-user-personalization.js');
const desktopRuntime = read('app-parts/part-02.txt');
const phase8Patch = read('scripts/patch-registry-phase8-personalization.js');
const phase2Patch = read('scripts/patch-phase2-mobile-card-stability.js');
const phase0Patch = read('scripts/patch-phase0-mobile-owner-boundary.js');
const packageJson = JSON.parse(read('package.json'));

for (const file of [
  'registry-mobile-lite.js',
  'registry-mobile-phase8.js',
  'registry-user-personalization.js',
  'scripts/patch-registry-phase8-personalization.js',
  'scripts/patch-phase2-mobile-card-stability.js',
  'scripts/patch-phase0-mobile-owner-boundary.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(index, /registry-mobile-phase8\.css\?v=20260816-2/);
assert.match(index, /registry-mobile-phase8\.js\?v=20260816-2/);
assert.match(index, /registry-user-personalization\.js\?v=20260816-7/);
assert(index.indexOf('registry-mobile-phase8.js') < index.indexOf('registry-runtime-loader.js'), 'Phase 8 must initialize before the full registry loader.');

assert.match(lite, /rows:\[\], \/\/ phase8-current-page/);
assert.match(lite, /state\.rows = payload\.rows\.map\(row => \(\{ \.\.\.row \}\)\)/);
assert.match(lite, /getRows:\(\) => state\.rows\.map/);
assert.match(lite, /renderLocalRows/);
assert.match(lite, /restoreCurrentPage/);
assert.match(lite, /renderRows\(Array\.isArray\(state\.rows\) \? state\.rows : \[\]\)/);

assert.match(phase8, /registry-mobile-phase8-v2/);
assert.match(phase8, /regjistriBarnave_favoritet_v1/);
assert.match(phase8, /regjistriBarnave_shenime_v1/);
assert.match(sharedPersonalization, /regjistriBarnave_favoritet_v1/);
assert.match(sharedPersonalization, /regjistriBarnave_shenime_v1/);
assert.match(desktopRuntime, /return String\(r\['PDID'\] \|\| ''\) \+ '\|' \+ String\(r\['Emri tregtar'\] \|\| ''\) \+ '\|' \+ String\(r\['Fortësia'\] \|\| ''\)/);
assert.match(phase8, /return pdid \|\| name \|\| strength \? `\$\{pdid\}\|\$\{name\}\|\$\{strength\}` : ''/);
assert.match(phase8, /pdid:clean\(row\.pdid\)/);
assert.match(phase8, /regjistriBarnave_teFundit_v1/);
assert.match(phase8, /MAX_RECENTS = 20/);
assert.match(phase8, /slice\(0, MAX_RECENTS\)/);
assert.match(phase8, /medindex:mobile-lite-detail-opened/);
assert.match(phase8, /saveRecent\(event\.detail\?\.row\)/);

assert.match(phase8, /data-mi-mobile-favorite/);
assert.match(phase8, /data-mi-mobile-note/);
assert.match(phase8, /data-mi-phase8-mode="notes"/);
assert.match(phase8, /data-mi-phase8-note-count/);
assert.match(phase8, /aria-pressed/);
assert.match(phase8, /aria-busy/);
assert.match(phase8, /medindex:favorites-changed/);
assert.match(phase8, /medindex:notes-changed/);
assert.match(phase8, /MedIndexUserLibrary\?\.syncNow/, 'Mobile favorite mutations must request durable user-library sync.');
assert.match(phase8, /MedIndexRegistryPersonalization\?\.editNoteForData/, 'Mobile note pencil must reuse the canonical editor.');
assert.match(phase8, /MedIndexRegistryPersonalization.*setView|controller\?\.setView/, 'Mobile personal views must reuse the canonical view controller.');
assert.match(phase8, /personal-view-\$\{next\}/, 'Mobile Favorites/Notes must explicitly request full-runtime handoff when needed.');
assert.match(phase8, /favoriteInFlight = new Set\(\)/, 'Rapid duplicate mobile favorite taps must be locked.');
assert.match(phase8, /renderLocalRows\?\.\(rows, `\$\{rows\.length\} të fundit`\)/, 'Only bounded recents may stay as a local rendered mode.');
assert.match(phase8, /restoreCurrentPage\?\.\(\)/);
assert.doesNotMatch(phase8, /function favoriteRows\(/, 'Favorites must no longer be approximated from partial local row metadata on phone.');
assert.doesNotMatch(phase8, /\bfetch\s*\(|\/api\//, 'Phase 8 must not create a parallel direct backend client.');

assert.match(sharedPersonalization, /registry-user-personalization-v3\.3\.0/);
assert.match(sharedPersonalization, /function phoneLiteOwnsViewport\(\)/);
assert.match(sharedPersonalization, /dataset\.registryMobileLiteState !== 'handoff'/);
assert.match(sharedPersonalization, /dataset\.registryPersonalization = 'mobile-lite-bridge'/);
assert.match(sharedPersonalization, /function editNoteForData\(data\)/);
assert.match(sharedPersonalization, /function noteKeyForData\(data\)/);
assert.match(sharedPersonalization, /editNoteForData,/);
assert.doesNotMatch(sharedPersonalization, /registry-personalization-phone-deferred-v1/);

assert.match(phase0Patch, /phoneLiteOwnsViewport/);
assert.match(phase0Patch, /editNoteForData/);
assert.match(phase0Patch, /registryMobileLiteState !== 'handoff'/, 'Phase 0 must verify explicit handoff instead of killing the shared controller.');
assert.doesNotMatch(phase0Patch, /const marker = 'registry-personalization-phone-deferred-v1'/, 'Phase 0 must not inject an early-return controller on phones.');

assert.match(phase8Patch, /function patchMobileActionRegion\(\)/, 'Phase 8 must publish the composed mobile action region before legacy stability auditing.');
assert.match(phase8Patch, /MedIndex revised Phase 2: explicit mobile card action region/, 'Phase 8 and Phase 2 must share one action-region compatibility marker.');
assert.match(phase8Patch, /grid-template-columns:44px 44px 78px!important/, 'Favorite, note and detail must each own a distinct mobile action slot.');
assert.match(phase8Patch, /patchMobileActionRegion\(\);\s*verifyAddon\(\);/, 'Action-region composition must run before the Phase 8 verification gate.');
assert.match(phase2Patch, /const explicitActionMarker = '\/\* MedIndex revised Phase 2: explicit mobile card action region \*\/'/, 'Legacy Phase 2 patch must recognize the composed action-region marker.');

assert.match(css, /@media \(max-width:767px\)/);
assert.match(css, /min-height:44px/);
assert.match(css, /width:44px/);
assert.match(css, /height:44px/);
assert.match(css, /\.mi-mobile-note-toggle\.has-note/);
assert.match(css, /focus-visible/);
assert.match(css, /:disabled/);
assert.match(css, /MedIndex revised Phase 2: explicit mobile card action region/, 'Built mobile CSS must carry the composed action-region contract.');
assert.match(css, /grid-template-columns:44px 44px 78px!important/, 'Built mobile CSS must reserve independent favorite, note and detail slots.');
assert.match(css, /\.mobile-lite-actions \.mi-mobile-favorite-toggle\{order:1\}/);
assert.match(css, /\.mobile-lite-actions \.mi-mobile-note-toggle\{order:2\}/);
assert.match(css, /\.mobile-lite-actions \.mobile-lite-more\{/);
assert.match(css, /@media \(min-width:768px\)/, 'Phase 8 UI must be hidden on desktop.');

assert.match(packageJson.scripts['build:runtime'], /patch-registry-phase8-personalization\.js/, 'Phase 8 patch must be deterministic in the build chain.');
assert.match(packageJson.scripts['build:runtime'], /patch-registry-phase8-personalization\.js && node scripts\/patch-phase2-mobile-card-stability\.js/, 'Phase 8 composition must run immediately before the legacy Phase 2 compatibility audit.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'mobile-favorites.js')), false, 'Phase 8 must not consume a Vercel function for favorites.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'recent-medicines.js')), false, 'Phase 8 must not consume a Vercel function for recents.');

console.log('Phase 5 regression gate: mobile canonical Favorites/Notes bridge, composed three-slot action region, bounded recents and 44px accessibility targets passed.');