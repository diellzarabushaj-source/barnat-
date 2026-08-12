'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['registry-mobile-phase3.js', 'registry-mobile-phase3.css', 'index.html']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-mobile-phase3.js')], { stdio:'pipe' });

const js = read('registry-mobile-phase3.js');
const css = read('registry-mobile-phase3.css');
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
assert.doesNotMatch(js, /\bfetch\s*\(|\/api\//, 'Phase 3 must not create an independent data-fetching path');
assert.doesNotMatch(js, /MEDINDEX_REGISTRY_ROWS|DRUG_DATA_PARTS|DecompressionStream|Uint8Array\.from\(atob/, 'Phase 3 must not wake or rebuild the full registry dataset');

assert.match(css, /^@media \(max-width:767px\)/, 'Phase 3 CSS must be scoped to phones');
assert.match(css, /safe-area-inset-bottom/, 'bottom navigation must respect device safe areas');
assert.match(css, /\.mi-registry-bottom-nav/, 'bottom navigation styles are missing');
assert.match(css, /\.mi-registry-filter-sheet/, 'filter bottom-sheet styles are missing');
assert.match(css, /data-registry-mobile-lite-state="handoff"/, 'mobile controls must disappear on full-runtime handoff');
assert.doesNotMatch(css, /https?:\/\//, 'Phase 3 styles must not load third-party assets');

assert.match(index, /registry-mobile-phase3\.css\?v=20260812-1/, 'Phase 3 stylesheet is not wired');
assert.match(index, /registry-mobile-phase3\.js\?v=20260812-1/, 'Phase 3 runtime is not wired');
assert.ok(index.indexOf('registry-mobile-lite.js') < index.indexOf('registry-mobile-phase3.js'), 'Phase 2 mobile-lite must load before Phase 3');
assert.ok(index.indexOf('registry-mobile-phase3.js') < index.indexOf('registry-runtime-loader.js'), 'Phase 3 must load before the full runtime loader');
assert.ok(index.indexOf('registry-mobile-lite.css') < index.indexOf('registry-mobile-phase3.css'), 'Phase 3 CSS must refine Phase 2 mobile-lite');

console.log('Phase 3 phone navigation, filter sheet and lightweight handoff contract passed.');