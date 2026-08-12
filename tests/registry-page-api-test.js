'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const gatewaySource = fs.readFileSync(path.join(root, 'api/drug-search.js'), 'utf8');
const extraRegistryFunction = path.join(root, 'api/registry-page.js');

assert.equal(fs.existsSync(extraRegistryFunction), false, 'lightweight registry must reuse an existing API function on Vercel Hobby');

assert.match(gatewaySource, /REGISTRY_DEFAULT_PAGE_SIZE = 25/, 'registry list must default to 25 rows');
assert.match(gatewaySource, /REGISTRY_MAX_PAGE_SIZE = 50/, 'registry list must cap each visible page at 50 rows');
assert.match(gatewaySource, /view === 'registry-page'/, 'lightweight page mode is required');
assert.match(gatewaySource, /view === 'registry-detail'/, 'detail-on-demand mode is required');
assert.match(gatewaySource, /params\.set\('offset', String\(offset\)\)/, 'server-side OFFSET is required');
assert.match(gatewaySource, /Math\.min\(REGISTRY_MAX_PAGE_SIZE \+ 1, pageSize \+ 1\)/, 'count-free pagination must use one sentinel row');
assert.match(gatewaySource, /request\.includeTotal \? \{ prefer:'count=exact' \} : \{\}/, 'exact counts must only run when explicitly requested');
assert.match(gatewaySource, /is_published', 'eq\.true'/, 'only published drugs may be returned');
assert.match(gatewaySource, /editorial_status', 'eq\.published'/, 'editorial published gate is required');
assert.match(gatewaySource, /product_status', `eq\.\$\{status\}`/, 'status filter must remain server-side');
assert.match(gatewaySource, /pharmaceutical_form', `eq\.\$\{form\}`/, 'form filter must remain server-side');
assert.match(gatewaySource, /params\.set\('id', `eq\.\$\{id\}`\)/, 'detail reads must be targeted by drug id');
assert.match(gatewaySource, /params\.set\('limit', '1'\)/, 'detail reads must never return multiple drugs');
assert.match(gatewaySource, /REGISTRY_DETAIL_SELECT/, 'detail mode must use an explicit select contract');
assert.match(gatewaySource, /X-MedIndex-Data-Source', 'neon'/, 'Neon source observability header is required');

assert.match(gatewaySource, /SEARCH_CANDIDATE_LIMIT = 80/, 'drug search must use a bounded candidate set');
assert.match(gatewaySource, /SEARCH_HYDRATION_SELECT = 'id,source_payload'/, 'heavy source payload must only be used by targeted hydration');
const searchSelectBlock = gatewaySource.match(/const SEARCH_SELECT = \[([\s\S]*?)\]\.join\(','\);/);
assert.ok(searchSelectBlock, 'lightweight search select contract missing');
assert.doesNotMatch(searchSelectBlock[1], /source_payload/, 'candidate search must not transfer source_payload');
assert.match(gatewaySource, /params\.set\('id', `in\.\(\$\{ids\.join\(','\)\}\)`\)/, 'search hydration must target only ranked result ids');
assert.match(gatewaySource, /Math\.min\(MAX_RESULTS, ids\.length\)/, 'search hydration must be capped to final result count');
assert.match(gatewaySource, /registry-fallback-error/, 'full registry fallback is allowed only for an actual Neon search failure');
assert.doesNotMatch(gatewaySource, /registry-fallback-empty/, 'zero-result searches must not trigger a full registry transfer');
assert.match(gatewaySource, /X-MedIndex-Search-Source/, 'search source observability header is required');

assert.doesNotMatch(gatewaySource, /SELECT\s+\*/i, 'registry gateway must never SELECT *');
assert.doesNotMatch(gatewaySource, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i, 'registry gateway must not modify database schema');
assert.doesNotMatch(gatewaySource, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i, 'registry gateway must remain read-only');

console.log('Phase 1 lightweight registry gateway, Hobby function budget and bounded search contracts passed.');
