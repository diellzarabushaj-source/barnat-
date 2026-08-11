'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../api/registry-page.js'), 'utf8');

assert.match(source, /DEFAULT_PAGE_SIZE = 25/, 'registry list must default to 25 rows');
assert.match(source, /MAX_PAGE_SIZE = 50/, 'registry list must cap each request at 50 rows');
assert.match(source, /params\.set\('limit', String\(pageSize\)\)/, 'server-side LIMIT is required');
assert.match(source, /params\.set\('offset', String\(offset\)\)/, 'server-side OFFSET is required');
assert.match(source, /is_published', 'eq\.true'/, 'only published drugs may be returned');
assert.match(source, /editorial_status', 'eq\.published'/, 'editorial published gate is required');
assert.match(source, /prefer:'count=exact'/, 'matching row count must be returned separately');
assert.match(source, /X-MedIndex-Data-Source', 'neon'/, 'Neon source header is required');
assert.doesNotMatch(source, /select[^\n]*\*/, 'lightweight list must never SELECT *');
assert.doesNotMatch(source, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/, 'registry list must remain read-only');
assert.doesNotMatch(source, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i, 'phase 1 must not modify database schema');

console.log('Lightweight registry page API contract passed.');
