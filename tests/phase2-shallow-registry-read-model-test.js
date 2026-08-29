'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260829005849_phase2_shallow_registry_read_model.sql'),
  'utf8'
);
const api = fs.readFileSync(path.join(ROOT, 'api', 'drug-search.js'), 'utf8');

assert.match(migration, /create\s+or\s+replace\s+view\s+public\.medindex_atc_counts_v1/i);
assert.match(migration, /with\s*\(security_invoker\s*=\s*true\)/i);
assert.match(migration, /from\s+public\.drugs/i);
assert.match(migration, /is_published\s*=\s*true/i);
assert.match(migration, /editorial_status\s*=\s*'published'/i);
assert.match(migration, /grant\s+select\s+on\s+public\.medindex_atc_counts_v1[\s\S]*to\s+anon,\s*authenticated,\s*service_role/i);

for (const view of [
  'medindex_all_drug_search_v2',
  'medindex_all_drugs_public_v2',
  'medindex_all_product_search_v3',
  'medindex_all_product_search_v4',
  'medindex_all_products_public_v3',
  'medindex_all_products_public_v4',
  'medindex_product_categories_v1',
  'medindex_product_categories_v2',
  'medindex_catalog_categories',
  'medindex_catalog_public',
  'medindex_catalog_search',
]) {
  assert.ok(migration.includes(`public.${view}`), `Phase 2 must quarantine ${view}`);
}

assert.match(migration, /revoke\s+select[\s\S]*from\s+anon,\s*authenticated/i);
assert.match(migration, /grant\s+select[\s\S]*to\s+service_role/i);

assert.match(api, /const\s+ATC_COUNTS_VIEW\s*=\s*'medindex_atc_counts_v1'/);
assert.match(api, /params\.set\('select',\s*'category_code,product_count'\)/);
assert.match(api, /countAtcAggregateRows/);

const atcFetchStart = api.indexOf('async function fetchAtcCountRowsFromSupabase');
const atcFetchEnd = api.indexOf('// Legacy exported name kept', atcFetchStart);
assert(atcFetchStart >= 0 && atcFetchEnd > atcFetchStart, 'ATC fetch function boundaries missing');
const atcFetch = api.slice(atcFetchStart, atcFetchEnd);
assert.doesNotMatch(atcFetch, /drugs\?/);
assert.doesNotMatch(atcFetch, /offset/);

console.log('Phase 2 shallow registry read model contract passed.');
