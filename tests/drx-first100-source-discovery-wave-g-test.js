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

assert.equal(wave.schemaVersion, 'drx-first100-source-discovery-wave-g-v1');
assert.equal(wave.publicationAllowed, false);
assert.equal(wave.verifiedProductSpecificCount, 1);
assert.equal(wave.sectionsPendingCount, 0);
assert.equal(wave.productSelectionRequiredCount, 0);
assert.equal(wave.rows.length, 1);

const eligible = new Set(quality.rows.filter(x => x.sourceDiscoveryEligible === true).map(x => x.canonicalKey));
const priorKeys = new Set(prior.map(x => x.canonicalKey));

for (const row of wave.rows) {
  assert.ok(eligible.has(row.canonicalKey), row.canonicalKey + ': not eligible');
  assert.equal(priorKeys.has(row.canonicalKey), false, row.canonicalKey + ': already covered');
  assert.equal(row.publicationAllowed, false);
  assert.equal(row.status, 'verified_product_specific');
  assert.equal(row.sourceTier, 'AEMPS_CIMA');
  assert.match(row.url, /^https:\/\/cima\.aemps\.es\/cima\/dochtml\/ft\//);
  assert.equal(row.section41Present, true);
  assert.equal(row.section42Present, true);
  assert.match(row.documentDate, /^\d{4}-\d{2}$/);
  assert.equal(row.documentDatePrecision, 'month');
  assert.ok(Array.isArray(row.reviewFlags) && row.reviewFlags.length > 0);
}

const roasax = wave.rows[0];
assert.equal(roasax.canonicalKey, 'acetylsalicylicacidrosuvastatin');
assert.equal(roasax.sourceKey, 'cima-85514-ft');
assert.match(roasax.productName, /Roasax 20 mg\/100 mg/);
assert.ok(roasax.reviewFlags.includes('substitution_therapy_not_initial'));
assert.ok(roasax.reviewFlags.includes('clinical_review_required'));

console.log('DRx first-100 official source discovery wave G contract passed.');
