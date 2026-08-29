'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const tracker = readJson('data/drx-dosierung-master-plan-status.json');
assert.equal(tracker.schemaVersion, 'drx-dosierung-master-plan-status-v1');
assert.equal(tracker.phases.length, 33);
assert.deepEqual(tracker.phases.map(p => p.id), Array.from({ length:33 }, (_, i) => i));

for (const phase of tracker.phases) {
  assert.equal(typeof phase.status, 'string');
  assert.ok(phase.status.length > 0);
  assert.equal(typeof phase.next, 'string');
}

for (const artifact of [
  'data/drx-dose-source-policy-v1.json',
  'data/drx-dose-source-map-v1.json',
  'lib/dose-source-archive.js',
  'lib/smpc-parser.js',
  'lib/indication-normalizer.js',
  'lib/dose-rule-normalizer.js',
  'lib/dose-product-binding.js',
  'lib/dose-combination-basis.js',
  'lib/dose-legacy-comparator.js',
  'lib/dose-confidence-engine.js',
  'lib/dose-safety-validator.js',
  'data/drx-pilot-ibuprofen-v1.json',
  'data/drx-dose-v3-schema-proposal.json',
]) {
  assert.equal(exists(artifact), true, artifact + ' must exist.');
}

assert.equal(tracker.phases.find(p => p.id === 14).status, 'BLOCKED_DB_GATEWAY');
assert.equal(tracker.phases.find(p => p.id === 15).status, 'IN_PROGRESS');
assert.equal(tracker.currentExecution.phase, 15);
assert.equal(tracker.currentExecution.publicationAllowed, false);

console.log('DRx master plan status contract passed.');
