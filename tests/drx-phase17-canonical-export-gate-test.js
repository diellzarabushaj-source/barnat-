'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Gate = require('../scripts/build-drx-first100-from-canonical-export.js');
const Queue = require('../scripts/build-drx-first100-discovery-queue.js');

const root = path.resolve(__dirname, '..');
const covered = Gate.coveredCanonicalKeys(root);
assert.equal(covered.length, 35);

const extra = Array.from({ length: 130 }, (_, index) => ({
  canonical_key: 'zzdrug' + String(index + 1).padStart(3, '0'),
  canonical_name: 'ZZ Drug ' + (index + 1),
  concept_id: 'zz-' + String(index + 1).padStart(3, '0'),
}));
const coveredRows = covered.map((key, index) => ({
  canonical_key: key,
  canonical_name: 'Covered ' + key,
  concept_id: 'covered-' + String(index + 1).padStart(2, '0'),
}));

const rows = Queue.normalizeCanonicalRows([...coveredRows, ...extra]).map(row => ({
  canonical_key: row.canonicalKey,
  canonical_name: row.canonicalName,
  concept_id: row.conceptId,
}));

const valid = {
  schemaVersion: Gate.EXPORT_SCHEMA,
  sourceSystem: 'supabase',
  projectId: Gate.PROJECT_ID,
  sourceRelation: 'public.substance_concepts_v1',
  exportedAt: '2026-08-29T03:40:00Z',
  rowCount: rows.length,
  rows,
  publicationAllowed: false,
};
valid.snapshotSha256 = Gate.computeSnapshotHash(valid);

const validation = Gate.validateCanonicalExport(valid);
assert.equal(validation.valid, true, JSON.stringify(validation.errors));
assert.equal(validation.summary.rowCount, 165);
assert.equal(validation.summary.uniqueCanonicalKeys, 165);

const built = Gate.buildValidatedDiscoveryBatch(valid, { root, limit: 100 });
assert.equal(built.generationAllowed, true, JSON.stringify(built.errors));
assert.equal(built.publicationAllowed, false);
assert.equal(built.evidence.coveredCanonicalCount, 35);
assert.deepEqual(built.evidence.missingCovered, []);
assert.equal(built.batch.queuedCount, 100);
assert.equal(built.batch.complete, true);
assert.equal(built.batch.excludedCanonicalCount, 35);
assert.ok(built.batch.queue.every(row => row.publicationAllowed === false));
assert.ok(built.batch.queue.every(row => !covered.includes(row.canonicalKey)));

const tampered = structuredClone(valid);
tampered.rows[0].canonical_name = 'Tampered';
const tamperedValidation = Gate.validateCanonicalExport(tampered);
assert.equal(tamperedValidation.valid, false);
assert.ok(tamperedValidation.errors.includes('export:snapshot_hash_mismatch'));

const duplicate = structuredClone(valid);
duplicate.rows[1].canonical_key = duplicate.rows[0].canonical_key;
duplicate.snapshotSha256 = Gate.computeSnapshotHash(duplicate);
const duplicateValidation = Gate.validateCanonicalExport(duplicate);
assert.equal(duplicateValidation.valid, false);
assert.ok(duplicateValidation.errors.some(error => error.endsWith(':canonical_key_duplicate')));

const wrongProject = structuredClone(valid);
wrongProject.projectId = 'unexpected-project';
wrongProject.snapshotSha256 = Gate.computeSnapshotHash(wrongProject);
assert.ok(Gate.validateCanonicalExport(wrongProject).errors.includes('export:project_id_mismatch'));

const missingCovered = structuredClone(valid);
missingCovered.rows = missingCovered.rows.filter(row => row.canonical_key !== covered[0]);
missingCovered.rowCount = missingCovered.rows.length;
missingCovered.snapshotSha256 = Gate.computeSnapshotHash(missingCovered);
const missingResult = Gate.buildValidatedDiscoveryBatch(missingCovered, { root, limit: 100 });
assert.equal(missingResult.generationAllowed, false);
assert.ok(missingResult.errors.includes('coverage:covered_keys_missing_from_export'));
assert.equal(missingResult.batch, null);

const partial = structuredClone(valid);
partial.rows = partial.rows.slice(0, 50);
partial.rowCount = partial.rows.length;
partial.snapshotSha256 = Gate.computeSnapshotHash(partial);
const partialResult = Gate.buildValidatedDiscoveryBatch(partial, { root, limit: 100 });
assert.equal(partialResult.generationAllowed, false);
assert.equal(partialResult.publicationAllowed, false);

console.log('DRx Phase 17 canonical export gate contract passed.');
