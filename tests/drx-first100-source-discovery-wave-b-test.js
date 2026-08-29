'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-b-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const waveA = read('data/drx-first100-source-discovery-wave-a-v1.json');

assert.equal(wave.schemaVersion, 'drx-first100-source-discovery-wave-b-v1');
assert.equal(wave.publicationAllowed, false);
assert.equal(wave.verifiedProductSpecificCount, 14);
assert.equal(wave.productSelectionRequiredCount, 0);
assert.equal(wave.rows.length, 14);

const eligible = new Map(
  quality.rows.filter(row => row.sourceDiscoveryEligible === true)
    .map(row => [row.canonicalKey, row])
);
const waveAKeys = new Set(waveA.rows.map(row => row.canonicalKey));
const seen = new Set();

for (const row of wave.rows) {
  assert.ok(eligible.has(row.canonicalKey), row.canonicalKey + ': not source-discovery eligible');
  assert.equal(waveAKeys.has(row.canonicalKey), false, row.canonicalKey + ': duplicate of wave A');
  assert.equal(seen.has(row.canonicalKey), false, row.canonicalKey + ': duplicate in wave B');
  seen.add(row.canonicalKey);

  assert.equal(row.status, 'verified_product_specific');
  assert.equal(row.sourceTier, 'EMC');
  assert.match(row.sourceKey, /^emc-\d+-smpc$/);
  assert.match(row.url, /^https:\/\/www\.medicines\.org\.uk\/emc\/product\/\d+\/smpc$/);
  assert.match(row.documentDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(row.section41Present, true);
  assert.equal(row.section42Present, true);
  assert.ok(row.productName);
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length > 0);
  assert.equal(row.publicationAllowed, false);
}

console.log('DRx first-100 source discovery wave B contract passed.');
