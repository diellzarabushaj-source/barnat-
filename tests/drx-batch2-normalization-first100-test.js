'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Normalization = require('../scripts/build-drx-batch2-normalization-index.js');
const Queue = require('../scripts/build-drx-first100-discovery-queue.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'drx-batch2-'));
const extractionPath = path.join(temp, 'extraction.json');
const hash = 'a'.repeat(64);

const extraction = {
  schemaVersion:'drx-batch2-extraction-index-v1',
  targetCount:2,
  extractedCount:2,
  failedCount:0,
  complete:true,
  rows:[
    {canonicalKey:'a',sourceKey:'emc-a',snapshotId:hash,rawSha256:hash,section41Present:true,section42Present:true,extractionGate:{allowed:true}},
    {canonicalKey:'b',sourceKey:'emc-b',snapshotId:hash,rawSha256:hash,section41Present:true,section42Present:true,extractionGate:{allowed:true}},
  ],
  errors:[],
};
fs.writeFileSync(extractionPath, JSON.stringify(extraction));

const normalized = Normalization.build({inputPath:extractionPath,write:false});
assert.equal(normalized.gate.allowNormalization, true);
assert.equal(normalized.readyForStructuredDoseCandidateCount, 2);
assert.equal(normalized.normalizedRuleCount, 0);
assert.equal(normalized.publicationAllowed, false);

const invalidRule = Normalization.validateStructuredRule({
  ruleKey:'x',
  indicationKey:'pain',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:500,
  doseMaxValue:500,
  doseUnit:'mg',
  frequencyMode:'times_per_day',
  sourceKey:'emc-x',
  sourceSection:'4.2',
  editorialStatus:'verified',
});
assert.equal(invalidRule.valid, false);
assert.ok(invalidRule.errors.includes('times_per_day_missing'));
assert.ok(invalidRule.errors.includes('source_snapshot_missing'));
assert.ok(invalidRule.errors.includes('source_evidence_hash_missing_or_invalid'));

const canonical = Array.from({length:140}, (_, i) => ({
  canonicalKey:'drug-' + String(i + 1).padStart(3,'0'),
  canonicalName:'Drug ' + (i + 1),
  conceptId:'c' + (i + 1),
}));
const covered = canonical.slice(0,35);
const queue = Queue.buildDiscoveryQueue(canonical, covered, 100);
assert.equal(queue.length, 100);
assert.equal(queue[0].canonicalKey, 'drug-036');
assert.equal(queue[99].canonicalKey, 'drug-135');
assert.ok(queue.every(x => x.status === 'source_discovery_pending'));
assert.ok(queue.every(x => x.publicationAllowed === false));

console.log('DRx Batch 2 normalization and first-100 discovery queue contracts passed.');
