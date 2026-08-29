'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const bulk = read('data/drx-bulk-import-policy-v1.json');
assert.equal(bulk.status, 'foundation_complete_repository');
assert.equal(bulk.publicationAllowed, false);
assert.deepEqual(bulk.batchSizes, [100, 250, 500]);
assert.equal(bulk.batchGate.maxFailureRate, 0);
assert.equal(bulk.batchGate.stopOnSourceFetchError, true);
assert.equal(bulk.batchGate.stopOnParserError, true);
assert.equal(bulk.batchGate.stopOnNormalizationError, true);
assert.equal(bulk.batchGate.stopOnSafetyConflict, true);

const canonicalExport = read('data/drx-canonical-substance-export-contract-v1.json');
assert.equal(canonicalExport.status, 'LIVE_EXPORT_GATE_IMPLEMENTED_WAITING_SUPABASE');
assert.equal(canonicalExport.publicationAllowed, false);
assert.equal(canonicalExport.exportGate.requireProjectIdMatch, true);
assert.equal(canonicalExport.exportGate.requireSupabaseSourceEnvelope, true);
assert.equal(canonicalExport.exportGate.requireHashBoundEnvelope, true);
assert.equal(canonicalExport.exportGate.rejectDuplicateCanonicalKey, true);
assert.equal(canonicalExport.exportGate.requireAllBatch1And2KeysPresent, true);
assert.equal(canonicalExport.exportGate.noFallbackCanonicalRows, true);

const pediatric = read('data/drx-pediatric-core-v1.json');
assert.equal(pediatric.status, 'foundation_complete_repository');
assert.equal(pediatric.publicationAllowed, false);
assert.ok(pediatric.methods.includes('dose_per_kg_per_dose'));
assert.ok(pediatric.methods.includes('dose_per_m2_per_day'));
assert.ok(pediatric.safeguards.includes('max_dose_enforced'));
assert.ok(pediatric.safeguards.includes('no_publication_without_product_specific_concentration'));

const adult = read('data/drx-adult-core-v1.json');
assert.equal(adult.status, 'foundation_complete_repository');
assert.equal(adult.publicationAllowed, false);
assert.ok(adult.modifiers.includes('renal_function'));
assert.ok(adult.modifiers.includes('hepatic_function'));
assert.ok(adult.safeguards.includes('no_generic_merge_of_product_specific_smpc_rules'));

console.log('DRx phases 17-19 foundation contracts passed.');
