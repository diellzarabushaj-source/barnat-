'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Policy = require('../lib/dose-source-policy.js');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const wave = read('data/drx-first100-source-discovery-wave-s-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const decisions = read('data/drx-first100-canonical-review-decisions-v1.json');
const prior = [...'abcdefghijklmnopqr'].flatMap(letter =>
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

const venosan = wave.rows[0];
assert.equal(venosan.canonicalKey, 'aescinessentialphospholipidsheparin');
assert.equal(venosan.sourceTier, 'KOSOVO_AKPPM');
assert.equal(venosan.registrationNumber, 'RMA-2478/15/09/2021');
assert.equal(venosan.atcCode, 'C05BA53');
assert.match(venosan.productName, /VENOSAN/);
assert.match(venosan.url, /akppm\.rks-gov\.net/);
assert.ok(venosan.reviewFlags.includes('mah_smpc_crosscheck_non_regulator'));
assert.ok(venosan.reviewFlags.includes('manual_publication_review_required'));

console.log('DRx first-100 source discovery wave S contract passed.');
