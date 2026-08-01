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
assert.deepEqual({ ...summary.counts }, {
  N02:2,
  N03:1,
  R02:1,
  R05:1,
});
assert.deepEqual({ ...summary.groupCounts }, {
  N:3,
  R:2,
});

assert.match(source, /registryHandler\.authorized\(req\)/, 'ATC counts must require the same private authentication as the registry');
assert.match(source, /view === 'atc-counts'/, 'The existing drug-search function must expose the ATC counts view');
assert.match(source, /registryHandler\.getRegistryDataset\(\)/, 'ATC counts must use the canonical registry dataset');
assert.match(source, /private, max-age=120, stale-while-revalidate=600/, 'ATC counts must use a bounded private cache');
assert.match(source, /module\.exports\.countAtcRows = countAtcRows/, 'The count logic must remain directly testable');
assert.ok(
  vercel.rewrites.some(rule => rule.source === '/api/atc-counts' && rule.destination === '/api/drug-search?view=atc-counts'),
  'The friendly ATC counts route must reuse the existing drug-search function slot'
);
assert.equal(fs.existsSync(path.join(ROOT, 'api/atc-counts.js')), false, 'ATC counts must not consume a separate Vercel function slot');

console.log('ATC category counts API tests passed.');
