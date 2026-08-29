'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/drx-dose-batch1-v1.json'), 'utf8'));

assert.equal(manifest.schemaVersion, 'drx-dose-batch1-v1');
assert.equal(manifest.publicationAllowed, false);
assert.equal(manifest.substances.length, 10);

const expected = [
  'ibuprofen',
  'paracetamol',
  'amoxicillin',
  'amoxicillin-clavulanic-acid',
  'azithromycin',
  'metformin',
  'enalapril',
  'omeprazole',
  'salbutamol',
  'cefuroxime'
];

assert.deepEqual(manifest.substances.map(x => x.key), expected);
for (const item of manifest.substances) {
  assert.equal(typeof item.pilotFile, 'string');
  assert.match(item.pilotFile, /^drx-pilot-.+-v1\.json$/);
  assert.equal(fs.existsSync(path.join(ROOT, 'data', item.pilotFile)), true, item.pilotFile + ' must exist');
}

assert.equal(manifest.gates.sourceDiscoveryCompleteForBatch, true);
assert.equal(manifest.gates.representativeExtractionCompleteForBatch, true);
assert.equal(manifest.gates.structuralNormalizationCheckedForNewPilots, true);
assert.equal(manifest.gates.exactLiveProductBindingComplete, false);
assert.equal(manifest.gates.legacyComparisonComplete, false);
assert.equal(manifest.gates.clinicalReviewComplete, false);
assert.equal(manifest.gates.productionPersistenceComplete, false);

assert.ok(Array.isArray(manifest.blockers));
assert.ok(manifest.blockers.length > 0);

console.log('DRx Batch 1 pilot manifest contract passed.');
