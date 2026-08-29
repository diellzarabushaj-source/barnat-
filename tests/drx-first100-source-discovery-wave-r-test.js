'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Policy = require('../lib/dose-source-policy.js');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
const wave = read('data/drx-first100-source-discovery-wave-r-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const decisions = read('data/drx-first100-canonical-review-decisions-v1.json');
const prior = [...'abcdefghijklmnopq'].flatMap(letter =>
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

const rennie = wave.rows[0];
assert.equal(rennie.canonicalKey, 'alginatecalciumcarbonatemagnesiumcarbonate');
assert.equal(rennie.sourceTier, 'EU_NATIONAL');
assert.equal(rennie.registrationNumber, 'PA1410/052/003');
assert.equal(rennie.documentDate, '2024-09-05');
assert.equal(rennie.atcCode, 'A02AX');
assert.match(rennie.productName, /Rennie Dual Action/);
assert.match(rennie.url, /hpra\.ie/);
assert.ok(rennie.reviewFlags.includes('not_marketed_but_authorised'));
assert.ok(rennie.reviewFlags.includes('clinical_review_required'));

console.log('DRx first-100 official source discovery wave R contract passed.');
