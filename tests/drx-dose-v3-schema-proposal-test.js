'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-v3-schema-proposal.json'), 'utf8'));

assert.equal(schema.schemaVersion, 'drx-dose-v3-schema-proposal-v1');
assert.equal(schema.status, 'proposal_hardened_not_applied');
assert.equal(schema.compatibility.v2RuntimeUnchangedUntilCutover, true);
assert.equal(schema.compatibility.initialWriteMode, 'v3_shadow_only');

const byName = new Map(schema.tables.map(table => [table.name, table]));
for (const name of [
  'dose_source_snapshots_v3',
  'dose_source_sections_v3',
  'dose_indication_concepts_v3',
  'dose_indication_terms_v3',
  'dose_products_v3',
  'dose_rules_v3',
  'dose_rule_products_v3',
  'dose_legacy_comparisons_v3',
  'dose_review_queue_v3',
  'dose_publication_events_v3',
]) {
  assert.ok(byName.has(name), name + ' missing from V3 proposal.');
  assert.equal(byName.get(name).rls, true);
}

const rules = byName.get('dose_rules_v3').columns;
for (const column of [
  'source_snapshot_id',
  'source_evidence_hash',
  'required_inputs',
  'dose_basis_mode',
  'dose_basis_component_concept_id',
  'times_per_day_min',
  'times_per_day_max',
  'hepatic_adjustment_required',
  'cardiac_adjustment_required',
  'source_document_version',
  'source_document_date',
  'safety_validation_status',
]) {
  assert.ok(Object.hasOwn(rules, column), 'dose_rules_v3 missing ' + column);
}

assert.equal(byName.get('dose_source_snapshots_v3').exposure, 'service_only');
assert.equal(byName.get('dose_review_queue_v3').exposure, 'admin_only');
assert.equal(byName.get('dose_products_v3').exposure, 'published_read_only');
assert.equal(schema.compatibility.v3RuntimeIndependentOfDoseProductsV2, true);
assert.equal(byName.get('dose_rule_products_v3').columns.product_id, 'uuid');

console.log('DRx additive V3 schema proposal contract passed.');
