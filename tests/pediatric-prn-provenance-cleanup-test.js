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

// PANTENOL ointment (#2927): product-specific KÜB is verified, but directions
// vary by indication and are not represented as one universal pediatric formula.
const pantenolOintment = {
  ...base,
  pediatric_verification_status:'verified',
  pediatric_verified_at:'2026-08-18',
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_route:'TOP',
  pediatric_source_url:'https://sabailac.com.tr/assets/urunler/kub/pantenol-5-pomad-kub-26082014.pdf',
};
assert.equal(scheduleOf(pantenolOintment).mode, 'unspecified');
assert.equal(classify(pantenolOintment).readiness, STATUS.TEXT_ONLY,
  'Verified topical directions must remain text-only without a universal typed dose model.');

// Ibum Sport gel (#1686) and IBUM EXPRESS 400 mg (#1688): source-backed text
// is verified, while ambiguous >12-year boundaries / non-formula directions stay TEXT_ONLY.
for (const row of [
  {
    ...base,
    pediatric_verification_status:'verified',
    pediatric_verified_at:'2026-08-18',
    pediatric_route:'TOP',
    pediatric_source_url:'https://www.hasco-lek.pl/produkty/ibum-sport-zel/',
  },
  {
    ...base,
    pediatric_verification_status:'verified',
    pediatric_verified_at:'2026-08-18',
    pediatric_route:'PO',
    pediatric_source_url:'https://www.hasco-lek.pl/produkty/ibum-express-forte/',
  },
]) {
  assert.equal(scheduleOf(row).mode, 'unspecified');
  assert.equal(classify(row).readiness, STATUS.TEXT_ONLY,
    'Verified narrative directions must not become formulas just because the source is official.');
}

// SOSARIA (#2151): regulator-backed adult-only FDC status is verified, so the
// classifier must block calculation as NOT_RECOMMENDED before any arithmetic.
const sosaria = {
  ...base,
  pediatric_use_status:'NUK REKOMANDOHET',
  pediatric_verification_status:'verified',
  pediatric_verified_at:'2026-08-18',
  pediatric_source_url:'https://www.aifa.gov.it/en/-/modifica-di-indicazioni-e-popolazione-autorizzata-dei-medicinali-a-base-dell-associazione-fissa-fdc',
};
assert.equal(classify(sosaria).readiness, STATUS.NOT_RECOMMENDED);

// Paroxetina GP (#1679): exact product identity + EMA paediatric referral support
// a verified NOT_RECOMMENDED record, never a paediatric formula.
const paroxetinaGp = {
  ...base,
  pediatric_use_status:'NUK REKOMANDOHET',
  pediatric_verification_status:'verified',
  pediatric_verified_at:'2026-08-18',
  pediatric_source_url:'https://www.ema.europa.eu/en/medicines/human/referrals/paroxetine',
};
assert.equal(classify(paroxetinaGp).readiness, STATUS.NOT_RECOMMENDED);

// Biolis (#2227) and TYLOLFEN HOT (#2419): linked sources belong to a different
// product form/composition. needs_source must remain fail-closed even if someone
// later adds numbers to editorial fields without resolving product identity.
for (const row of [
  {
    ...base,
    pediatric_use_status:'PA TË DHËNA',
    pediatric_verification_status:'needs_source',
    pediatric_verified_at:null,
    pediatric_source_url:'https://biolisgel.com/',
  },
  {
    ...base,
    pediatric_use_status:'PA TË DHËNA',
    pediatric_verification_status:'needs_source',
    pediatric_verified_at:null,
    pediatric_source_url:'https://kosova.nobel.com.tr/produkte/barna/tylol-hot-500mg-4mg-60mg-12-qeska',
  },
]) {
  assert.equal(scheduleOf(row).mode, 'unspecified');
  assert.equal(classify(row).readiness, STATUS.INSUFFICIENT_DATA);
}

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
  + 'official text-only promotions remain non-calculable, product mismatches stay fail-closed, '
  + 'unsupported inherited sources remain blocked, and Pirofen metadata does not auto-activate calculation.',
);
