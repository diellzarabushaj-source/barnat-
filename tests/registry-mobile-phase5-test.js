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
assert.match(api, /private, max-age=30, stale-while-revalidate=120/, 'registry page cache policy is missing');
assert.match(api, /private, max-age=60, stale-while-revalidate=300/, 'registry detail cache policy is missing');
assert.doesNotMatch(api, /select['"],\s*['"]\*/, 'Phase 5 must not introduce SELECT *');
assert.doesNotMatch(api, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i, 'Phase 5 registry gateway must not issue write HTTP methods');
assert.doesNotMatch(api, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|\bmigration\b/i, 'Phase 5 registry gateway must not change database schema');

assert.match(lite, /registry-mobile-lite-v2/, 'mobile-lite Phase 5 version is missing');
for (const field of ['atc', 'form', 'substance', 'indication', 'population']) {
  assert.match(lite, new RegExp(`params\\.set\\('${field}'`), `mobile-lite ${field} query parameter is missing`);
}
assert.match(lite, /function setFilters\(next = \{\}, options = \{\}\)/, 'single-request filter API is missing');
assert.match(lite, /medindex:mobile-lite-filters-changed/, 'filter state event is missing');
assert.match(lite, /function clearKnownTotal\(\{ resetCountOwner = true \} = \{\}\)/, 'search/filter count invalidation helper is missing');
assert.match(lite, /if \(resetCountOwner\) \{[\s\S]{0,220}countContextOwner = '';/, 'explicit count invalidation must release the exact-count context owner');
assert.match(lite, /if \(includeTotal\) clearKnownTotal\(\{ resetCountOwner:false \}\)/, 'duplicate includeTotal row loads must preserve the active exact-count owner');
assert.match(
  lite,
  /search\?\.addEventListener\('input',[\s\S]{0,500}pageController\?\.abort\(\);\s*pageController = null;\s*clearKnownTotal\(\);/,
  'typing must invalidate an in-flight mobile result set immediately, before the debounce expires',
);
assert.match(
  lite,
  /if \(nextQuery\.length === 1\) \{\s*state\.q = '';\s*setBusy\(false\);\s*return;\s*\}/,
  'single-character search must clear stale query state without refetching the unfiltered registry',
);
assert.match(lite, /setBusy\(true\);\s*searchTimer = window\.setTimeout/, 'mobile search must expose pending debounce work after invalidating stale results');
assert.match(lite, /includeTotal:nextQuery\.length === 0/, 'typing search must skip exact counts and restore totals only when search clears');
assert.ok((lite.match(/cache:'default'/g) || []).length >= 3, 'mobile row, count and detail fetches must honor bounded HTTP cache headers');
assert.doesNotMatch(lite, /cache:'no-store'/, 'mobile bounded list/count/detail requests must not defeat their server cache policy');

assert.match(lite, /let pageRequestEpoch = 0/, 'mobile row requests must have monotonic ownership.');
assert.match(lite, /let countRequestEpoch = 0/, 'mobile exact-count refreshes must have independent ownership.');
assert.match(lite, /function mobileCountContextKey\(\)/, 'mobile exact counts must be tied to the active filter context.');
assert.match(lite, /function mobileExactCountUrl\(\)/, 'mobile exact counts must use a dedicated bounded request URL.');
assert.match(lite, /url\.searchParams\.set\('pageSize', '1'\)/, 'mobile exact-count requests must transfer only the minimum row payload.');
assert.match(lite, /fetch\(buildPageUrl\(\{ includeTotal:false \}\)/, 'mobile visible rows must always use the count-free critical path.');
assert.doesNotMatch(lite, /fetch\(buildPageUrl\(\{ includeTotal \}\)/, 'mobile rows must never wait for count=exact.');
assert.match(lite, /if \(includeTotal\) scheduleMobileExactTotal\(\)/, 'mobile requested totals must be scheduled only after rows render.');
assert.match(lite, /contextKey !== mobileCountContextKey\(\)/, 'stale mobile exact counts must not publish into a newer filter context.');
assert.match(lite, /requestEpoch !== pageRequestEpoch \|\| pageController !== controller \|\| controller\.signal\.aborted/, 'stale mobile row responses must not commit.');
assert.match(lite, /if \(pageController === controller\)/, 'only the newest mobile row request may clear the busy state.');
assert.match(lite, /medindex:mobile-lite-count-ready/, 'mobile exact-count completion must publish independently of row readiness.');

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

console.log('Phase 5/17 advanced filters + immediate search invalidation + non-blocking mobile count + bounded HTTP cache contract passed.');
