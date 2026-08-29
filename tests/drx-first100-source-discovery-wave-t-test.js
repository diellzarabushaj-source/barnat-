'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Policy = require('../lib/dose-source-policy.js');
const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const wave = read('data/drx-first100-source-discovery-wave-t-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const decisions = read('data/drx-first100-canonical-review-decisions-v1.json');
const prior = [...'abcdefghijklmnopqrs'].flatMap(letter =>
  read('data/drx-first100-source-discovery-wave-' + letter + '-v1.json').rows
);
assert.equal(wave.verifiedProductSpecificCount, 1);
assert.equal(wave.sectionsPendingCount, 0);
assert.equal(wave.rows.length, 1);
assert.equal(wave.publicationAllowed, false);
const priorKeys = new Set(prior.map(row => row.canonicalKey));
const eligible = new Set(quality.rows.filter(row => row.sourceDiscoveryEligible).map(row => row.canonicalKey));
const resolved = new Set(decisions.decisions
  .filter(row => row.sourceDiscoveryEligible && row.resolvedCanonicalKey)
  .map(row => row.resolvedCanonicalKey));
for (const row of wave.rows) {
  assert.equal(priorKeys.has(row.canonicalKey), false, row.canonicalKey + ': duplicate prior wave');
  assert.ok(eligible.has(row.canonicalKey) || resolved.has(row.canonicalKey), row.canonicalKey + ': not effective eligible');
  assert.equal(Policy.sourceTierForUrl(row.url).key, row.sourceTier);
  assert.equal(row.section41Present, true);
  assert.equal(row.section42Present, true);
  assert.equal(row.publicationAllowed, false);
}
const andorex=wave.rows[0];
assert.equal(andorex.canonicalKey,'benzydaminechlorhexidinedigluconate');
assert.equal(andorex.sourceTier,'KOSOVO_AKPPM');
assert.equal(andorex.registrationNumber,'RMA-3120/16/11/2022');
assert.equal(andorex.documentDate,'2023-10-24');
assert.equal(andorex.atcCode,'D08AC52');
assert.equal(andorex.currentRegistryCrosscheck.kosovoAtcCode,'D08AC52');
assert.equal(andorex.sectionTextCrosscheck.kubAtcCode,'A01AD11');
assert.ok(andorex.reviewFlags.includes('jurisdiction_atc_difference'));
assert.ok(andorex.reviewFlags.includes('clinical_review_required'));
console.log('DRx first-100 source discovery wave T contract passed.');
