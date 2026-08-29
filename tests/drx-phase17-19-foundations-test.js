'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const bulk = read('data/drx-bulk-import-policy-v1.json');
assert.equal(bulk.status, 'foundation_hardened_repository');
assert.equal(bulk.publicationAllowed, false);
assert.deepEqual(bulk.batchSizes, [100, 250, 500]);
assert.equal(bulk.batchGate.maxFailureRate, 0);
assert.equal(bulk.batchGate.stopOnSourceFetchError, true);
assert.equal(bulk.batchGate.stopOnParserError, true);
assert.equal(bulk.batchGate.stopOnNormalizationError, true);
assert.equal(bulk.batchGate.stopOnSafetyConflict, true);
assert.equal(bulk.batchGate.stopOnRawHashMismatch, true);
assert.equal(bulk.batchGate.stopOnSectionHashMismatch, true);
assert.equal(bulk.batchGate.stopOnCanonicalProvenanceMismatch, true);
assert.equal(bulk.batchGate.stopOnProductBindingMismatch, true);
assert.equal(bulk.batchGate.forbidPartialBatchPromotion, true);
assert.equal(bulk.sourceArchiveGate.requireRawSnapshotSha256, true);
assert.equal(bulk.sourceArchiveGate.requireSection42Sha256, true);
assert.equal(bulk.sourceArchiveGate.requireRawReparseSectionHashParity, true);
assert.equal(bulk.draftRulePersistenceGate.requireProductionCanonicalExportHash, true);
assert.equal(bulk.draftRulePersistenceGate.requireSourceSection42Sha256, true);
assert.equal(bulk.draftRulePersistenceGate.requireSnapshotEvidenceHashIdentity, true);
assert.equal(bulk.draftRulePersistenceGate.requireExactLiveProductBinding, true);
assert.equal(bulk.draftRulePersistenceGate.forbidPublishedInsert, true);
assert.equal(bulk.publicationGate.bulkImporterMayPublish, false);
assert.equal(bulk.publicationGate.delegatedToPhase24, true);
assert.equal(bulk.rollback.forbidCascade, true);
assert.equal(bulk.rollback.forbidLegacyMutation, true);

const canonicalExport = read('data/drx-canonical-substance-export-contract-v1.json');
assert.equal(canonicalExport.status, 'LIVE_EXPORT_GATE_IMPLEMENTED_WAITING_SUPABASE');
assert.equal(canonicalExport.publicationAllowed, false);
assert.equal(canonicalExport.exportGate.requireProjectIdMatch, true);
assert.equal(canonicalExport.exportGate.requireSupabaseSourceEnvelope, true);
assert.equal(canonicalExport.exportGate.requireHashBoundEnvelope, true);
assert.equal(canonicalExport.exportGate.rejectDuplicateCanonicalKey, true);
assert.equal(canonicalExport.exportGate.requireAllBatch1And2KeysPresent, true);
assert.equal(canonicalExport.exportGate.noFallbackCanonicalRows, true);

// Provenance safeguards both cores must carry once hardened, so a verified rule
// can never outrun the exact source section it was read from.
const PROVENANCE_SAFEGUARDS = [
  'verified_rule_requires_snapshot_evidence_hash_identity',
  'verified_rule_requires_exact_smpc_4_2_sha256',
  'renal_hepatic_adjustments_must_be_separately_hash_pinned',
];

const pediatric = read('data/drx-pediatric-core-v1.json');
assert.equal(pediatric.status, 'provenance_hardened_repository');
assert.equal(pediatric.publicationAllowed, false);
assert.ok(pediatric.methods.includes('dose_per_kg_per_dose'));
assert.ok(pediatric.methods.includes('dose_per_m2_per_day'));
assert.ok(pediatric.safeguards.includes('max_dose_enforced'));
assert.ok(pediatric.safeguards.includes('no_publication_without_product_specific_concentration'));
assert.ok(pediatric.safeguards.includes('missing_required_patient_input_blocks_calculation'));
for (const safeguard of PROVENANCE_SAFEGUARDS) {
  assert.ok(pediatric.safeguards.includes(safeguard), 'pediatric core must keep ' + safeguard);
}

const adult = read('data/drx-adult-core-v1.json');
assert.equal(adult.status, 'provenance_hardened_repository');
assert.equal(adult.publicationAllowed, false);
assert.ok(adult.modifiers.includes('renal_function'));
assert.ok(adult.modifiers.includes('hepatic_function'));
assert.ok(adult.safeguards.includes('no_generic_merge_of_product_specific_smpc_rules'));
assert.ok(adult.safeguards.includes('missing_required_modifier_blocks_calculation'));
for (const safeguard of PROVENANCE_SAFEGUARDS) {
  assert.ok(adult.safeguards.includes(safeguard), 'adult core must keep ' + safeguard);
}

console.log('DRx phases 17-19 foundation contracts passed.');
