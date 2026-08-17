'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');

/*
 * Registry #94 — Faringobloc.
 * Official source wording for children 4–12 years is "up to 4 lozenges,
 * to take every few hours". The numeric 4 is therefore an administration
 * ceiling, never an exact routine frequency. "Every few hours" must remain
 * non-numeric; the engine must not invent q4h/q6h from it.
 */
const FARINGOBLOC = Object.freeze({
  pediatric_indication:'Dhimbje/inflamacion i fytit – antiseptik/anestezik lokal',
  pediatric_use_status:'KUFIZUAR',
  pediatric_restriction:'Nën 4 vjeç nuk përdoret.',
  pediatric_dose_min:1,
  pediatric_dose_max:1,
  pediatric_dose_unit:'unit',
  pediatric_dose_basis:'dozë fikse',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:null,
  pediatric_max_single_value:1,
  pediatric_max_single_unit:'pastilë',
  pediatric_max_daily_value:4,
  pediatric_max_daily_unit:'pastila',
  pediatric_min_age_value:4,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:12,
  pediatric_max_age_unit:'vjet',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://adipharm.com/en/product/faringobloc-5-mg',
  pediatric_source_section:'Pediatric population / Posology and method of administration',
  pediatric_verified_at:'2026-08-12T13:07:39.801Z',
  pediatric_primary_regimen_id:'card:94:pediatric',
});

const readiness = classify(FARINGOBLOC);
assert.equal(readiness.readiness, STATUS.CALCULATOR_READY);
assert.equal(readiness.requires.age, true);
assert.equal(readiness.schedule.mode, 'prn-limit');
assert.equal(readiness.schedule.maxDosesPerDay, 4);
assert.equal(readiness.schedule.minIntervalHours, null);
assert.equal(readiness.schedule.effectiveMaxDosesPerDay, 4);

const child = calculate(FARINGOBLOC, { ageValue:8, ageUnit:'vjet' });
assert.equal(child.outcome, OUTCOME.CALCULATED);
assert.equal(child.perDose.min, 1);
assert.equal(child.perDose.max, 1);
assert.equal(child.dosesPerDay, null,
  'Maximum 4/day must never be exposed as a routine 4-times-daily schedule.');
assert.equal(child.daily, null,
  'PRN safety envelope must never be presented as a prescribed daily total.');
assert.equal(child.schedule.mode, 'prn-limit');
assert.equal(child.schedule.maxDosesPerDay, 4);
assert.equal(child.schedule.minIntervalHours, null,
  '"Every few hours" is not a verified numeric interval and must stay null.');
assert.ok(child.steps.some(item => item.label === 'Maks. administrime / 24h' && item.value === 4));
assert.ok(!child.steps.some(item => item.label === 'Intervali minimal'),
  'The UI explanation must not invent a minimum interval.');

const tooYoung = calculate(FARINGOBLOC, { ageValue:3, ageUnit:'vjet' });
assert.equal(tooYoung.outcome, OUTCOME.OUT_OF_RANGE);

console.log(
  'Pediatric Faringobloc #94 passed: max 4/day remains a PRN ceiling, '
  + '"every few hours" stays non-numeric, and age 4–12 is enforced.',
);
