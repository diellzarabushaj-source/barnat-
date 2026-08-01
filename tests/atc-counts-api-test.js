const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'api/atc-counts.js'), 'utf8');
const endpoint = require(path.join(ROOT, 'api/atc-counts.js'));

assert.equal(endpoint.categoryCode('N02BE01'), 'N02');
assert.equal(endpoint.categoryCode(' n 02 be01 '), 'N02');
assert.equal(endpoint.categoryCode('R02AAXX'), 'R02');
assert.equal(endpoint.categoryCode('R05CAXX'), 'R05');
assert.equal(endpoint.categoryCode('N/A'), '');
assert.equal(endpoint.categoryCode(''), '');

const summary = endpoint.countRows([
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
assert.match(source, /registryHandler\.getRegistryDataset\(\)/, 'ATC counts must use the canonical registry dataset');
assert.match(source, /private, max-age=120, stale-while-revalidate=600/, 'ATC counts must use a bounded private cache');
assert.match(source, /module\.exports\.countRows = countRows/, 'The count logic must remain directly testable');

console.log('ATC category counts API tests passed.');
