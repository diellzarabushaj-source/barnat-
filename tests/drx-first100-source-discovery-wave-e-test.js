'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave=read('data/drx-first100-source-discovery-wave-e-v1.json');
const quality=read('data/drx-first100-canonical-quality-audit-v1.json');
const old=[
  ...read('data/drx-first100-source-discovery-wave-a-v1.json').rows,
  ...read('data/drx-first100-source-discovery-wave-b-v1.json').rows,
  ...read('data/drx-first100-source-discovery-wave-c-v1.json').rows,
  ...read('data/drx-first100-source-discovery-wave-d-v1.json').rows,
];

assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,7);
assert.equal(wave.rows.length,7);

const eligible=new Set(quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey));
const oldKeys=new Set(old.map(x=>x.canonicalKey));
const seen=new Set();

for(const row of wave.rows){
  assert.ok(eligible.has(row.canonicalKey),row.canonicalKey+': not eligible');
  assert.equal(oldKeys.has(row.canonicalKey),false,row.canonicalKey+': already covered');
  assert.equal(seen.has(row.canonicalKey),false,row.canonicalKey+': duplicate wave E');
  seen.add(row.canonicalKey);
  assert.match(row.status,/^verified_product_specific(?:_component_normalization_review|_salt_hydrate_review)?$/);
  assert.equal(row.sourceTier,'EMC');
  assert.match(row.sourceKey,/^emc-\d+-smpc$/);
  assert.match(row.url,/^https:\/\/www\.medicines\.org\.uk\/emc\/product\/\d+\/smpc$/);
  assert.match(row.documentDate,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(row.section41Present,true);
  assert.equal(row.section42Present,true);
  assert.ok(Array.isArray(row.reviewFlags)&&row.reviewFlags.length>0);
  assert.equal(row.publicationAllowed,false);
}
console.log('DRx first-100 source discovery wave E contract passed.');
