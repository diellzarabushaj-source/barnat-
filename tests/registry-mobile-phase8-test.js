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
const desktopPersonalization = read('registry-user-personalization.js');
const desktopRuntime = read('app-parts/part-02.txt');
const packageJson = JSON.parse(read('package.json'));

for (const file of ['registry-mobile-lite.js','registry-mobile-phase8.js','scripts/patch-registry-phase8-personalization.js']) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(index, /registry-mobile-phase8\.css\?v=20260812-1/);
assert.match(index, /registry-mobile-phase8\.js\?v=20260812-1/);
assert(index.indexOf('registry-mobile-phase8.js') < index.indexOf('registry-runtime-loader.js'), 'Phase 8 must initialize before the full registry loader.');

assert.match(lite, /rows:\[\], \/\/ phase8-current-page/);
assert.match(lite, /state\.rows = payload\.rows\.map\(row => \(\{ \.\.\.row \}\)\)/);
assert.match(lite, /getRows:\(\) => state\.rows\.map/);
assert.match(lite, /renderLocalRows/);
assert.match(lite, /restoreCurrentPage/);
assert.match(lite, /renderRows\(Array\.isArray\(state\.rows\) \? state\.rows : \[\]\)/);

assert.match(phase8, /registry-mobile-phase8-v1/);
assert.match(phase8, /regjistriBarnave_favoritet_v1/);
assert.match(desktopPersonalization, /regjistriBarnave_favoritet_v1/);
assert.match(desktopRuntime, /return String\(r\['PDID'\] \|\| ''\) \+ '\|' \+ String\(r\['Emri tregtar'\] \|\| ''\) \+ '\|' \+ String\(r\['Fortësia'\] \|\| ''\)/);
assert.match(phase8, /return pdid \|\| name \|\| strength \? `\$\{pdid\}\|\$\{name\}\|\$\{strength\}` : ''/);
assert.match(phase8, /pdid:clean\(row\.pdid\)/);
assert.match(phase8, /regjistriBarnave_teFundit_v1/);
assert.match(phase8, /MAX_RECENTS = 20/);
assert.match(phase8, /slice\(0, MAX_RECENTS\)/);
assert.match(phase8, /medindex:mobile-lite-detail-opened/);
assert.match(phase8, /saveRecent\(event\.detail\?\.row\)/);
assert.match(phase8, /data-mi-mobile-favorite/);
assert.match(phase8, /aria-pressed/);
assert.match(phase8, /medindex:favorites-changed/);
assert.match(phase8, /renderLocalRows\?\.\(rows, label\)/);
assert.match(phase8, /restoreCurrentPage\?\.\(\)/);
assert.doesNotMatch(phase8, /\bfetch\s*\(|\/api\//, 'Phase 8 must remain local-first and add no backend/network reads.');

assert.match(css, /@media \(max-width:767px\)/);
assert.match(css, /min-height:44px/);
assert.match(css, /width:44px/);
assert.match(css, /height:44px/);
assert.match(css, /@media \(min-width:768px\)/, 'Phase 8 UI must be hidden on desktop.');

assert.match(packageJson.scripts['build:runtime'], /patch-registry-phase8-personalization\.js/, 'Phase 8 patch must be deterministic in the build chain.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'mobile-favorites.js')), false, 'Phase 8 must not consume a Vercel function for favorites.');
assert.equal(fs.existsSync(path.join(ROOT, 'api', 'recent-medicines.js')), false, 'Phase 8 must not consume a Vercel function for recents.');

console.log('Phase 8 desktop-compatible favorites, bounded recents, zero-network local lists and mobile touch targets passed.');
