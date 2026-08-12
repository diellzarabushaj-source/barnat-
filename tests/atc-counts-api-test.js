const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'api/drug-search.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const endpoint = require(path.join(ROOT, 'api/drug-search.js'));

assert.equal(endpoint.atcCategoryCode('N02BE01'), 'N02');
assert.equal(endpoint.atcCategoryCode(' n 02 be01 '), 'N02');
assert.equal(endpoint.atcCategoryCode('R02AAXX'), 'R02');
assert.equal(endpoint.atcCategoryCode('R05CAXX'), 'R05');
assert.equal(endpoint.atcCategoryCode('N/A'), '');
assert.equal(endpoint.atcCategoryCode(''), '');

const summary = endpoint.countAtcRows([
  { 'ATC Code':'N02BE01' },
  { 'ATC Code':'N02CC01' },
  { 'ATC Code':'N03AX14' },
  { 'ATC Code':'R02AAXX' },
  { 'ATC Code':'R05CAXX' },
  { 'ATC Code':'N/A' },
]);

assert.equal(summary.total, 6);
assert.equal(summary.classifiedTotal, 5);
assert.equal(summary.unclassifiedTotal, 1);
assert.deepEqual({ ...summary.counts }, { N02:2, N03:1, R02:1, R05:1 });
assert.deepEqual({ ...summary.groupCounts }, { N:3, R:2 });

assert.equal(endpoint.ATC_COUNTS_PAGE_SIZE, 250, 'ATC projection must stay within the Neon 250-row egress guard.');
assert.equal(endpoint.ATC_COUNTS_MAX_ROWS, 6000, 'ATC projection needs a hard upper bound.');
assert.equal(endpoint.ATC_COUNTS_CACHE_TTL_MS, 30 * 60 * 1000, 'ATC counts should keep a warm hard cache for thirty minutes.');
assert.equal(endpoint.ATC_COUNTS_REVISION_CHECK_MS, 60 * 1000, 'ATC counts should validate the lightweight registry revision once per minute.');
assert.equal(typeof endpoint.fetchAtcCountRowsFromNeon, 'function');
assert.equal(typeof endpoint.neonAtcCounts, 'function');

assert.match(source, /phase6-atc-counts-neon-v2/, 'Phase 6 ATC revision-aware runtime marker is missing.');
assert.match(source, /registryHandler\.authorized\(req\)/, 'ATC counts must require the same private authentication as the registry');
assert.match(source, /view === 'atc-counts'/, 'The existing drug-search function must expose the ATC counts view');
assert.match(source, /params\.set\('select', 'registry_number,atc_code'\)/, 'ATC counts must fetch only the tiny registry-number/ATC projection');
assert.match(source, /params\.set\('is_published', 'eq\.true'\)/, 'ATC counts must include only published drugs');
assert.match(source, /params\.set\('editorial_status', 'eq\.published'\)/, 'ATC counts must include only editorially published drugs');
assert.match(source, /params\.set\('order', 'registry_number\.asc'\)/, 'ATC pagination must be deterministic');
assert.match(source, /params\.set\('limit', String\(ATC_COUNTS_PAGE_SIZE\)\)/, 'ATC reads must be bounded per request');
assert.match(source, /params\.set\('offset', String\(offset\)\)/, 'ATC reads must page instead of requesting the whole table');
assert.match(source, /RegistryRevision\.getRegistryRevision\(\{ maxAgeMs:ATC_COUNTS_REVISION_CHECK_MS \}\)/, 'ATC counts must validate the lightweight Neon registry revision');
assert.match(source, /cacheState:'revision-hit'/, 'An unchanged registry revision must reuse the existing ATC summary without rereading all ATC rows');
assert.match(source, /source:'memory-stale-atc'/, 'A warm stale in-memory ATC summary should survive a transient Neon failure');
assert.match(source, /Retry-After', '30'/, 'A cold ATC failure must be throttled instead of falling back to the full registry');
assert.match(source, /private, max-age=120, stale-while-revalidate=600/, 'ATC counts must use a bounded private HTTP cache');
assert.match(source, /module\.exports\.countAtcRows = countAtcRows/, 'The count logic must remain directly testable');

const atcStart = source.indexOf("if (view === 'atc-counts')");
const atcEnd = source.indexOf('const rawQuery', atcStart);
assert(atcStart >= 0 && atcEnd > atcStart, 'ATC handler boundaries are missing.');
const atcHandler = source.slice(atcStart, atcEnd);
assert.doesNotMatch(atcHandler, /getRegistryDataset\s*\(/, 'ATC counts must never build the full registry dataset on the normal path');
assert.match(atcHandler, /status\(503\)/, 'Cold upstream ATC failures must fail in a controlled way');

assert.ok(
  vercel.rewrites.some(rule => rule.source === '/api/atc-counts' && rule.destination === '/api/drug-search?view=atc-counts'),
  'The friendly ATC counts route must reuse the existing drug-search function slot'
);
assert.equal(fs.existsSync(path.join(ROOT, 'api/atc-counts.js')), false, 'ATC counts must not consume a separate Vercel function slot');

console.log('Phase 6 revision-aware Neon ATC category counts, bounded projection and no-full-registry tests passed.');
