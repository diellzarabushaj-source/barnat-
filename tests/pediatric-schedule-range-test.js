'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');
const { scheduleOf } = require('../lib/pediatric-schedule.js');

const BASE = Object.freeze({
  pediatric_indication:'Infeksione të pakomplikuara të traktit urinar të poshtëm nga E. coli',
  pediatric_use_status:'KUFIZUAR',
  pediatric_dose_min:5,
  pediatric_dose_max:7,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/ditë',
  pediatric_doses_per_day:2,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:3,
  pediatric_min_interval_hours:null,
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:7,
  pediatric_max_daily_unit:'mg/kg/ditë',
  pediatric_min_age_value:4,
  pediatric_min_age_unit:'muaj',
  pediatric_max_age_value:null,
  pediatric_max_age_unit:null,
  pediatric_restriction:'Nuk përdoret te fëmijët deri në 3 muaj; ky rresht ruan kufirin konservativ 4 muaj.',
  pediatric_concentration_value:10,
  pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1,
  pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://rejestrymedyczne.ezdrowie.gov.pl/api/rpl/medicinal-products/38772/characteristic',
  pediatric_verified_at:'2026-08-17',
});

const schedule = scheduleOf(BASE);
assert.equal(schedule.mode, 'range');
assert.equal(schedule.minDosesPerDay, 2);
assert.equal(schedule.maxDosesPerDay, 3);
assert.equal(schedule.effectiveMaxDosesPerDay, 3);
assert.equal(schedule.exactDosesPerDay, null);
assert.deepEqual(schedule.issues, []);

const ready = classify(BASE);
assert.equal(ready.readiness, STATUS.CALCULATOR_READY);
assert.equal(ready.schedule.mode, 'range');
assert.equal(ready.requires.weight, true);
assert.equal(ready.requires.age, true);

const result = calculate(BASE, { weightKg:20, ageValue:2, ageUnit:'vjet' });
assert.equal(result.outcome, OUTCOME.CALCULATED);
assert.equal(result.schedule.mode, 'range');
assert.equal(result.schedule.minDosesPerDay, 2);
assert.equal(result.schedule.maxDosesPerDay, 3);
assert.equal(result.dosesPerDay, null,
  'Një range 2–3/ditë nuk duhet të ekspozohet si një frekuencë e vetme.');
assert.deepEqual(result.daily, { min:100, max:140 });
assert.deepEqual(result.perDose, { min:33.33, max:70 });
assert.equal(result.measure.min.unit, 'mL');
assert.equal(result.measure.max.unit, 'mL');
assert.equal(result.measure.min.amount, 3.3);
assert.equal(result.measure.max.amount, 7);
assert.ok(result.steps.some(step => step.label === 'Administrime / 24h' && step.value === '2–3'));
assert.ok(result.warnings.some(item => /nuk zgjedh automatikisht një frekuencë/.test(item)));

// Backward compatibility: vetëm doses_per_day mbetet schedule fixed.
const fixed = scheduleOf({ pediatric_doses_per_day:3 });
assert.equal(fixed.mode, 'fixed');
assert.equal(fixed.exactDosesPerDay, 3);
assert.equal(fixed.minDosesPerDay, null);

// Vetëm max_doses_per_day mbetet PRN ceiling, jo range.
const prn = scheduleOf({ pediatric_max_doses_per_day:3 });
assert.equal(prn.mode, 'prn-limit');
assert.equal(prn.minDosesPerDay, null);
assert.equal(prn.maxDosesPerDay, 3);

// Një range nuk lejohet të maskohet me interval fiks paralel.
const contradictory = classify({
  ...BASE,
  pediatric_interval_hours:12,
});
assert.equal(contradictory.readiness, STATUS.TEXT_ONLY);
assert.ok(contradictory.reasons.some(item => /interval administrimesh/.test(item)));

// TANFLEX COLDAWAY / COLDAWAY COLD & FLU #28: the official KÜB has an initial
// 2-tablet dose followed by 1–2 tablets PRN at >=4 h, with a ceiling of six
// TABLETS/24h. Six tablets must never be interpreted as six administrations.
const coldaway = {
  pediatric_indication:'Ftohje/grip me kongjestion, dhimbje dhe temperaturë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_age_value:12,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:null,
  pediatric_max_age_unit:null,
  pediatric_dose_min:null,
  pediatric_dose_max:null,
  pediatric_dose_unit:null,
  pediatric_dose_basis:null,
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:null,
  pediatric_min_interval_hours:4,
  pediatric_max_single_value:2,
  pediatric_max_single_unit:'tableta',
  pediatric_max_daily_value:6,
  pediatric_max_daily_unit:'tableta',
  pediatric_route:'PO',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://www.abdiibrahim.com.tr/Uploads/Product/prospektus/coldaway/1311-kub-temiz.pdf',
  pediatric_verified_at:'2026-08-18',
};
const coldawaySchedule = scheduleOf(coldaway);
assert.equal(coldawaySchedule.mode, 'prn-limit');
assert.equal(coldawaySchedule.exactDosesPerDay, null);
assert.equal(coldawaySchedule.maxDosesPerDay, null,
  'The six-tablet daily ceiling is not a six-administration ceiling.');
assert.equal(coldawaySchedule.minIntervalHours, 4);
assert.equal(classify(coldaway).readiness, STATUS.TEXT_ONLY,
  'A verified initial + PRN multi-phase regimen must stay TEXT_ONLY without one universal dose basis.');

console.log(
  'Pediatric schedule-range safety passed: verified 2–3/day regimens remain ranges, '
  + 'daily-dose math stays intact, Coldaway tablet ceilings never become administration counts, '
  + 'and the server never invents one exact frequency.',
);
