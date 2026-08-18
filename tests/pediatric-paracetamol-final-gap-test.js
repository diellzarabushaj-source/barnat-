'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');

// DAFALGAN PEDIATRIE 30 mg/mL (#4013) is an exact Belgian external reference.
// The primary UPSA Belgium leaflet (BE123776, approved 03/2025) verifies the
// narrative regimen, but the dosing-device instructions are explicit for 4–32 kg
// while the product is generally reserved for children <50 kg. MedIndex therefore
// verifies the source as TEXT_ONLY and keeps every typed dose/schedule/cap field empty.
const dafalgan4013 = {
  pediatric_indication:'Trajtim simptomatik i dhimbjes dhe temperaturës',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_weight_kg:null,
  pediatric_max_weight_kg:null,
  pediatric_dose_min:null,
  pediatric_dose_max:null,
  pediatric_dose_unit:null,
  pediatric_dose_basis:null,
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:null,
  pediatric_min_interval_hours:null,
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:null,
  pediatric_concentration_value:30,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1,
  pediatric_concentration_per_unit:'mL',
  pediatric_route:'PO',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://dafalgan.be/nl/product/dafalgan-pediatrie-30mgml/; https://cms.dafalgan.be/s3fs-public/2025-04/250307-be-pil_dafsolution-nl_clean-last.pdf',
  pediatric_verified_at:'2026-08-18',
};
assert.equal(classify(dafalgan4013).readiness, STATUS.TEXT_ONLY,
  'Exact Belgian DAFALGAN may be verified narratively without activating a typed dosing formula.');
assert.equal(calculate(dafalgan4013, { weightKg:10 }).outcome, OUTCOME.NOT_CALCULABLE);
assert.equal(calculate(dafalgan4013, { weightKg:35 }).outcome, OUTCOME.NOT_CALCULABLE,
  'The >32 kg band must not be inferred from the general <50 kg product population.');

// PAROL PLUS 250 mg/5 mL (#466).
// Manufacturer KÜB explicitly recommends q6h 10–15 mg/kg/dose, with an
// absolute minimum 4 h interval and <=4 administrations/day. For >30 kg the
// KÜB adds 500 mg/dose and 2 g/day ceilings.
const parolPlus466 = {
  pediatric_indication:'dhimbje; temperaturë; ethe',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_age_value:6,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:17,
  pediatric_max_age_unit:'vjet',
  pediatric_dose_min:10,
  pediatric_dose_max:15,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:4,
  pediatric_interval_hours:6,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:4,
  pediatric_max_single_value:500,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:2000,
  pediatric_max_daily_unit:'mg',
  pediatric_concentration_value:250,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://www.atabay.com/wp-content/uploads/2022/12/PAROL-PLUS-250-KUB.pdf',
  pediatric_verified_at:'2026-08-17',
};

const parolPlusReady = classify(parolPlus466);
assert.equal(parolPlusReady.readiness, STATUS.CALCULATOR_READY);
assert.equal(parolPlusReady.schedule.mode, 'fixed');
assert.equal(parolPlusReady.schedule.maxDosesPerDay, 4);
assert.equal(parolPlusReady.schedule.minIntervalHours, 4);

const parolPlus20kg = calculate(parolPlus466, {
  weightKg:20,
  ageValue:8,
  ageUnit:'vjet',
});
assert.equal(parolPlus20kg.outcome, OUTCOME.CALCULATED);
assert.deepEqual(parolPlus20kg.perDose, { min:200, max:300 });
assert.deepEqual(parolPlus20kg.daily, { min:800, max:1200 });
assert.equal(parolPlus20kg.dosesPerDay, 4);
assert.equal(parolPlus20kg.schedule.minIntervalHours, 4);
assert.equal(parolPlus20kg.schedule.maxDosesPerDay, 4);
assert.deepEqual(parolPlus20kg.cappedBy, [],
  'Absolute >30 kg caps must not alter a 20 kg child dose.');

const parolPlus40kg = calculate(parolPlus466, {
  weightKg:40,
  ageValue:12,
  ageUnit:'vjet',
});
assert.equal(parolPlus40kg.outcome, OUTCOME.CALCULATED);
assert.deepEqual(parolPlus40kg.perDose, { min:400, max:500 },
  'At >30 kg the upper dose must be capped at 500 mg.');
assert.deepEqual(parolPlus40kg.daily, { min:1600, max:2000 },
  'At >30 kg the daily upper bound must not exceed 2 g.');
assert.ok(parolPlus40kg.cappedBy.includes('maxSingle'));
assert.ok(parolPlus40kg.steps.some(step => step.label === 'Maks. për dozë' && step.value === 500));
assert.ok(parolPlus40kg.steps.some(step => step.label === 'Maks. në 24h' && step.value === 2000));

// PAROL 120 mg/5 mL (#467) stays fail-closed until a directly retrievable
// primary KÜB/RCP is bound to this exact product record.
const parol120_467 = {
  pediatric_indication:'dhimbje; temperaturë; ethe',
  pediatric_use_status:'KUFIZUAR',
  pediatric_dose_min:10,
  pediatric_dose_max:15,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:4,
  pediatric_interval_hours:6,
  pediatric_concentration_value:120,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'needs_source',
  pediatric_source_url:'https://www.atabay.com/ilac/parol-120-mg-5-ml-oral-suspansiyon/',
};
assert.equal(classify(parol120_467).readiness, STATUS.TEXT_ONLY);
assert.equal(calculate(parol120_467, { weightKg:10 }).outcome, OUTCOME.NOT_CALCULABLE);

console.log(
  'Pediatric paracetamol final-gap regression passed: exact Belgian DAFALGAN is verified TEXT_ONLY with no typed dose model, '
  + 'PAROL PLUS preserves manufacturer KÜB caps, and PAROL 120 stays needs_source.',
);
