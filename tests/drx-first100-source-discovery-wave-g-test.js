'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-g-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const prior = ['a','b','c','d','e','f']
  .flatMap(letter => read(`data/drx-first100-source-discovery-wave-${letter}-v1.json`).rows);

assert.equal(wave.schemaVersion,'drx-first100-source-discovery-wave-g-v1');
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,4);
assert.equal(wave.sectionsPendingCount,0);
assert.equal(wave.rows.length,4);

const eligible = new Set(quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey));
const priorKeys = new Set(prior.map(x=>x.canonicalKey));
const seen = new Set();

for (const row of wave.rows) {
  assert.ok(eligible.has(row.canonicalKey), row.canonicalKey+': not eligible');
  assert.equal(priorKeys.has(row.canonicalKey), false, row.canonicalKey+': duplicate prior wave');
  assert.equal(seen.has(row.canonicalKey), false, row.canonicalKey+': duplicate Wave G');
  seen.add(row.canonicalKey);

  assert.ok(row.status.startsWith('verified_'));
  assert.equal(row.sourceTier,'AEMPS_CIMA');
  assert.match(row.url,/^https:\/\/cima\.aemps\.es\/cima\/dochtml\/ft\//);
  assert.match(row.documentDate,/^\d{4}-\d{2}(?:-\d{2})?$/);
  assert.equal(row.section41Present,true);
  assert.equal(row.section42Present,true);
  assert.ok(row.productName);
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length>0);
  assert.equal(row.publicationAllowed,false);
}

assert.ok(seen.has('acetylsalicylicacidrosuvastatin'));
assert.ok(seen.has('bezafibrate'));
assert.ok(seen.has('betamethasonedipropionategentamicin'));
assert.ok(seen.has('betamethasonevalerategentamicin'));

console.log('DRx first-100 official source discovery wave G contract passed.');
