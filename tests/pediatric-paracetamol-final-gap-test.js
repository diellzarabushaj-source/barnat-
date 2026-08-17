'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');

// DAFALGAN PEDIATRIE 30 mg/mL (#4013) must remain fail-closed until the
// country/marketing-authorisation identity of the registry row is known.
// The French same-CIS historical DAFALGAN -> EFFERALGAN product is 3–32 kg,
// while the currently marketed Belgian DAFALGAN PEDIATRIE 30 mg/mL has a
// different product population. The local row has no manufacturer/MA holder,
// so choosing one market's limits would be an unsafe identity inference.
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
  pediatric_max_daily_value:60,
  pediatric_max_daily_unit:'mg/kg/ditë',
  pediatric_concentration_value:30,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://base-donnees-publique.medicaments.gouv.fr/medicament/63390065/extrait; https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/',
  pediatric_verified_at:null,
};
assert.equal(classify(dafalgan4013).readiness, STATUS.TEXT_ONLY,
  'Ambiguous market identity must block automatic DAFALGAN calculation.');
assert.equal(calculate(dafalgan4013, { weightKg:10 }).outcome, OUTCOME.NOT_CALCULABLE);

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
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://www.atabay.com/ilac/parol-120-mg-5-ml-oral-suspansiyon/',
};
assert.equal(classify(parol120_467).readiness, STATUS.TEXT_ONLY);
assert.equal(calculate(parol120_467, { weightKg:10 }).outcome, OUTCOME.NOT_CALCULABLE);

console.log(
  'Pediatric paracetamol final-gap regression passed: ambiguous DAFALGAN identity is fail-closed, '
  + 'PAROL PLUS preserves manufacturer KÜB caps, and PAROL 120 stays quarantined.',
);
