'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gatewaySource = fs.readFileSync(path.join(root, 'api/drug-search.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'lib/supabase-data-api.js'), 'utf8');
const extraRegistryFunction = path.join(root, 'api/registry-page.js');

assert.equal(fs.existsSync(extraRegistryFunction), false, 'registry v2 must reuse /api/drug-search on Vercel Hobby');

assert.match(gatewaySource, /require\('\.\.\/lib\/supabase-data-api\.js'\)/, 'registry v2 must use the canonical Supabase data client');
assert.match(gatewaySource, /REGISTRY_DEFAULT_PAGE_SIZE = 25/, 'registry list must default to 25 rows');
assert.match(gatewaySource, /REGISTRY_MAX_PAGE_SIZE = 50/, 'registry list must cap each visible page at 50 rows');
assert.match(gatewaySource, /SEARCH_LIMIT = 20/, 'global drug search must stay bounded');
assert.match(gatewaySource, /view === 'registry-page'/, 'server-side registry page mode is required');
assert.match(gatewaySource, /view === 'registry-detail'/, 'detail-on-demand mode is required');
assert.match(gatewaySource, /params\.set\('offset', String\(offset\)\)/, 'server-side OFFSET is required');
assert.match(gatewaySource, /prefer:'count=exact'/, 'exact Supabase counts must be requested explicitly');
assert.match(gatewaySource, /is_published', 'eq\.true'/, 'only published drugs may be returned');
assert.match(gatewaySource, /editorial_status', 'eq\.published'/, 'editorial published gate is required');
assert.match(gatewaySource, /registry_search_text', `ilike\.\*\$\{q\}\*`/, 'indexed registry search must remain server-side');
assert.match(gatewaySource, /product_status', `eq\.\$\{status\}`/, 'status filter must remain server-side');
assert.match(gatewaySource, /pharmaceutical_form', `ilike\.\*\$\{form\}\*`/, 'form contains-filter must remain server-side');
assert.match(gatewaySource, /params\.set\('id', `eq\.\$\{id\}`\)/, 'detail reads must be targeted by drug id');
assert.match(gatewaySource, /params\.set\('limit', '1'\)/, 'detail reads must never return multiple drugs');
assert.match(gatewaySource, /const DETAIL_SELECT = \[/, 'detail mode must use an explicit select contract');
assert.match(gatewaySource, /X-MedIndex-Data-Source', 'supabase'/, 'Supabase source observability header is required');

const listSelectBlock = gatewaySource.match(/const LIST_SELECT = \[([\s\S]*?)\]\.join\(','\);/);
const searchSelectBlock = gatewaySource.match(/const SEARCH_SELECT = \[([\s\S]*?)\]\.join\(','\);/);
assert.ok(listSelectBlock, 'list select contract missing');
assert.ok(searchSelectBlock, 'search select contract missing');
assert.doesNotMatch(listSelectBlock[1], /source_payload/, 'visible pages must not transfer source_payload');
assert.doesNotMatch(searchSelectBlock[1], /source_payload/, 'global search must not transfer source_payload');
assert.match(gatewaySource, /global_search_text', `ilike\.\*\$\{q\}\*`/, 'global search must use the indexed generated search column');
assert.match(gatewaySource, /params\.set\('limit', String\(SEARCH_LIMIT\)\)/, 'global search must use a bounded limit');
assert.doesNotMatch(gatewaySource, /getPublishedDrugs|fetchPaged\('drugs'/, 'registry v2 must not download the full drug table into function memory');

assert.match(supabaseSource, /\/rest\/v1/, 'canonical client must target the Supabase Data API');
assert.match(supabaseSource, /MEDINDEX_SUPABASE_PUBLISHABLE_KEY/, 'Supabase publishable key configuration is required');
assert.doesNotMatch(supabaseSource, /neon/i, 'canonical registry v2 Supabase client must not contain Neon compatibility naming');

assert.doesNotMatch(gatewaySource, /SELECT\s+\*/i, 'registry gateway must never SELECT *');
assert.doesNotMatch(gatewaySource, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i, 'registry gateway must not modify database schema');
assert.doesNotMatch(gatewaySource, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i, 'registry gateway must remain read-only');

console.log('Registry v2 Supabase paging, indexed search, bounded payload and read-only contracts passed.');
