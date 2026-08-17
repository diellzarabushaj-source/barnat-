'use strict';

/*
 * Një tavan i vlefshëm si numër/njësi nuk mjafton: motori duhet të ketë edhe
 * një shteg real ku ta zbatojë. Këto teste mbrojnë dy mënyrat si një cap mund
 * të dukej i sigurt në DB, por të injorohej në aritmetikë:
 *
 *   1. një skemë per-dose/fixed me maxDaily, por pa frekuencë -> nuk ekziston
 *      total 24-orësh ku të aplikohet maxDaily;
 *   2. një infuzion i vazhdueshëm me maxSingle -> nuk ekziston dozë e vetme ku
 *      të aplikohet maxSingle.
 *
 * Në të dy rastet kalkulatori duhet të dështojë mbyllur, jo të vazhdojë pa cap.
 */

const assert = require('node:assert/strict');
const { STATUS, classify, _test } = require('../lib/pediatric-readiness.js');

const BASE = Object.freeze({
  pediatric_indication:'Test',
  pediatric_use_status:'LEJOHET',
  pediatric_dose_min:10,
  pediatric_dose_max:10,
  pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_max_single_value:500,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
  pediatric_verification_status:'verified',
});
const row = patch => ({ ...BASE, ...patch });

assert.equal(classify(BASE).readiness, STATUS.CALCULATOR_READY);

const dailyWithoutSchedule = classify(row({
  pediatric_max_daily_value:1000,
  pediatric_max_daily_unit:'mg',
}));
assert.equal(dailyWithoutSchedule.readiness, STATUS.TEXT_ONLY);
assert.ok(dailyWithoutSchedule.reasons.some(reason => /frekuenca mungon/.test(reason)));

assert.equal(classify(row({
  pediatric_max_daily_value:1000,
  pediatric_max_daily_unit:'mg',
  pediatric_interval_hours:12,
})).readiness, STATUS.CALCULATOR_READY);

const fixedDailyWithoutSchedule = classify(row({
  pediatric_dose_basis:'dozë fikse',
  pediatric_max_single_value:10,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:30,
  pediatric_max_daily_unit:'mg',
}));
assert.equal(fixedDailyWithoutSchedule.readiness, STATUS.TEXT_ONLY);
assert.ok(fixedDailyWithoutSchedule.reasons.some(reason => /frekuenca mungon/.test(reason)));

assert.equal(classify(row({
  pediatric_dose_basis:'dozë fikse',
  pediatric_max_single_value:10,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
})).readiness, STATUS.CALCULATOR_READY);

const rateSingle = classify(row({
  pediatric_dose_basis:'kg/orë',
  pediatric_max_single_value:10,
  pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:'',
}));
assert.equal(rateSingle.readiness, STATUS.TEXT_ONLY);
assert.ok(rateSingle.reasons.some(reason => /infuzion të vazhdueshëm/.test(reason)));

assert.equal(classify(row({
  pediatric_dose_basis:'kg/orë',
  pediatric_max_single_value:null,
  pediatric_max_single_unit:'',
  pediatric_max_daily_value:1000,
  pediatric_max_daily_unit:'mg',
})).readiness, STATUS.CALCULATOR_READY);

const helperRow = row({ pediatric_max_daily_value:1000, pediatric_max_daily_unit:'mg' });
const helperCaps = classify(helperRow).caps;
assert.ok(_test.capApplicabilityIssues(helperRow, helperCaps).length > 0);

console.log(
  'Pediatric cap applicability passed: çdo ceiling i deklaruar ka një shteg real '
  + 'ku motori mund ta zbatojë; përndryshe regjimi dështon mbyllur.',
);
