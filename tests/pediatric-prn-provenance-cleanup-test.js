'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { scheduleOf } = require('../lib/pediatric-schedule.js');

const base = {
  pediatric_indication:'test',
  pediatric_use_status:'KUFIZUAR',
  pediatric_dose_min:null,
  pediatric_dose_max:null,
  pediatric_dose_unit:null,
  pediatric_dose_basis:null,
  pediatric_max_single_value:null,
  pediatric_max_single_unit:null,
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:null,
  pediatric_source_url:'https://example.test/source',
  pediatric_verified_at:'2026-08-17',
};

// NORMOSTOP: age bands have q8h and q6–8h. No universal exact schedule.
const normostop = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:null,
  pediatric_min_interval_hours:null,
};
assert.equal(scheduleOf(normostop).mode, 'unspecified');
assert.equal(classify(normostop).readiness, STATUS.TEXT_ONLY);

// TYLOL HOT PEDIATRIC: official source says 3–4/day with >=6 h spacing.
const tylol = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_doses_per_day:3,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:6,
};
const tylolSchedule = scheduleOf(tylol);
assert.equal(tylolSchedule.mode, 'range');
assert.equal(tylolSchedule.minDosesPerDay, 3);
assert.equal(tylolSchedule.maxDosesPerDay, 4);
assert.equal(tylolSchedule.minIntervalHours, 6);
assert.equal(classify(tylol).readiness, STATUS.TEXT_ONLY,
  'Schedule semantics alone must not make an unmodeled sachet dose calculable.');

// CODEINE PHOSPHATE 15 mg: q6h is PRN, not a routine fixed schedule.
const codeine = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:6,
  pediatric_max_single_value:60,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:240,
  pediatric_max_daily_unit:'mg',
};
const codeineSchedule = scheduleOf(codeine);
assert.equal(codeineSchedule.mode, 'prn-limit');
assert.equal(codeineSchedule.exactDosesPerDay, null);
assert.equal(codeineSchedule.maxDosesPerDay, 4);
assert.equal(codeineSchedule.minIntervalHours, 6);
assert.equal(classify(codeine).readiness, STATUS.TEXT_ONLY,
  'Opioid PRN safety caps must not activate a calculator without a complete dose model.');

// PANTENOL cream: verified product-specific topical directions, but no universal schedule/calculation.
const pantenolCream = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_route:'TOP',
  pediatric_source_url:'https://sabailac.com.tr/assets/urunler/kub/pantenol-5-krem-kub-10.09.2024_fdb.pdf',
};
assert.equal(scheduleOf(pantenolCream).mode, 'unspecified');
assert.equal(classify(pantenolCream).readiness, STATUS.TEXT_ONLY);

// PANTENOL ointment: official product page exists, but posology remains under review.
const pantenolOintment = {
  ...base,
  pediatric_verification_status:'in_review',
  pediatric_verified_at:null,
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_route:'TOP',
};
assert.equal(classify(pantenolOintment).readiness, STATUS.TEXT_ONLY);

// DOLOKIDS and Minamol: product-specific pediatric dose provenance is missing.
for (const row of [
  {
    ...base,
    pediatric_verification_status:'needs_source',
    pediatric_verified_at:null,
    pediatric_source_url:'https://trepharm.com/otc-products/',
  },
  {
    ...base,
    pediatric_verification_status:'needs_source',
    pediatric_verified_at:null,
    pediatric_source_url:null,
  },
]) {
  assert.equal(scheduleOf(row).mode, 'unspecified');
  assert.equal(classify(row).readiness, STATUS.TEXT_ONLY);
}

// PIROFEN: KÜB-backed schedule/caps are retained as verified metadata, but dose_basis
// deliberately remains unset until age-band/formulation modeling is complete.
const pirofen = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_doses_per_day:4,
  pediatric_interval_hours:6,
  pediatric_max_doses_per_day:4,
  pediatric_min_interval_hours:4,
  pediatric_max_single_value:500,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:2000,
  pediatric_max_daily_unit:'mg',
  pediatric_source_url:'https://devacomtr.s3.eu-west-2.amazonaws.com/urunler/kub/pirofen-120-mg5-ml-pediatrik-oral-suspansiyon-kub-10-04-2025.pdf',
};
const pirofenSchedule = scheduleOf(pirofen);
assert.equal(pirofenSchedule.mode, 'fixed');
assert.equal(pirofenSchedule.exactDosesPerDay, 4);
assert.equal(pirofenSchedule.minIntervalHours, 4);
assert.deepEqual(pirofenSchedule.issues, []);
assert.equal(classify(pirofen).readiness, STATUS.TEXT_ONLY,
  'Verified schedule/caps must not bypass the intentionally absent product dose basis.');

console.log(
  'Pediatric PRN/provenance cleanup passed: ranges stay ranges, PRN stays non-fixed, '
  + 'unsupported inherited sources remain fail-closed, and Pirofen metadata does not auto-activate calculation.',
);
