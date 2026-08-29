'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Dose = require('../lib/dose-rule-normalizer.js');
const SourcePolicy = require('../lib/dose-source-policy.js');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const batch = readJson('data/drx-dose-batch1-v1.json');
const sourceMap = readJson('data/drx-dose-source-map-v1.json');

assert.equal(batch.schemaVersion, 'drx-dose-batch1-v1');
assert.equal(batch.status, 'repo_candidates_complete_live_binding_blocked');
assert.equal(batch.publicationAllowed, false);
assert.equal(batch.substances.length, 10);
assert.equal(new Set(batch.substances.map(item => item.key)).size, 10);
assert.equal(batch.gates.sourceDiscoveryCompleteForBatch, true);
assert.equal(batch.gates.representativeExtractionCompleteForBatch, true);
assert.equal(batch.gates.exactLiveProductBindingComplete, false);
assert.equal(batch.gates.legacyComparisonComplete, false);
assert.equal(batch.gates.clinicalReviewComplete, false);
assert.equal(batch.gates.productionPersistenceComplete, false);

for (const item of batch.substances) {
  assert.ok(sourceMap.substances[item.key], item.key + ' must exist in the official source map.');
  const pilot = readJson(path.join('data', item.pilotFile));
  assert.equal(pilot.canonicalSubstance.key, item.key);
  assert.equal(pilot.publicationAllowed, false);
  assert.equal(pilot.status, 'in_review_unbound');
  assert.ok(Array.isArray(pilot.sourceSet) && pilot.sourceSet.length >= 1);
  for (const source of pilot.sourceSet) {
    assert.equal(source.section, '4.2');
    assert.ok(source.documentDate || source.documentVersion || source.publicationBlockedReason);
    const tier = SourcePolicy.sourceTierForUrl(source.url);
    assert.ok(tier, source.sourceKey + ' must map to an approved source tier.');
    assert.equal(tier.key, source.tier);
  }
  assert.ok(Array.isArray(pilot.extractedRuleCandidates) && pilot.extractedRuleCandidates.length >= 1);
  for (const rule of pilot.extractedRuleCandidates) {
    assert.equal(rule.bindingStatus, 'unbound');
    assert.equal(rule.editorialStatus, 'in_review');
    assert.ok(rule.sourceKey);
    assert.ok(rule.candidateKey);
  }
}

for (const item of batch.substances.filter(item => item.key !== 'ibuprofen')) {
  const pilot = readJson(path.join('data', item.pilotFile));
  for (const candidate of pilot.extractedRuleCandidates) {
    const validation = Dose.validateRule(candidate);
    assert.equal(
      validation.valid,
      true,
      item.key + ' candidate ' + candidate.candidateKey + ' must be structurally valid: ' + validation.errors.join(',')
    );
    assert.deepEqual(
      [...candidate.requiredInputs].sort(),
      [...validation.rule.requiredInputs].sort(),
      item.key + ' required_inputs must match deterministic derivation.'
    );
    const publication = Dose.publicationDecision(candidate);
    assert.equal(publication.allowed, false);
    assert.equal(publication.reason, 'editorial_status_not_publishable');
  }
}

const combo = readJson('data/drx-pilot-amoxicillin-clavulanic-acid-v1.json');
assert.equal(combo.extractedRuleCandidates[0].doseBasis, 'amoxicillin_component');
assert.equal(combo.extractedRuleCandidates[0].doseBasisComponentConceptId, null);
assert.match(combo.extractedRuleCandidates[0].reviewReason, /concept ID/);

const metformin = readJson('data/drx-pilot-metformin-v1.json');
assert.equal(metformin.extractedRuleCandidates[0].calculationMethod, 'manual_only');
assert.ok(metformin.v2SchemaGaps.includes('gfr_band_adjustment'));
assert.ok(metformin.v2SchemaGaps.includes('times_per_day_range'));

console.log('DRx Batch 1 repository pilot contract passed: 10 substances, fail-closed until live binding/review.');
