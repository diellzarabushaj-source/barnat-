'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-f-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const prior = ['a','b','c','d','e']
  .flatMap(letter => read(`data/drx-first100-source-discovery-wave-${letter}-v1.json`).rows);

assert.equal(wave.schemaVersion,'drx-first100-source-discovery-wave-f-v1');
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,6);
assert.equal(wave.sectionsPendingCount,1);
assert.equal(wave.rows.length,7);

const eligible = new Set(quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey));
const priorKeys = new Set(prior.map(x=>x.canonicalKey));
const seen = new Set();

for (const row of wave.rows) {
  assert.ok(eligible.has(row.canonicalKey), row.canonicalKey+': not eligible');
  assert.equal(priorKeys.has(row.canonicalKey), false, row.canonicalKey+': already covered');
  assert.equal(seen.has(row.canonicalKey), false, row.canonicalKey+': duplicate');
  seen.add(row.canonicalKey);
  assert.equal(row.publicationAllowed,false);
  assert.ok(row.productName);
  assert.match(row.documentDate,/^\d{4}-\d{2}(?:-\d{2})?$/);
  if (/^\d{4}-\d{2}$/.test(row.documentDate)) {
    assert.equal(row.documentDatePrecision,'month');
  }
  if (row.status.startsWith('verified_')) {
    assert.equal(row.sourceTier,'AEMPS_CIMA');
    assert.match(row.url,/^https:\/\/cima\.aemps\.es\/cima\/dochtml\/ft\//);
    assert.equal(row.section41Present,true);
    assert.equal(row.section42Present,true);
  } else {
    assert.equal(row.status,'official_source_found_sections_visual_verification_pending');
    assert.equal(row.sourceTier,'EMA');
    assert.equal(row.section41Present,null);
    assert.equal(row.section42Present,null);
  }
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length>0);
}

const ovitrelle = wave.rows.find(x=>x.canonicalKey==='choriogonadotropinalfa');
assert.match(ovitrelle.documentDateSource,/EMA Product Information/);
assert.match(ovitrelle.versionCrosscheckUrl,/ema\.europa\.eu/);

console.log('DRx first-100 official source discovery wave F contract passed.');
