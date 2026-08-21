'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const desktop = read('registry-desktop-lite.js');
const api = read('api/drug-search.js');
const patch = read('scripts/patch-phase17-desktop-filter-stability.js');
const migration = read('supabase/migrations/20260821141518_optimize_drug_registry_search_and_sort.sql');
const advancedFilterMigration = read('supabase/migrations/20260821142422_optimize_drug_registry_advanced_filters.sql');
const globalSearchMigration = read('supabase/migrations/20260821143031_optimize_drug_global_search_candidates.sql');
const packageJson = JSON.parse(read('package.json'));

execFileSync(process.execPath, ['--check', path.join(ROOT, 'scripts/patch-phase17-desktop-filter-stability.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'registry-desktop-lite.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(ROOT, 'api/drug-search.js')], { stdio:'pipe' });

assert.match(desktop, /let pageRequestEpoch = 0/, 'Desktop registry must track a monotonic request epoch.');
assert.match(desktop, /const requestEpoch = \+\+pageRequestEpoch/, 'Every page/filter load must claim a new request epoch.');
assert.match(
  desktop,
  /requestEpoch !== pageRequestEpoch \|\| pageController !== controller \|\| controller\.signal\.aborted/,
  'Late or superseded responses must not be allowed to publish table state.',
);
assert.match(
  desktop,
  /if \(error\?\.name === 'AbortError' \|\| requestEpoch !== pageRequestEpoch\) return/,
  'Errors from superseded requests must stay silent and must not replace a newer table state.',
);

assert.match(desktop, /function syncDesktopSearchState\(\)/, 'Filters must share one settled search-state synchronizer.');
assert.match(desktop, /window\.clearTimeout\(searchTimer\);\s*searchTimer = 0;/, 'A filter change must cancel pending search debounce work before requesting rows.');
assert.match(desktop, /state\.q = raw\.length >= 2 \? raw : ''/, 'One-character search input must not leave a stale older query active.');

assert.match(
  desktop,
  /status\?\.addEventListener\('change',[\s\S]{0,260}syncDesktopSearchState\(\)[\s\S]{0,260}includeTotal:state\.q\.length === 0/,
  'Status filtering must coalesce with pending search and avoid exact count work for combined search.',
);
assert.match(
  desktop,
  /state\.pageSize = [\s\S]{0,300}includeTotal:state\.q\.length === 0/,
  'Page-size changes must retain the settled search and avoid count work while searching.',
);
assert.match(
  desktop,
  /if \(state\.formType === nextType && state\.formValue === nextValue\) return/,
  'Repeated selection of the active pharmaceutical-form filter must be a no-op.',
);
assert.match(
  desktop,
  /selectDesktopForm\(type, value\)[\s\S]{0,520}syncDesktopSearchState\(\)[\s\S]{0,520}includeTotal:state\.q\.length === 0/,
  'Form filtering must coalesce with pending search and skip exact counts for combined search.',
);

const builderStart = api.indexOf('function buildRegistryPagePath(query = {}) {');
const builderEnd = api.indexOf('\n  return {', builderStart);
assert.ok(builderStart >= 0 && builderEnd > builderStart, 'Registry-page query builder must be present.');
const builder = api.slice(builderStart, builderEnd);
assert.match(
  builder,
  /params\.set\('registry_search_text', `ilike\.\$\{pattern\}`\)/,
  'Registry table free-text search must use the generated trigram-indexed search column.',
);
assert.doesNotMatch(
  builder,
  /params\.set\('or'/,
  'Registry table free-text search must not regress to nine-column OR ILIKE sequential scans.',
);
assert.match(builder, /params\.set\('active_substance', `ilike\.\*\$\{substance\}\*`\)/, 'Substance filtering must remain server-side.');
assert.match(builder, /params\.set\('use_text', `ilike\.\*\$\{indication\}\*`\)/, 'Indication filtering must remain server-side.');
assert.match(builder, /params\.set\('atc_code', `ilike\.\$\{atc\}\*`\)/, 'ATC filtering must remain server-side.');

const globalStart = api.indexOf('async function neonSearchRows(rawQuery) {');
const globalEnd = api.indexOf('\n}\n\nfunction rankedRows', globalStart);
assert.ok(globalStart >= 0 && globalEnd > globalStart, 'Global drug candidate search function must be present.');
const globalSearch = api.slice(globalStart, globalEnd);
assert.match(
  globalSearch,
  /params\.set\('global_search_text', `ilike\.\*\$\{token\}\*`\)/,
  'Global search candidates must use the generated trigram-indexed candidate column.',
);
assert.doesNotMatch(
  globalSearch,
  /params\.set\('or'/,
  'Global candidate search must not regress to the eight-column OR ILIKE scan.',
);
assert.match(globalSearch, /limit', String\(SEARCH_CANDIDATE_LIMIT\)/, 'Global candidate fetch must remain bounded.');

assert.match(migration, /create extension if not exists pg_trgm with schema extensions/i, 'Trigram support must be reproducible from migrations.');
assert.match(migration, /registry_search_text text[\s\S]*generated always as/i, 'Registry search text must be a stored generated column.');
assert.match(migration, /drugs_published_registry_search_trgm_idx[\s\S]*gin \(registry_search_text extensions\.gin_trgm_ops\)/i, 'Published registry search must have a partial trigram GIN index.');
for (const indexName of [
  'drugs_published_trade_name_registry_idx',
  'drugs_published_active_substance_registry_idx',
  'drugs_published_atc_registry_idx',
  'drugs_published_strength_registry_idx',
  'drugs_published_form_registry_idx',
  'drugs_published_status_registry_idx',
  'drugs_published_retail_price_registry_idx',
]) {
  assert.match(migration, new RegExp(indexName), `Missing registry sort/filter index ${indexName}.`);
}

for (const [column, indexName] of [
  ['active_substance', 'drugs_published_active_substance_trgm_idx'],
  ['use_text', 'drugs_published_use_text_trgm_idx'],
  ['atc_code', 'drugs_published_atc_trgm_idx'],
]) {
  assert.match(advancedFilterMigration, new RegExp(indexName), `Missing advanced filter trigram index ${indexName}.`);
  assert.match(
    advancedFilterMigration,
    new RegExp(`gin \\(${column} extensions\\.gin_trgm_ops\\)`, 'i'),
    `${column} advanced filter must use pg_trgm GIN.`,
  );
}
assert.match(
  advancedFilterMigration,
  /where is_published = true and editorial_status = 'published'/i,
  'Advanced filter indexes must stay partial to the published registry working set.',
);

assert.match(globalSearchMigration, /global_search_text text[\s\S]*generated always as/i, 'Global candidate search text must be stored and reproducible.');
for (const field of ['trade_name', 'active_substance', 'atc_code', 'drug_class', 'use_text', 'strength', 'pharmaceutical_form', 'packaging']) {
  assert.match(globalSearchMigration, new RegExp(`coalesce\\(${field}, ''\\)`), `Global candidate search must preserve ${field}.`);
}
assert.match(
  globalSearchMigration,
  /drugs_published_global_search_trgm_idx[\s\S]*gin \(global_search_text extensions\.gin_trgm_ops\)/i,
  'Global candidate search must have a partial trigram GIN index.',
);

assert.match(patch, /table\/global candidate searches use trigram-indexed paths/);
assert.match(
  packageJson.scripts['build:runtime'],
  /patch-phase17-desktop-filter-stability\.js/,
  'The final stability/performance patch must run on every production build.',
);
assert.match(
  packageJson.scripts.test,
  /registry-filter-concurrency-test\.js/,
  'The registry concurrency/performance regression gate must run in the main suite.',
);

console.log('Registry request ownership + indexed table/global search audit passed: hot filters and candidate search stay on bounded trigram-indexed paths.');
