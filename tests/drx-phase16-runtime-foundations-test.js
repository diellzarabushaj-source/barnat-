'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const batch2 = read('data/drx-dose-batch2-v1.json');
assert.equal(batch2.schemaVersion, 'drx-dose-batch2-v1');
assert.equal(batch2.publicationAllowed, false);
assert.equal(batch2.targetCount, 25);
assert.equal(batch2.substances.length, 25);
assert.equal(batch2.gates.authoritativeSourceVerifiedCount, 18);
assert.equal(batch2.gates.authoritativeSourcePendingCount, 7);
assert.equal(batch2.gates.exactLiveProductBindingComplete, false);

const required = [
  ['data/drx-renal-adjustment-model-v1.json', 'drx-renal-adjustment-model-v1'],
  ['data/drx-hepatic-adjustment-model-v1.json', 'drx-hepatic-adjustment-model-v1'],
  ['data/drx-high-risk-drug-framework-v1.json', 'drx-high-risk-drug-framework-v1'],
  ['data/drx-clinical-review-queue-policy-v1.json', 'drx-clinical-review-queue-policy-v1'],
  ['data/drx-publication-gate-v3-policy.json', 'drx-publication-gate-v3-policy'],
  ['data/drx-api-fast-path-contract-v1.json', 'drx-api-fast-path-contract-v1'],
  ['data/drx-dose-core-contract-v1.json', 'drx-dose-core-contract-v1'],
  ['data/drx-dose-cache-policy-v1.json', 'drx-dose-cache-policy-v1'],
  ['data/drx-frontend-flow-contract-v1.json', 'drx-frontend-flow-contract-v1'],
  ['data/drx-qa-coverage-contract-v1.json', 'drx-qa-coverage-contract-v1']
];

for (const [rel, schemaVersion] of required) {
  const obj = read(rel);
  assert.equal(obj.schemaVersion, schemaVersion, rel);
  assert.match(obj.status, /foundation_complete_repository/);
}

const publication = read('data/drx-publication-gate-v3-policy.json');
assert.equal(publication.failClosed, true);
assert.ok(publication.publishWhenAll.includes('product_binding_exact'));
assert.ok(publication.publishWhenAll.includes('safety_validation_passed'));
assert.ok(publication.publishWhenAll.includes('no_open_clinical_review'));

const doseCore = read('data/drx-dose-core-contract-v1.json');
assert.equal(doseCore.deterministic, true);
assert.ok(doseCore.invariants.includes('fail_closed_on_ambiguous_rule'));

const cache = read('data/drx-dose-cache-policy-v1.json');
assert.equal(cache.safetyRule, 'never_cache_draft_or_in_review_rules_as_public');

console.log('DRx Phase 16 and runtime foundation contracts passed.');
