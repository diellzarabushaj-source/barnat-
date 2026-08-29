'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-h-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const prior = ['a','b','c','d','e','f','g']
  .flatMap(letter => read(`data/drx-first100-source-discovery-wave-${letter}-v1.json`).rows);

assert.equal(wave.schemaVersion,'drx-first100-source-discovery-wave-h-v1');
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,3);
assert.equal(wave.sectionsPendingCount,0);
assert.equal(wave.rows.length,3);

const eligible = new Set(quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey));
const priorKeys = new Set(prior.map(x=>x.canonicalKey));
const seen = new Set();

for (const row of wave.rows) {
  assert.ok(eligible.has(row.canonicalKey), row.canonicalKey+': not eligible');
  assert.equal(priorKeys.has(row.canonicalKey), false, row.canonicalKey+': duplicate prior wave');
  assert.equal(seen.has(row.canonicalKey), false, row.canonicalKey+': duplicate Wave H');
  seen.add(row.canonicalKey);

  assert.ok(row.status.startsWith('verified_product_specific'));
  assert.equal(row.sourceTier,'EU_NATIONAL');
  assert.match(row.url,/^https:\/\//);
  assert.match(row.documentDate,/^\d{4}-\d{2}(?:-\d{2})?$/);
  assert.equal(row.section41Present,true);
  assert.equal(row.section42Present,true);
  assert.ok(row.productName);
  assert.ok(row.authority);
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length>0);
  assert.equal(row.publicationAllowed,false);
}

const baneocin=wave.rows.find(x=>x.canonicalKey==='bacitracinneomycin');
assert.match(baneocin.url,/medikamente\.basg\.gv\.at/);
assert.match(baneocin.productName,/Baneocin/);

const lisam=wave.rows.find(x=>x.canonicalKey==='amlodipinelisinopril');
assert.match(lisam.url,/medikamente\.basg\.gv\.at/);
assert.match(lisam.productName,/LisAm/);

const pepcid=wave.rows.find(x=>x.canonicalKey==='calciumcarbonatefamotidinemagnesiumhydroxide');
assert.match(pepcid.url,/assets\.hpra\.ie/);
assert.match(pepcid.productName,/Pepcid Duo/);

console.log('DRx first-100 official source discovery wave H contract passed.');
