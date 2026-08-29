'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SourcePolicy = require('../lib/dose-source-policy.js');

const ROOT = path.resolve(__dirname, '..');
const pilot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-pilot-ibuprofen-v1.json'), 'utf8'));

assert.equal(pilot.schemaVersion, 'drx-dose-pilot-v1');
assert.equal(pilot.pilotKey, 'ibuprofen');
assert.equal(pilot.status, 'in_review_unbound');
assert.equal(pilot.publicationAllowed, false);
assert.equal(pilot.canonicalSubstance.key, 'ibuprofen');

assert.ok(pilot.sourceSet.length >= 2);
for (const source of pilot.sourceSet) {
  const tier = SourcePolicy.sourceTierForUrl(source.url);
  assert.ok(tier, source.sourceKey + ' must resolve to a source tier.');
  assert.equal(tier.key, source.tier);
  assert.equal(source.section, '4.2');
}

for (const rule of pilot.extractedRuleCandidates) {
  assert.equal(rule.bindingStatus, 'unbound');
  assert.equal(rule.editorialStatus, 'in_review');
  assert.ok(Array.isArray(rule.requiredInputs));
  assert.ok(rule.sourceKey);
  assert.ok(rule.candidateKey);
}

const cima = pilot.sourceSet.find(source => source.tier === 'AEMPS_CIMA');
assert.ok(cima);
assert.equal(cima.documentDate, null);
assert.match(cima.publicationBlockedReason, /document_version_or_date/);

for (const gap of [
  'times_per_day_range',
  'source_snapshot_id',
  'source_section_sha256',
  'source_evidence_hash',
  'required_inputs',
  'dose_basis_component_concept_id',
]) {
  assert.ok(pilot.v2SchemaGaps.includes(gap), 'Missing recorded V2 gap: ' + gap);
}

assert.equal(pilot.sourceReconciliation.autoMerge, false);
assert.match(pilot.nextGate, /bind to exact DRx products/);

console.log('DRx ibuprofen pilot remains fail-closed and unbound.');
