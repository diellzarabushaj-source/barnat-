'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260829010508_phase3_ranked_registry_search_v2.sql'),
  'utf8'
);
const api = fs.readFileSync(path.join(ROOT, 'api', 'drug-search.js'), 'utf8');

assert.match(migration, /create\s+or\s+replace\s+function\s+public\.medindex_search_drugs_v2/i);
assert.match(migration, /language\s+plpgsql/i);
assert.match(migration, /stable/i);
assert.match(migration, /security\s+invoker/i);
assert.doesNotMatch(migration, /security\s+definer/i);
assert.match(migration, /set\s+search_path\s*=\s*pg_catalog,\s*public/i);
assert.match(migration, /least\(greatest\(coalesce\(p_limit,\s*20\),\s*1\),\s*20\)/i);
assert.match(migration, /registry_number\s*=\s*registry_candidate/i);
assert.match(migration, /'registry_exact'/);
assert.match(migration, /global_search_text\s+ilike\s+'%'\s*\|\|\s*q\s*\|\|\s*'%'/i);
assert.match(migration, /'trade_exact'/);
assert.match(migration, /'atc_prefix'/);
assert.match(migration, /'substance_prefix'/);
assert.match(migration, /'global_fuzzy'/);
assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.medindex_search_drugs_v2\(text,\s*integer\)\s+from\s+public/i);
assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.medindex_search_drugs_v2\(text,\s*integer\)[\s\S]*to\s+anon,\s*authenticated,\s*service_role/i);

assert.match(api, /path:'rpc\/medindex_search_drugs_v2'/);
assert.match(api, /method:'POST'/);
assert.match(api, /body:\{\s*p_query:q,\s*p_limit:(?:SEARCH_LIMIT|boundedLimit)\s*\}/);
assert.doesNotMatch(api, /privileged\s*:\s*true/);
assert.match(api, /searchVersion:'v(?:2|3|4)'/);
assert.match(api, /matchRank:Number\.isFinite/);
assert.match(api, /matchReason:clean\(row\.match_reason\)/);

const buildStart = api.indexOf('function buildSearchPath');
const buildEnd = api.indexOf('function setHeaders', buildStart);
assert(buildStart >= 0 && buildEnd > buildStart, 'Search request builder boundaries are missing.');
const builder = api.slice(buildStart, buildEnd);
assert.doesNotMatch(builder, /global_search_text/);
assert.doesNotMatch(builder, /drugs\?/);
assert.match(builder, /rpc\/medindex_search_drugs_v2/);

console.log('Phase 3 ranked registry search v2 contract passed.');
