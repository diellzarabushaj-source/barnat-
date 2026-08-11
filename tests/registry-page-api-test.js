'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pageSource = fs.readFileSync(path.resolve(__dirname, '../api/registry-page.js'), 'utf8');
const searchSource = fs.readFileSync(path.resolve(__dirname, '../api/drug-search.js'), 'utf8');

assert.match(pageSource, /DEFAULT_PAGE_SIZE = 25/, 'registry list must default to 25 rows');
assert.match(pageSource, /MAX_PAGE_SIZE = 50/, 'registry list must cap each request at 50 rows');
assert.match(pageSource, /params\.set\('limit', String\(pageSize\)\)/, 'server-side LIMIT is required');
assert.match(pageSource, /params\.set\('offset', String\(offset\)\)/, 'server-side OFFSET is required');
assert.match(pageSource, /is_published', 'eq\.true'/, 'only published drugs may be returned');
assert.match(pageSource, /editorial_status', 'eq\.published'/, 'editorial published gate is required');
assert.match(pageSource, /prefer:'count=exact'/, 'matching row count must be returned separately');
assert.match(pageSource, /X-MedIndex-Data-Source', 'neon'/, 'Neon source header is required');
assert.doesNotMatch(pageSource, /select[^\n]*\*/, 'lightweight list must never SELECT *');
assert.doesNotMatch(pageSource, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/, 'registry list must remain read-only');
assert.doesNotMatch(pageSource, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i, 'phase 1 must not modify database schema');

assert.match(searchSource, /SEARCH_CANDIDATE_LIMIT = 80/, 'drug search must use a bounded candidate set');
assert.match(searchSource, /params\.set\('limit', String\(SEARCH_CANDIDATE_LIMIT\)\)/, 'drug search must enforce its Neon LIMIT');
assert.match(searchSource, /is_published', 'eq\.true'/, 'drug search must only use published rows');
assert.match(searchSource, /editorial_status', 'eq\.published'/, 'drug search must keep the editorial published gate');
assert.match(searchSource, /X-MedIndex-Search-Source/, 'search source observability header is required');
assert.match(searchSource, /registry-fallback/, 'search must preserve a safe fallback path');
assert.doesNotMatch(searchSource, /SEARCH_SELECT[\s\S]{0,500}['"]\*['"]/, 'drug search must not select every column');
assert.doesNotMatch(searchSource, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|migration/i, 'drug search must not modify database schema');

console.log('Lightweight registry page and bounded search contracts passed.');
