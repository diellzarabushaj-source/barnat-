'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Policy = require('../lib/dose-source-policy.js');
const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const wave = read('data/drx-first100-source-discovery-wave-u-v1.json');
const quality = read('data/drx-first100-canonical-quality-audit-v1.json');
const decisions = read('data/drx-first100-canonical-review-decisions-v1.json');
const prior = [...'abcdefghijklmnopqrst'].flatMap(letter =>
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
  assert.equal(Policy.sourceTierForUrl(row.url).key, 'NON_EU_REGULATOR');
  assert.equal(row.officialIdentityPresent, true);
  assert.equal(row.doseEvidencePresent, true);
  assert.equal(row.section41Present, false);
  assert.equal(row.section42Present, false);
  assert.ok(row.reviewFlags.includes('manual_publication_review_required'));
  assert.equal(row.publicationAllowed, false);
}

const brasartan=wave.rows[0];
assert.equal(brasartan.canonicalKey,'chlorthalidonvalsartan');
assert.equal(brasartan.registrationNumber,'INVIMA 2023M-0021003');
assert.equal(brasartan.documentDate,'2023-06-05');
assert.equal(brasartan.currentRegistryCrosscheck.registryStatus,'Vigente');
assert.deepEqual(brasartan.currentRegistryCrosscheck.activeSubstances,['valsartan','chlorthalidone']);
assert.match(brasartan.productName,/BRASARTAN CTDN/);
assert.ok(brasartan.reviewFlags.includes('non_eu_regulator'));
assert.ok(brasartan.reviewFlags.includes('clinical_review_required'));

console.log('DRx first-100 source discovery wave U contract passed.');
