'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-i-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const decisions = read('data/drx-first100-canonical-review-decisions-v1.json');
const prior = ['a','b','c','d','e','f','g','h']
  .flatMap(letter => read(`data/drx-first100-source-discovery-wave-${letter}-v1.json`).rows);

assert.equal(wave.schemaVersion,'drx-first100-source-discovery-wave-i-v1');
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,5);
assert.equal(wave.sectionsPendingCount,0);
assert.equal(wave.rows.length,5);

const originalEligible = new Set(
  quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey)
);
const resolvedEligible = new Map(
  decisions.decisions
    .filter(x=>x.sourceDiscoveryEligible===true && x.resolvedCanonicalKey)
    .map(x=>[x.resolvedCanonicalKey,x])
);
const priorKeys = new Set(prior.map(x=>x.canonicalKey));
const seen = new Set();

for (const row of wave.rows) {
  const eligible = originalEligible.has(row.canonicalKey) || resolvedEligible.has(row.canonicalKey);
  assert.equal(eligible,true,row.canonicalKey+': not eligible by quality or reviewed resolution');
  assert.equal(priorKeys.has(row.canonicalKey),false,row.canonicalKey+': duplicate prior wave');
  assert.equal(seen.has(row.canonicalKey),false,row.canonicalKey+': duplicate Wave I');
  seen.add(row.canonicalKey);

  assert.ok(row.status.startsWith('verified_product_specific'));
  assert.ok(['AEMPS_CIMA','EU_NATIONAL'].includes(row.sourceTier));
  assert.match(row.url,/^https:\/\//);
  assert.match(row.documentDate,/^\d{4}-\d{2}(?:-\d{2})?$/);
  assert.equal(row.section41Present,true);
  assert.equal(row.section42Present,true);
  assert.ok(row.productName);
  assert.ok(row.authority);
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length>0);
  assert.equal(row.publicationAllowed,false);
}

const resolved = wave.rows.find(x=>x.canonicalKey==='amlodipineramipril');
assert.ok(resolved);
assert.equal(resolved.resolvedFromCanonicalKey,'amlodipinebesilate2ramipril');
assert.ok(resolvedEligible.has('amlodipineramipril'));
assert.match(resolved.url,/cima\.aemps\.es/);

for (const key of [
  'betamethasonedipropionateclotrimazolegentamicin',
  'chlorquinaldoltriamcinoloneacetonide',
  'clotrimazolemetronidazole',
  'chloramphenicolhydrocortisonemetronidazolenystatin',
]) {
  const row = wave.rows.find(x=>x.canonicalKey===key);
  assert.ok(row,key+': missing');
  assert.equal(row.authority,'ANMDMR Romania');
  assert.match(row.url,/anm\.ro/);
}

const meclodin=wave.rows.find(x=>x.canonicalKey==='clotrimazolemetronidazole');
assert.equal(meclodin.visualScreenshotStatus,'tool_internal_error_text_pdf_verified');

const cervugid=wave.rows.find(x=>x.canonicalKey==='chloramphenicolhydrocortisonemetronidazolenystatin');
assert.equal(cervugid.visualScreenshotStatus,'verified');

console.log('DRx first-100 official source discovery wave I contract passed.');
