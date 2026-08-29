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
assert.equal(batch2.gates.authoritativeSourceVerifiedCount, 25);
assert.equal(batch2.gates.authoritativeSourcePendingCount, 0);
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
  assert.equal(typeof obj.status, 'string', rel + ': status missing');
  assert.ok(obj.status.length > 0, rel + ': status empty');
}

const publication = read('data/drx-publication-gate-v3-policy.json');
assert.equal(publication.failClosed, true);
assert.ok(publication.publishWhenAll.includes('product_binding_exact'));
assert.ok(publication.publishWhenAll.includes('safety_validation_passed'));
assert.ok(publication.publishWhenAll.includes('no_open_clinical_review'));

const api = read('data/drx-api-fast-path-contract-v1.json');
assert.equal(api.status, 'v3_one_rpc_adjustment_provenance_hardened_repository_not_live');
assert.equal(api.v3.targetDbReads, 1);
assert.equal(api.v3.rpc, 'public.medindex_dose_product_fast_path_v3');

const doseCore = read('data/drx-dose-core-contract-v1.json');
assert.equal(doseCore.status, 'adjustment_aware_shared_core_runtime_hardened_repository');
assert.equal(doseCore.deterministic, true);
assert.ok(doseCore.invariants.includes('fail_closed_on_ambiguous_rule'));
assert.ok(doseCore.supportedMethods.includes('dose_per_m2_per_day'));
assert.equal(doseCore.runtimeFiles.canonical, 'dose-core.js');

const cache = read('data/drx-dose-cache-policy-v1.json');
assert.equal(cache.safetyRule, 'never_cache_or_restore draft/in_review/unverified-adjustment payloads as public');

console.log('DRx Phase 16 and runtime foundation contracts passed.');
