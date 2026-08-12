'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const file of ['api/drug-search.js', 'registry-mobile-lite.js', 'registry-mobile-phase3.js', 'registry-mobile-phase3.css', 'index.html']) {
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
}
execFileSync(process.execPath, ['--check', path.join(ROOT, 'api/drug-search.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-mobile-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-mobile-phase3.js')], { stdio:'pipe' });

const api = read('api/drug-search.js');
const lite = read('registry-mobile-lite.js');
const phase3 = read('registry-mobile-phase3.js');
const css = read('registry-mobile-phase3.css');
const index = read('index.html');

assert.match(api, /REGISTRY_POPULATIONS = new Set\(\['adult_only', 'pediatric_only', 'both'\]\)/, 'population allow-list is missing');
assert.match(api, /adult:dosage_regimens!inner\(\)/, 'adult population inner join is missing');
assert.match(api, /pediatric:dosage_regimens!inner\(\)/, 'pediatric population inner join is missing');
assert.match(api, /params\.set\('pediatric', 'is\.null'\)/, 'adult-only anti-join is missing');
assert.match(api, /params\.set\('adult', 'is\.null'\)/, 'pediatric-only anti-join is missing');
assert.match(api, /params\.set\('atc_code', `ilike\.\$\{atc\}\*`\)/, 'ATC prefix filtering is missing');
assert.match(api, /params\.set\('active_substance', `ilike\.\*\$\{substance\}\*`\)/, 'active-substance filtering is missing');
assert.match(api, /params\.set\('use_text', `ilike\.\*\$\{indication\}\*`\)/, 'indication filtering is missing');
assert.match(api, /params\.set\('pharmaceutical_form', `ilike\.\*\$\{form\}\*`\)/, 'form filtering is missing');
assert.doesNotMatch(api, /select['"],\s*['"]\*/, 'Phase 5 must not introduce SELECT *');
assert.doesNotMatch(api, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i, 'Phase 5 gateway must stay read-only');

assert.match(lite, /registry-mobile-lite-v2/, 'mobile-lite Phase 5 version is missing');
for (const field of ['atc', 'form', 'substance', 'indication', 'population']) {
  assert.match(lite, new RegExp(`params\\.set\\('${field}'`), `mobile-lite ${field} query parameter is missing`);
}
assert.match(lite, /function setFilters\(next = \{\}, options = \{\}\)/, 'single-request filter API is missing');
assert.match(lite, /medindex:mobile-lite-filters-changed/, 'filter state event is missing');

assert.match(phase3, /registry-mobile-phase3-v2/, 'advanced filter sheet version is missing');
for (const id of ['miPhase3Population', 'miPhase3Atc', 'miPhase3Substance', 'miPhase3Form', 'miPhase3Indication']) {
  assert.match(phase3, new RegExp(id), `${id} is missing from the filter sheet`);
}
assert.match(phase3, /api\.setFilters\(filters, \{ load:true, scroll:false \}\)/, 'filter sheet must use the mobile-lite server gateway once');
assert.doesNotMatch(phase3, /\bfetch\s*\(/, 'filter UI must not create a second networking path');
assert.doesNotMatch(phase3, /MEDINDEX_REGISTRY_ROWS|DRUG_DATA_PARTS/, 'advanced filters must not wake the full registry');

assert.match(css, /\.mi-registry-filter-grid/, 'advanced filter grid styles are missing');
assert.match(css, /:is\(select,input\)/, 'filter input styling is missing');
assert.match(css, /min-height:48px/, 'mobile filter controls must preserve touch size');
assert.match(index, /registry-mobile-lite\.js\?v=20260812-2/, 'mobile-lite Phase 5 cache key is missing');
assert.match(index, /registry-mobile-phase3\.js\?v=20260812-2/, 'advanced filter cache key is missing');

console.log('Phase 5 advanced ATC, form, substance, indication, population and status server-side filter contract passed.');
