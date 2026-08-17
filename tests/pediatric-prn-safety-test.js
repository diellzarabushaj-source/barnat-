'use strict';

/*
 * PRN safety regression.
 * `max doses/day` dhe `min interval` janë vetëm ceiling/interval safety fields;
 * nuk duhet të shfaqen si frekuencë rutinë e rekomanduar.
 */

const assert = require('node:assert/strict');
const { STATUS, classify, _test:readinessTest } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');
const handler = require('../lib/pediatric-dosage-handler.js');

const BASE = Object.freeze({
  pediatric_indication:'Test',
  pediatric_use_status:'LEJOHET',
  pediatric_dose_min:10,
  pediatric_dose_max:10,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'dozë fikse',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_single_value:10,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:30,
  pediatric_max_daily_unit:'mg',
  pediatric_max_doses_per_day:3,
  pediatric_min_interval_hours:null,
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://example.test/smpc',
  pediatric_verified_at:'2026-08-17',
});

// Domperidone-like: fixed dose but eligibility includes a weight boundary.
const domperidone = {
  ...BASE,
  pediatric_min_age_value:12,
  pediatric_min_age_unit:'vjet',
  pediatric_min_weight_kg:35,
};
const domReady = classify(domperidone);
assert.equal(domReady.readiness, STATUS.CALCULATOR_READY);
assert.equal(domReady.requires.age, true);
assert.equal(domReady.requires.weight, true,
  'Doza fikse me kufi peshe duhet ta kërkojë peshën e pacientit.');
assert.equal(domReady.schedule.mode, 'prn-limit');
assert.equal(domReady.schedule.effectiveMaxDosesPerDay, 3);

const missingWeight = calculate(domperidone, { ageValue:14, ageUnit:'vjet' });
assert.equal(missingWeight.outcome, OUTCOME.NEEDS_PATIENT_DATA);
assert.ok(missingWeight.missing.includes('weightKg'));

const belowWeight = calculate(domperidone, { weightKg:34, ageValue:14, ageUnit:'vjet' });
assert.equal(belowWeight.outcome, OUTCOME.OUT_OF_RANGE);

const domCalculated = calculate(domperidone, { weightKg:40, ageValue:14, ageUnit:'vjet' });
assert.equal(domCalculated.outcome, OUTCOME.CALCULATED);
assert.equal(domCalculated.perDose.min, 10);
assert.equal(domCalculated.dosesPerDay, null,
  'PRN max administrations must not be exposed as routine doses/day.');
assert.equal(domCalculated.daily, null,
  'A PRN safety envelope must not be presented as a prescribed daily total.');
assert.equal(domCalculated.schedule.mode, 'prn-limit');
assert.equal(domCalculated.schedule.maxDosesPerDay, 3);
assert.ok(domCalculated.warnings.some(item => /nuk përfaqësojnë orar fiks/.test(item)));
assert.ok(domCalculated.steps.some(item => item.label === 'Maks. administrime / 24h' && item.value === 3));

// Chlorphenamine-like: q4–6h means minimum 4 h + maximum 6 administrations/day.
const chlorphenamine = {
  ...BASE,
  pediatric_dose_min:2,
  pediatric_dose_max:2,
  pediatric_max_single_value:2,
  pediatric_max_daily_value:12,
  pediatric_max_doses_per_day:6,
  pediatric_min_interval_hours:4,
  pediatric_min_age_value:6,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:12,
  pediatric_max_age_unit:'vjet',
};
const chlorReady = classify(chlorphenamine);
assert.equal(chlorReady.readiness, STATUS.CALCULATOR_READY);
assert.equal(chlorReady.schedule.maxDosesPerDay, 6);
assert.equal(chlorReady.schedule.minIntervalHours, 4);
assert.equal(chlorReady.schedule.effectiveMaxDosesPerDay, 6);

const chlorCalculated = calculate(chlorphenamine, { ageValue:8, ageUnit:'vjet' });
assert.equal(chlorCalculated.outcome, OUTCOME.CALCULATED);
assert.equal(chlorCalculated.perDose.min, 2);
assert.equal(chlorCalculated.dosesPerDay, null);
assert.equal(chlorCalculated.daily, null);
assert.ok(chlorCalculated.steps.some(item => item.label === 'Intervali minimal' && item.value === 4));

// Safety-envelope arithmetic: cap daily can reduce the per-dose ceiling without
// turning the maximum number of administrations into a routine schedule.
const envelopeCap = calculate({
  ...BASE,
  pediatric_dose_min:15,
  pediatric_dose_max:15,
  pediatric_max_single_value:20,
  pediatric_max_daily_value:30,
  pediatric_max_doses_per_day:3,
}, {});
assert.equal(envelopeCap.outcome, OUTCOME.CALCULATED);
assert.equal(envelopeCap.perDose.min, 10);
assert.ok(envelopeCap.cappedBy.includes('maxDaily'));
assert.equal(envelopeCap.dosesPerDay, null);
assert.equal(envelopeCap.daily, null);

// A minimum interval by itself creates a conservative 24h administration cap.
const minIntervalOnly = readinessTest.scheduleOf({ pediatric_min_interval_hours:5 });
assert.equal(minIntervalOnly.effectiveMaxDosesPerDay, 5);

// Exact schedule must not conflict with PRN safety ceiling.
const conflict = classify({
  ...BASE,
  pediatric_doses_per_day:4,
  pediatric_max_doses_per_day:3,
});
assert.equal(conflict.readiness, STATUS.TEXT_ONLY);
assert.ok(conflict.reasons.some(item => /tejkalon maksimumin e administrimeve/.test(item)));

// PRN administration counts have no meaning for a continuous infusion.
const continuous = classify({
  ...BASE,
  pediatric_dose_basis:'kg/orë',
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
  pediatric_max_daily_value:1000,
  pediatric_max_daily_unit:'mg',
  pediatric_max_doses_per_day:3,
});
assert.equal(continuous.readiness, STATUS.TEXT_ONLY);
assert.ok(continuous.reasons.some(item => /nuk vlejnë për një infuzion/.test(item)));

// ---------------------------------------------------------------------------
// Reviewed live-product regressions from the 2026-08-17 pediatric audit.
// These fixtures intentionally mirror only the typed fields that affect the
// calculator; they do not replace the source-of-truth product records.

// REGLAN / metoclopramide 10 mg tablet (#178): the product-specific tablet row
// is calculable only for the 15–18 y / >=61 kg band. Max 3/day and 6 h are PRN
// safety limits, while the 0.5 mg/kg/day ceiling remains enforceable.
const reglanTablet178 = {
  ...BASE,
  pediatric_indication:'parandalim i vonuar i nauzesë/të vjellave nga kimioterapia (CINV), si linjë e dytë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_dose_min:10,
  pediatric_dose_max:10,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'dozë fikse',
  pediatric_min_age_value:15,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:18,
  pediatric_max_age_unit:'vjet',
  pediatric_min_weight_kg:61,
  pediatric_max_doses_per_day:3,
  pediatric_min_interval_hours:6,
  pediatric_max_single_value:10,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:0.5,
  pediatric_max_daily_unit:'mg/kg/ditë',
  pediatric_source_url:'https://www.medicines.org.uk/emc/product/6213/smpc',
};
const reglanReady = classify(reglanTablet178);
assert.equal(reglanReady.readiness, STATUS.CALCULATOR_READY);
assert.equal(reglanReady.requires.age, true);
assert.equal(reglanReady.requires.weight, true);
assert.equal(reglanReady.schedule.mode, 'prn-limit');
assert.equal(reglanReady.schedule.maxDosesPerDay, 3);
assert.equal(reglanReady.schedule.minIntervalHours, 6);

const reglanAtBoundary = calculate(reglanTablet178, {
  ageValue:15,
  ageUnit:'vjet',
  weightKg:61,
});
assert.equal(reglanAtBoundary.outcome, OUTCOME.CALCULATED);
assert.equal(reglanAtBoundary.perDose.min, 10);
assert.equal(reglanAtBoundary.perDose.max, 10);
assert.equal(reglanAtBoundary.dosesPerDay, null);
assert.equal(reglanAtBoundary.daily, null);
assert.equal(reglanAtBoundary.schedule.maxDosesPerDay, 3);
assert.equal(reglanAtBoundary.schedule.minIntervalHours, 6);
assert.ok(reglanAtBoundary.steps.some(item => item.label === 'Maks. administrime / 24h' && item.value === 3));
assert.ok(reglanAtBoundary.steps.some(item => item.label === 'Intervali minimal' && item.value === 6));

assert.equal(
  calculate(reglanTablet178, { ageValue:15, ageUnit:'vjet', weightKg:60 }).outcome,
  OUTCOME.OUT_OF_RANGE,
  'REGLAN 10 mg tablet must not calculate below 61 kg.',
);
assert.equal(
  calculate(reglanTablet178, { ageValue:14, ageUnit:'vjet', weightKg:61 }).outcome,
  OUTCOME.OUT_OF_RANGE,
  'REGLAN 10 mg tablet must not calculate below the product-specific age band.',
);

// CODAMOL (#83): q6h when needed is not a routine four-times-daily schedule.
const codamol83 = {
  ...BASE,
  pediatric_indication:'Dhimbje e moderuar–e fortë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_dose_min:1,
  pediatric_dose_max:1,
  pediatric_dose_unit:'unit',
  pediatric_dose_basis:'dozë fikse',
  pediatric_min_age_value:12,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:15,
  pediatric_max_age_unit:'vjet',
  pediatric_max_single_value:1,
  pediatric_max_single_unit:'tabletë',
  pediatric_max_daily_value:4,
  pediatric_max_daily_unit:'tableta',
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:6,
  pediatric_source_url:'https://www.medicines.org.uk/emc/product/4457/smpc',
};
const codamolResult = calculate(codamol83, { ageValue:13, ageUnit:'vjet' });
assert.equal(codamolResult.outcome, OUTCOME.CALCULATED);
assert.equal(codamolResult.perDose.min, 1);
assert.equal(codamolResult.dosesPerDay, null);
assert.equal(codamolResult.daily, null);
assert.equal(codamolResult.schedule.mode, 'prn-limit');
assert.equal(codamolResult.schedule.maxDosesPerDay, 4);
assert.equal(codamolResult.schedule.minIntervalHours, 6);

// TANFLEX COLDAWAY (#28) has an initial loading dose followed by maintenance
// PRN dosing; the current single-phase engine must fail closed.
const tanflex28 = {
  ...BASE,
  pediatric_verification_status:'in_review',
  pediatric_dose_min:1,
  pediatric_dose_max:2,
  pediatric_dose_unit:'unit',
  pediatric_dose_basis:'dozë fikse',
  pediatric_max_single_value:2,
  pediatric_max_single_unit:'tableta',
  pediatric_max_daily_value:6,
  pediatric_max_daily_unit:'tableta',
  pediatric_max_doses_per_day:6,
  pediatric_min_interval_hours:4,
};
assert.equal(classify(tanflex28).readiness, STATUS.TEXT_ONLY);
assert.equal(calculate(tanflex28, {}).outcome, OUTCOME.NOT_CALCULABLE);

// PAROL 500 mg tablet (#452) has a weight-based mass ceiling while the typed
// dose is a tablet count. The engine must not infer 500 mg from product strength.
const parol452 = {
  ...BASE,
  pediatric_verification_status:'in_review',
  pediatric_dose_min:0.5,
  pediatric_dose_max:1,
  pediatric_dose_unit:'unit',
  pediatric_dose_basis:'dozë fikse',
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:null,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:4,
};
assert.equal(classify(parol452).readiness, STATUS.TEXT_ONLY);
assert.equal(calculate(parol452, {}).outcome, OUTCOME.NOT_CALCULABLE);

// API select adapter must fetch the fields server-side; browser remains unable
// to submit max* fields because the inherited forbidden-input gate blocks them.
assert.ok(handler.PEDIATRIC_COLUMNS.includes('pediatric_max_doses_per_day'));
assert.ok(handler.PEDIATRIC_COLUMNS.includes('pediatric_min_interval_hours'));
const augmented = handler.augmentPediatricDrugSelect(
  'drugs?select=id,pediatric_dose_min,pediatric_dose_unit&limit=1',
);
const params = new URLSearchParams(augmented.split('?')[1]);
const selected = params.get('select').split(',');
assert.ok(selected.includes('pediatric_max_doses_per_day'));
assert.ok(selected.includes('pediatric_min_interval_hours'));
assert.ok(handler._test.FORBIDDEN_INPUT.test('maxDosesPerDay'));

console.log(
  'Pediatric PRN safety passed: max administrations/minimum interval stay safety limits, '
  + 'daily caps remain enforceable, reviewed product semantics stay locked, '
  + 'and fixed-dose weight boundaries require patient weight.',
);
