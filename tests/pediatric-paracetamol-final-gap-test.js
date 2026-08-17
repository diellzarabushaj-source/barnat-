'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');

// DAFALGAN PEDIATRIE / current same-CIS EFFERALGAN PEDIATRIQUE 30 mg/mL (#4013).
// Official ANSM/BDPM regimen: 3–32 kg, 15 mg/kg/dose, renew only if needed
// after >=6 h, max 4 administrations/day, approx 60 mg/kg/day.
const dafalgan4013 = {
  pediatric_indication:'dhimbje e lehtë–mesatare; temperaturë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_weight_kg:3,
  pediatric_max_weight_kg:32,
  pediatric_dose_min:15,
  pediatric_dose_max:15,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:6,
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:60,
  pediatric_max_daily_unit:'mg/kg/ditë',
  pediatric_concentration_value:30,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait',
  pediatric_verified_at:'2026-08-17',
};

const dafalganReady = classify(dafalgan4013);
assert.equal(dafalganReady.readiness, STATUS.CALCULATOR_READY);
assert.equal(dafalganReady.requires.weight, true);
assert.equal(dafalganReady.schedule.mode, 'prn-limit');
assert.equal(dafalganReady.schedule.maxDosesPerDay, 4);
assert.equal(dafalganReady.schedule.minIntervalHours, 6);

const dafalgan10kg = calculate(dafalgan4013, { weightKg:10 });
assert.equal(dafalgan10kg.outcome, OUTCOME.CALCULATED);
assert.equal(dafalgan10kg.perDose.min, 150);
assert.equal(dafalgan10kg.perDose.max, 150);
assert.equal(dafalgan10kg.dosesPerDay, null,
  'PRN ceiling must not become a routine four-times-daily prescription.');
assert.equal(dafalgan10kg.daily, null,
  'PRN safety envelope must not be exposed as a prescribed daily total.');
assert.equal(dafalgan10kg.schedule.maxDosesPerDay, 4);
assert.equal(dafalgan10kg.schedule.minIntervalHours, 6);
assert.ok(dafalgan10kg.steps.some(step => step.label === 'Maks. administrime / 24h' && step.value === 4));
assert.ok(dafalgan10kg.steps.some(step => step.label === 'Intervali minimal' && step.value === 6));

assert.equal(calculate(dafalgan4013, { weightKg:2.9 }).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(dafalgan4013, { weightKg:32.1 }).outcome, OUTCOME.OUT_OF_RANGE);

// PAROL PLUS 250 mg/5 mL (#466).
// Manufacturer KÜB explicitly recommends q6h 10–15 mg/kg/dose, while also
// defining a 4 h absolute minimum interval, <=4 administrations/day and a
// 60 mg/kg/day ceiling. Exact q6h therefore remains the regimen; 4 h is safety.
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
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:60,
  pediatric_max_daily_unit:'mg/kg/ditë',
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
assert.equal(parolPlusReady.schedule.mode, 'exact');
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
assert.ok(parolPlus20kg.cappedBy.length === 0,
  'At 20 kg the verified 15 mg/kg x4 regimen exactly reaches, but does not exceed, 60 mg/kg/day.');

// PAROL 120 mg/5 mL (#467) stays fail-closed until the primary product KÜB/RCP
// is directly bound. Keeping historical typed values must never bypass status.
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
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://www.atabay.com/ilac/parol-120-mg-5-ml-oral-suspansiyon/',
};
assert.equal(classify(parol120_467).readiness, STATUS.TEXT_ONLY);
assert.equal(calculate(parol120_467, { weightKg:10 }).outcome, OUTCOME.NOT_CALCULABLE);

console.log(
  'Pediatric paracetamol final-gap regression passed: DAFALGAN PRN ceilings remain limits, '
  + 'PAROL PLUS preserves source-backed q6h plus hard safety caps, and PAROL 120 stays quarantined.',
);
