'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dozologjia-v5/schema/antibiotic-regimen.v1.json'), 'utf8'));
const batch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dozologjia-v5/antibiotics/batch1/core.v1.json'), 'utf8'));

assert.equal(schema.schemaVersion, 'dozologjia-v5-antibiotic-regimen-v1');
assert.equal(schema.design.clinicalIdentityOwner, 'active_substance');
assert.equal(schema.design.marketProductDependency, false);
assert.equal(schema.design.failClosed, true);
assert.equal(schema.runtime.durationIsFirstClassClinicalOutput, true);
assert.equal(schema.runtime.productConversionIsOptionalSecondStage, true);

assert.equal(batch.publicationEligible, false);
assert.equal(batch.humanClinicalReviewRequired, true);
assert.deepEqual(batch.substances.map(x => x.id).sort(), [
  'amoxicillin',
  'amoxicillin-clavulanic-acid',
  'ceftriaxone',
  'trimethoprim-sulfamethoxazole',
].sort());

const allowedDurationTypes = new Set(schema.durationModel.types);
for (const substance of batch.substances) {
  assert.ok(substance.inn);
  assert.ok(substance.source);
  assert.ok(Array.isArray(substance.regimens) && substance.regimens.length > 0);
  for (const regimen of substance.regimens) {
    assert.ok(regimen.id);
    assert.ok(regimen.indicationId);
    assert.ok(regimen.population);
    assert.ok(regimen.route);
    assert.ok(regimen.dose);
    assert.ok(regimen.frequency);
    assert.ok(regimen.duration);
    assert.ok(allowedDurationTypes.has(regimen.duration.type), `${regimen.id}: invalid duration type`);
    if (regimen.duration.type === 'fixed_days') assert.ok(regimen.duration.days > 0);
    if (regimen.duration.type === 'range_days') {
      assert.ok(regimen.duration.minDays > 0);
      assert.ok(regimen.duration.maxDays >= regimen.duration.minDays);
    }
  }
}

const bySubstance = new Map(batch.substances.map(x => [x.id, x]));
const amox = bySubstance.get('amoxicillin');
assert.ok(amox.regimens.some(r => r.id === 'amox-aom-adult-severe' && r.duration.days === 10));
assert.ok(amox.regimens.some(r => r.id === 'amox-hpylori-adult' && r.duration.days === 7));
assert.ok(amox.regimens.some(r => r.id === 'amox-endocarditis-prophylaxis-adult' && r.duration.type === 'single_dose'));
assert.ok(amox.regimens.some(r => r.duration.type === 'guideline_or_response_based'));

const ctx = bySubstance.get('ceftriaxone');
assert.ok(ctx.regimens.some(r => r.id === 'ctx-gonorrhoea-adult' && r.duration.type === 'single_dose'));
assert.ok(ctx.regimens.some(r => r.id === 'ctx-aom-adult-failure' && r.duration.days === 3));
assert.ok(ctx.regimens.some(r => r.id === 'ctx-syphilis-adult' && r.duration.minDays === 10 && r.duration.maxDays === 14));
assert.ok(ctx.regimens.some(r => r.id === 'ctx-lyme-adult' && r.duration.minDays === 14 && r.duration.maxDays === 21));

const cotrim = bySubstance.get('trimethoprim-sulfamethoxazole');
assert.ok(cotrim.regimens.some(r => r.id === 'cotrim-uncomplicated-lower-uti' && r.duration.minDays === 1 && r.duration.maxDays === 3));
assert.ok(cotrim.regimens.some(r => r.id === 'cotrim-pjp-treatment-iv' && r.duration.days === 14));
assert.ok(cotrim.regimens.some(r => r.id === 'cotrim-standard-acute-infection' && r.duration.type === 'until_clinical_endpoint'));
assert.ok(cotrim.regimens.some(r => r.id === 'cotrim-pjp-prophylaxis' && r.duration.type === 'prophylaxis_while_at_risk'));

console.log('Dozologjia V5 antibiotic foundation + duration semantics passed.');
