'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SourcePolicy = require('../lib/dose-source-policy.js');

const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-v3-schema-proposal.json'), 'utf8'));
const hardening = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drx-dose-v3-clinical-hardening-v1.json'), 'utf8'));
const hardeningSql = fs.readFileSync(path.join(ROOT, 'supabase', 'drx-dose-v3-clinical-hardening-candidate.sql'), 'utf8');

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
  'dose_renal_adjustments_v3',
  'dose_hepatic_adjustments_v3',
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
  'source_section_sha256',
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

assert.equal(byName.get('dose_source_snapshots_v3').exposure, 'rpc_metadata_only');
assert.equal(byName.get('dose_source_sections_v3').exposure, 'rpc_metadata_only');
assert.deepEqual(byName.get('dose_source_sections_v3').clientExcludedColumns, ['section_text','extracted_json']);
assert.equal(byName.get('dose_review_queue_v3').exposure, 'admin_only');
assert.equal(byName.get('dose_products_v3').exposure, 'published_read_only');
assert.equal(schema.compatibility.v3RuntimeIndependentOfDoseProductsV2, true);
assert.equal(byName.get('dose_rule_products_v3').columns.product_id, 'uuid');

// Clinical hardening contract: EMA ePI/FHIR alignment and no parser-to-publication shortcut.
assert.equal(hardening.schemaVersion, 'drx-dose-v3-clinical-hardening-v1');
assert.equal(hardening.status, 'candidate_not_applied');
assert.equal(hardening.standards.emaEpi.implementationGuideVersion, '1.0.0');
assert.equal(hardening.standards.emaEpi.fhirVersion, '5.0.0');
assert.equal(hardening.standards.emaEpi.smpcSection42.code, '200000029800');
assert.equal(hardening.standards.emaEpi.subsections.paediatricPopulation, '200000029802');
assert.equal(hardening.standards.units.preferredCodeSystem, 'UCUM');
assert.equal(hardening.parserGovernance.outputStatus, 'candidate_only');
assert.equal(hardening.parserGovernance.humanClinicalReviewRequired, true);
assert.equal(hardening.parserGovernance.llmMayPublishDirectly, false);
assert.equal(hardening.parserGovernance.confidenceScoreIsNotApproval, true);
for (const role of ['loading','maintenance','titration','taper','cycle','continuous']) {
  assert.ok(hardening.ruleModel.regimenRoles.includes(role), 'hardening missing regimen role ' + role);
}
for (const dimension of ['gestational_age_weeks','postmenstrual_age_weeks']) {
  assert.ok(hardening.populationModel.dimensions.includes(dimension), 'hardening missing population dimension ' + dimension);
}
assert.ok(hardening.renalModel.methods.includes('Cockcroft_Gault'));
assert.ok(hardening.renalModel.methods.includes('CKD_EPI'));
for (const modality of ['HD','PD','CRRT']) {
  assert.ok(hardening.renalModel.dialysisModalities.includes(modality), 'hardening missing dialysis modality ' + modality);
}
for (const invariant of [
  'Never treat dose_per_kg_per_day as dose_per_kg_per_dose.',
  'Never publish parser-only evidence.',
]) {
  assert.ok(hardening.safetyInvariants.includes(invariant), 'hardening missing invariant: ' + invariant);
}

// Additive SQL candidate must preserve legacy runtime and model the missing high-risk dimensions.
assert.match(hardeningSql, /STATUS: NOT_APPLIED/);
assert.match(hardeningSql, /DRX_V3_CLINICAL_HARDENING_REQUIRES_BASE_SCHEMA/);
assert.doesNotMatch(hardeningSql, /alter\s+table\s+public\.dose_rules_v2/i);
assert.doesNotMatch(hardeningSql, /alter\s+table\s+public\.dosage_regimens/i);
assert.doesNotMatch(hardeningSql, /\bdrop\s+table\b/i);
for (const token of [
  'regimen_role',
  'dose_unit_ucum',
  'dose_rate_min',
  'infusion_duration_min_minutes',
  'cycle_length_days',
  'gestational_age_min_weeks',
  'postmenstrual_age_min_weeks',
  'measure_method',
  'dialysis_modality',
  'dialysis_timing',
  'supersedes_rule_id',
]) {
  assert.match(hardeningSql, new RegExp('\\b' + token + '\\b'), 'hardening SQL missing ' + token);
}

// DailyMed/FDA are recognized as official non-EU fallback evidence but never auto-publish EU/Kosovo dosing.
const dailyMed = SourcePolicy.rankCandidate({
  url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=example',
  documentType:'SPL',
  documentVersion:'example-version',
  productSpecific:true,
  productMatch:true,
  hasDoseSection:true,
});
assert.equal(dailyMed.tier.key, 'NON_EU_REGULATOR');
assert.equal(dailyMed.accepted, true);
assert.equal(dailyMed.publicationEligible, false);
assert.equal(SourcePolicy.publicationDecision(dailyMed).allowed, false);

console.log('DRx additive V3 schema + clinical hardening contract passed.');
