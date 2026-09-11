'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'data', 'drx-dose-v3', 'antibiotics', 'batch1');
const index = JSON.parse(fs.readFileSync(path.join(BASE, 'index.v1.json'), 'utf8'));

assert.equal(index.schemaVersion, 'drx-dose-v3-antibiotics-batch-index-v1');
assert.equal(index.status, 'source_verified_candidate_requires_clinical_review');
assert.equal(index.publicationEligible, false);
assert.equal(index.humanClinicalReviewRequired, true);
assert.equal(index.governance.userSuppliedNamesUsedAsSeedOnly, true);
assert.equal(index.governance.userSuppliedDoseTextUsedAsSource, false);
assert.equal(index.governance.parserOrLlmMayPublishDirectly, false);
assert.equal(index.records.length, 4);

const expectedIds = [
  'amoxicillin',
  'amoxicillin-clavulanic-acid',
  'ceftriaxone',
  'trimethoprim-sulfamethoxazole',
].sort();
assert.deepEqual(index.records.map(r => r.id).sort(), expectedIds);

const records = new Map();
for (const item of index.records) {
  const fullPath = path.join(ROOT, item.path);
  assert.ok(fs.existsSync(fullPath), `missing ${item.path}`);
  const record = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  records.set(item.id, record);
  assert.equal(record.schemaVersion, 'drx-dose-v3-substance-candidate-v1');
  assert.equal(record.status, 'source_verified_candidate_requires_clinical_review');
  assert.equal(record.publicationEligible, false);
  assert.equal(record.humanClinicalReviewRequired, true);
  assert.equal(record.userSuppliedDoseTextUsedAsSource, false);
  assert.equal(record.substance.id, item.id);
  assert.ok(Array.isArray(record.rules) && record.rules.length > 0, `${item.id}: no dosing rules`);
  for (const rule of record.rules) {
    assert.ok(rule.id, `${item.id}: rule missing id`);
    assert.ok(rule.dose, `${rule.id}: missing dose`);
    assert.equal(rule.sourceSection, 'SmPC 4.2', `${rule.id}: source section must be SmPC 4.2`);
  }
}

const amox = records.get('amoxicillin');
assert.equal(amox.substance.atc, 'J01CA04');
assert.ok(amox.rules.some(r => r.id === 'amox-child-endocarditis-prophylaxis'));
assert.ok(amox.renalAdjustments.some(r => r.dialysis === 'HD'));
assert.ok(amox.renalAdjustments.some(r => r.dialysis === 'PD'));
assert.match(amox.source.url, /medicines\.org\.uk\/emc\/product\/526\/smpc$/);

const coamox = records.get('amoxicillin-clavulanic-acid');
assert.equal(coamox.substance.type, 'fixed_combination');
assert.deepEqual(coamox.substance.components, ['amoxicillin', 'clavulanic acid']);
assert.ok(coamox.formulations.some(f => f.ratio === '4:1'));
assert.ok(coamox.formulations.some(f => f.ratio === '7:1'));
for (const formulation of coamox.formulations) {
  assert.equal(formulation.components.length, 2);
  assert.ok(formulation.components.some(c => c.component === 'amoxicillin'));
  assert.ok(formulation.components.some(c => c.component === 'clavulanic acid'));
}
for (const rule of coamox.rules) {
  if (rule.dose.components) {
    assert.ok(rule.dose.components.some(c => c.component === 'amoxicillin'), `${rule.id}: missing amoxicillin component`);
    assert.ok(rule.dose.components.some(c => c.component === 'clavulanic acid'), `${rule.id}: missing clavulanate component`);
  }
}
assert.ok(coamox.renalAdjustments.some(r => r.formulationRatio === '7:1' && r.action === 'not_recommended_no_adjustment_recommendation'));

const ceftriaxone = records.get('ceftriaxone');
assert.equal(ceftriaxone.substance.atc, 'J01DD04');
assert.ok(ceftriaxone.rules.some(r => r.population && r.population.ageMaxDays === 14));
assert.ok(ceftriaxone.criticalSafety.some(x => x.population === 'premature_neonate'));
assert.ok(ceftriaxone.criticalSafety.some(x => x.population === 'neonate_up_to_28_days' && /calcium/i.test(x.contraindication)));
assert.ok(ceftriaxone.renalAdjustments.some(r => r.range && r.range.lt === 10 && r.maxDailyDose.dose === 2));

const cotrim = records.get('trimethoprim-sulfamethoxazole');
assert.equal(cotrim.substance.atc, 'J01EE01');
assert.equal(cotrim.substance.type, 'fixed_combination');
assert.deepEqual(cotrim.substance.components, ['trimethoprim', 'sulfamethoxazole']);
assert.ok(cotrim.substance.aliases.includes('Bactrim'));
assert.ok(cotrim.formulations.some(f => f.id === 'cotrim-40-200-per-5ml'));
assert.ok(cotrim.rules.some(r => r.id === 'cotrim-pjp-treatment'));
assert.ok(cotrim.renalAdjustments.some(r => r.range && r.range.lt === 15 && r.action === 'not_recommended'));

const allText = [...records.values()].map(JSON.stringify).join('\n').toLowerCase();
for (const forbidden of [
  'i lehtë → amoxicillin',
  'mesatar → amoksiklav',
  'i rëndë → ceftriaxone',
  'simple infection -> amoxicillin',
]) {
  assert.equal(allText.includes(forbidden.toLowerCase()), false, `unsafe heuristic leaked into data: ${forbidden}`);
}

console.log('DRx Dose V3 antibiotics batch 1 source-verified candidate gate passed.');
