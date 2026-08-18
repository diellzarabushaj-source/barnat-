'use strict';

const assert = require('node:assert/strict');
const { STATUS, classify } = require('../lib/pediatric-readiness.js');
const { OUTCOME, calculate } = require('../lib/pediatric-calculation.js');
const { scheduleOf } = require('../lib/pediatric-schedule.js');

function assertFailClosed(row, label) {
  const readiness = classify(row);
  assert.notEqual(readiness.readiness, STATUS.CALCULATOR_READY, `${label} must not be calculator-ready.`);
  assert.equal(calculate(row, {}).outcome, OUTCOME.NOT_CALCULABLE, `${label} must not calculate.`);
}

const coldaway = {
  pediatric_indication:'Ftohje/grip me kongjestion, dhimbje dhe temperaturë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_age_value:12,
  pediatric_min_age_unit:'vjet',
  pediatric_max_age_value:null,
  pediatric_max_age_unit:null,
  pediatric_min_weight_kg:null,
  pediatric_max_weight_kg:null,
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
assert.equal(scheduleOf(coldaway).maxDosesPerDay, null,
  'Coldaway six-tablet/24h ceiling must never become six administrations.');
assertFailClosed(coldaway, 'Coldaway multiphase regimen');

const mucosoft = {
  pediatric_indication:'Kollë/ftohje me temperaturë dhe sekrecione',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_age_value:12,
  pediatric_min_age_unit:'vjet',
  pediatric_dose_min:null,
  pediatric_dose_max:null,
  pediatric_dose_unit:null,
  pediatric_dose_basis:null,
  pediatric_doses_per_day:null,
  pediatric_interval_hours:null,
  pediatric_max_doses_per_day:null,
  pediatric_min_interval_hours:null,
  pediatric_max_single_value:1,
  pediatric_max_single_unit:'qese',
  pediatric_max_daily_value:null,
  pediatric_max_daily_unit:null,
  pediatric_concentration_value:null,
  pediatric_concentration_unit:null,
  pediatric_concentration_per_value:null,
  pediatric_concentration_per_unit:null,
  pediatric_route:'PO',
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://adipharm.com/en/product/mukosoft-kompleks-200-mg',
  pediatric_verified_at:null,
};
assert.equal(mucosoft.pediatric_max_daily_value, null,
  'Mucosoft must not infer max three sachets/day from ingredient arithmetic.');
assertFailClosed(mucosoft, 'Mucosoft contradictory source');

const ketonal = {
  pediatric_indication:'Dhimbje/inflamacion — exact pediatric quantitative regimen pending primary SPC ingestion',
  pediatric_use_status:'KUFIZUAR',
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
  pediatric_route:'PO',
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://www.sukl.sk/ketonal-forte-100-mg-76653',
  pediatric_verified_at:null,
};
assert.equal(scheduleOf(ketonal).mode, 'unspecified');
assertFailClosed(ketonal, 'Ketonal forte primary-SPC blocker');

const colistin = {
  pediatric_indication:'Infeksione sistemike — exact pediatric product posology pending primary RCP ingestion',
  pediatric_use_status:'KUFIZUAR',
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
  pediatric_route:'IV',
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://www.normahellas.gr/en/Products/antiinfectives-systemic-use/colistin-norma2',
  pediatric_verified_at:null,
};
assert.equal(scheduleOf(colistin).mode, 'unspecified');
assertFailClosed(colistin, 'Colistin/Norma primary-RCP blocker');

const dafalgan = {
  pediatric_indication:'Dhimbje e lehtë–mesatare; temperaturë',
  pediatric_use_status:'KUFIZUAR',
  pediatric_min_age_value:null,
  pediatric_min_age_unit:null,
  pediatric_max_age_value:null,
  pediatric_max_age_unit:null,
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
  pediatric_verification_status:'in_review',
  pediatric_source_url:'https://dafalgan.be/nl/dafalgan-voor-babys-en-kinderen/',
  pediatric_verified_at:null,
};
assert.equal(dafalgan.pediatric_min_weight_kg, null);
assert.equal(dafalgan.pediatric_max_weight_kg, null);
assert.equal(dafalgan.pediatric_dose_basis, null,
  'Belgian external-reference DAFALGAN must not inherit the historical French 3–32 kg typed model.');
assertFailClosed(dafalgan, 'DAFALGAN market-identity/weight-boundary blocker');

console.log(
  'Final pediatric source-hardening passed: Coldaway stays verified TEXT_ONLY, '
  + 'Mucosoft keeps its unresolved official-source contradiction, and Ketonal/Colistin/DAFALGAN '
  + 'remain fail-closed until exact primary quantitative evidence is ingested.',
);
