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
  + 'daily caps remain enforceable, and fixed-dose weight boundaries require patient weight.',
);
