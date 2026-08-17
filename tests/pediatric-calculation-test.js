'use strict';

/*
 * Pediatric calculation regression suite.
 *
 * The clinician never supplies a formula. These tests prove that the server
 * derives dose, cap normalization and administration measure from typed Neon
 * fields plus patient measurements only. The unit cases are deliberately based
 * on failure modes seen in the live data: mcg dose with mg/mL concentration,
 * mg dose with g/day cap, weight-normalized daily caps and doses already in mL.
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { OUTCOME, calculate, _test } = require(path.join(ROOT, 'lib/pediatric-calculation.js'));
const { STATUS } = require(path.join(ROOT, 'lib/pediatric-readiness.js'));

const PER_DOSE_ROW = Object.freeze({
  pediatric_use_status:'LEJOHET',
  pediatric_indication:'Ethe',
  pediatric_dose_min:15, pediatric_dose_max:15, pediatric_dose_unit:'mg',
  pediatric_dose_basis:'kg/dozë',
  pediatric_doses_per_day:4,
  pediatric_max_single_value:1000, pediatric_max_single_unit:'mg',
  pediatric_max_daily_value:4000, pediatric_max_daily_unit:'mg',
  pediatric_concentration_value:120, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:5, pediatric_concentration_per_unit:'mL',
  pediatric_verification_status:'verified',
  pediatric_source_url:'https://www.bnf.org/', pediatric_verified_at:'2026-08-01',
});

const PER_DAY_ROW = Object.freeze({
  ...PER_DOSE_ROW,
  pediatric_dose_min:25, pediatric_dose_max:50,
  pediatric_dose_basis:'kg/ditë',
  pediatric_doses_per_day:3,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:250, pediatric_concentration_per_value:5,
});

const patient = (weightKg, extra = {}) => ({ weightKg, ...extra });

// --------------------------------------------------------- bazat kryesore

const simple = calculate(PER_DOSE_ROW, patient(20));
assert.equal(simple.outcome, OUTCOME.CALCULATED);
assert.equal(simple.perDose.min, 300);
assert.equal(simple.daily.min, 1200);
assert.equal(simple.measure.min.amount, 12.5);
assert.equal(simple.measure.min.unit, 'mL');
assert.equal(simple.unitSafety.measureMode, 'converted');

const daily = calculate(PER_DAY_ROW, patient(18));
assert.equal(daily.daily.min, 450);
assert.equal(daily.daily.max, 900);
assert.equal(daily.perDose.min, 150);
assert.equal(daily.perDose.max, 300);
assert.equal(daily.measure.min.amount, 3);
assert.equal(daily.measure.max.amount, 6);

const byInterval = calculate(
  { ...PER_DAY_ROW, pediatric_doses_per_day:null, pediatric_interval_hours:6 },
  patient(18),
);
assert.equal(byInterval.dosesPerDay, 4);
assert.equal(byInterval.perDose.min, 112.5);

const oddInterval = calculate(
  { ...PER_DAY_ROW, pediatric_doses_per_day:null, pediatric_interval_hours:7 },
  patient(18),
);
assert.ok(oddInterval.warnings.some(w => /nuk është numër i plotë/.test(w)));

// --------------------------------------------------------- caps në të njëjtën njësi

const capped = calculate(PER_DOSE_ROW, patient(80));
assert.equal(capped.perDose.min, 1000);
assert.equal(capped.daily.min, 4000);
assert.ok(capped.cappedBy.includes('maxSingle'));

const dailyCapped = calculate({ ...PER_DOSE_ROW, pediatric_max_daily_value:3000 }, patient(60));
assert.equal(dailyCapped.daily.min, 3000);
assert.equal(dailyCapped.perDose.min, 750);
assert.ok(dailyCapped.cappedBy.includes('maxDaily'));

// --------------------------------------------------------- AUTO: mg <-> g cap

/* 100 kg × 50 mg/kg/day = 5000 mg/day. A 4 g/day cap is 4000 mg/day, therefore
   1333.33 mg per dose when divided into three doses. No clinician conversion. */
const gramCap = calculate({
  ...PER_DAY_ROW,
  pediatric_dose_min:50, pediatric_dose_max:50,
  pediatric_max_daily_value:4, pediatric_max_daily_unit:'g',
}, patient(100));
assert.equal(gramCap.outcome, OUTCOME.CALCULATED);
assert.equal(gramCap.daily.min, 4000);
assert.equal(gramCap.perDose.min, 1333.33);
assert.ok(gramCap.cappedBy.includes('maxDaily'));
assert.equal(
  gramCap.steps.find(step => step.label === 'Maks. në 24h').normalizedValue,
  4000,
  '4 g duhet të normalizohet automatikisht në 4000 mg.',
);

// --------------------------------------------------------- AUTO: cap mg/kg/day

/* 20 kg × 0.2 mg/kg/dose × 3 = 12 mg/day. Cap 0.5 mg/kg/day = 10 mg/day. */
const perKgDailyCap = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_min:0.2, pediatric_dose_max:0.2,
  pediatric_doses_per_day:3,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:0.5, pediatric_max_daily_unit:'mg/kg/ditë',
  pediatric_concentration_value:null, pediatric_concentration_unit:'',
  pediatric_concentration_per_value:null, pediatric_concentration_per_unit:'',
}, patient(20));
assert.equal(perKgDailyCap.daily.min, 10);
assert.equal(perKgDailyCap.perDose.min, 3.33);
assert.ok(perKgDailyCap.cappedBy.includes('maxDaily'));

// --------------------------------------------------------- AUTO: mcg -> mg -> mL

/* Live-data shape: fentanyl 2 mcg/kg/dose and 0.1 mg/2 mL.
   At 10 kg: 20 mcg = 0.020 mg. 0.020 mg / 0.05 mg/mL = 0.4 mL. */
const fentanylLike = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_min:2, pediatric_dose_max:2, pediatric_dose_unit:'mcg',
  pediatric_doses_per_day:null, pediatric_interval_hours:null,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:0.1, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:2, pediatric_concentration_per_unit:'mL',
}, patient(10));
assert.equal(fentanylLike.outcome, OUTCOME.CALCULATED);
assert.equal(fentanylLike.perDose.min, 20);
assert.equal(fentanylLike.measure.min.amount, 0.4,
  '20 mcg duhet të bëhet 0.020 mg para pjesëtimit me mg/mL; jo 400 mL.');
assert.equal(fentanylLike.unitSafety.measureMode, 'converted');
assert.ok(fentanylLike.steps.some(step => step.label === 'Konvertimi i njësisë'));

// --------------------------------------------------------- AUTO: doza tashmë mL

/* 5 kg × 20 mL/kg/dose = 100 mL. Concentration 9 mg/mL exists in the product,
   but the dose is already a volume and must not be divided by 9. */
const directVolume = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_min:20, pediatric_dose_max:20, pediatric_dose_unit:'mL',
  pediatric_doses_per_day:null, pediatric_interval_hours:null,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:9, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1, pediatric_concentration_per_unit:'mL',
}, patient(5));
assert.equal(directVolume.perDose.min, 100);
assert.equal(directVolume.measure.min.amount, 100);
assert.equal(directVolume.measure.min.unit, 'mL');
assert.equal(directVolume.unitSafety.measureMode, 'direct-volume');
assert.ok(directVolume.steps.some(step => /tashmë vëllim/.test(String(step.value))));

// --------------------------------------------------------- dimensione që s'hamendësohen

const incompatibleConcentration = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_min:1, pediatric_dose_max:1, pediatric_dose_unit:'mmol',
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:840, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:10, pediatric_concentration_per_unit:'mL',
}, patient(10));
assert.equal(incompatibleConcentration.outcome, OUTCOME.CALCULATED);
assert.equal(incompatibleConcentration.perDose.min, 10);
assert.equal(incompatibleConcentration.measure, null,
  'mmol nuk guxon të shndërrohet në mg pa ekuivalencë klinike të koduar.');
assert.ok(incompatibleConcentration.warnings.some(w => /nuk është dimensionisht kompatibile/.test(w)));

/* Unknown administration units must remain unknown. Prefix matching such as
   treating "njësi e panjohur" as generic `unit` is unsafe. */
const strangeUnit = calculate(
  { ...PER_DOSE_ROW, pediatric_concentration_per_unit:'njësi e panjohur' },
  patient(20),
);
assert.equal(strangeUnit.measure, null);
assert.equal(strangeUnit.perDose.min, 300);

/* A configured safety cap that cannot be reconciled is different: ignoring it
   could expose an uncapped dose, so the calculation must stop. */
const badCap = calculate({
  ...PER_DOSE_ROW,
  pediatric_max_single_value:1, pediatric_max_single_unit:'mmol',
}, patient(20));
assert.equal(badCap.outcome, OUTCOME.NOT_CALCULABLE);
assert.ok(badCap.reasons.some(r => /nuk është kompatibil/.test(r)));

// --------------------------------------------------------- count aliases

const tabletCap = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'dozë fikse',
  pediatric_dose_min:2, pediatric_dose_max:2, pediatric_dose_unit:'unit',
  pediatric_doses_per_day:1,
  pediatric_max_single_value:1, pediatric_max_single_unit:'tabletë',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
  pediatric_concentration_value:null, pediatric_concentration_unit:'',
  pediatric_concentration_per_value:null, pediatric_concentration_per_unit:'',
}, {});
assert.equal(tabletCap.perDose.min, 1);
assert.ok(tabletCap.cappedBy.includes('maxSingle'));

// --------------------------------------------------------- BSA dhe infuzion

const BSA_ROW = {
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'m²/dozë',
  pediatric_dose_min:100, pediatric_dose_max:100,
  pediatric_max_single_value:null, pediatric_max_daily_value:null,
};
const bsa = calculate(BSA_ROW, patient(30, { heightCm:130 }));
assert.equal(bsa.outcome, OUTCOME.CALCULATED);
assert.equal(bsa.bsa, 1.041);
assert.ok(Math.abs(bsa.perDose.min - 104.08) < 0.05);
assert.equal(calculate(BSA_ROW, patient(30)).outcome, OUTCOME.NEEDS_PATIENT_DATA);

const INFUSION_ROW = {
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'kg/orë',
  pediatric_dose_min:0.1, pediatric_dose_max:0.1,
  pediatric_doses_per_day:null, pediatric_interval_hours:null,
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
};
const infusion = calculate(INFUSION_ROW, patient(20));
assert.equal(infusion.ratePerHour.min, 2);
assert.equal(infusion.daily.min, 48);
assert.equal(infusion.perDose.min, null);

const cappedInfusion = calculate({
  ...INFUSION_ROW,
  pediatric_max_daily_value:24, pediatric_max_daily_unit:'mg',
}, patient(20));
assert.equal(cappedInfusion.daily.min, 24);
assert.equal(cappedInfusion.ratePerHour.min, 1);

// --------------------------------------------------------- kufijtë e pacientit

assert.equal(calculate(PER_DOSE_ROW, patient(0.2)).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(PER_DOSE_ROW, patient(200)).outcome, OUTCOME.OUT_OF_RANGE);

const AGE_LIMITED = {
  ...PER_DOSE_ROW,
  pediatric_min_age_value:3, pediatric_min_age_unit:'muaj',
  pediatric_max_age_value:12, pediatric_max_age_unit:'vjet',
};
assert.equal(calculate(AGE_LIMITED, patient(5, { ageValue:2, ageUnit:'muaj' })).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(AGE_LIMITED, patient(20, { ageValue:5, ageUnit:'vjet' })).outcome, OUTCOME.CALCULATED);
assert.equal(calculate(AGE_LIMITED, patient(50, { ageValue:15, ageUnit:'vjet' })).outcome, OUTCOME.OUT_OF_RANGE);
assert.equal(calculate(AGE_LIMITED, patient(20)).outcome, OUTCOME.NEEDS_PATIENT_DATA);

// --------------------------------------------------------- statuset dhe provenance

const contraindicated = calculate({ ...PER_DOSE_ROW, pediatric_use_status:'KUNDËRINDIKUAR' }, patient(20));
assert.equal(contraindicated.outcome, OUTCOME.NOT_CALCULABLE);
assert.equal(contraindicated.readiness, STATUS.CONTRAINDICATED);

const unverified = calculate({ ...PER_DOSE_ROW, pediatric_verification_status:'in_review' }, patient(20));
assert.equal(unverified.outcome, OUTCOME.NOT_CALCULABLE);
assert.equal(unverified.readiness, STATUS.TEXT_ONLY);

const bands = calculate({ ...PER_DOSE_ROW, pediatric_dose_basis:'bandë peshe' }, patient(20));
assert.equal(bands.outcome, OUTCOME.NOT_CALCULABLE);

// --------------------------------------------------------- concentration / strength contract

const tablets = calculate({
  ...PER_DOSE_ROW,
  pediatric_dose_basis:'dozë fikse',
  pediatric_dose_min:250, pediatric_dose_max:250,
  pediatric_concentration_value:500, pediatric_concentration_unit:'mg',
  pediatric_concentration_per_value:1, pediatric_concentration_per_unit:'tabletë',
  pediatric_max_single_value:null, pediatric_max_single_unit:'',
  pediatric_max_daily_value:null, pediatric_max_daily_unit:'',
}, {});
assert.equal(tablets.measure.min.amount, 0.5);
assert.equal(tablets.measure.min.kind, 'solid');

const strengthOnly = calculate({
  ...PER_DOSE_ROW,
  strength:'120 mg/5 mL',
  pediatric_concentration_value:null, pediatric_concentration_per_value:null,
  pediatric_concentration_unit:'', pediatric_concentration_per_unit:'',
}, patient(20));
assert.equal(strengthOnly.measure, null, 'Fortësia free-text nuk guxon të bëhet përqendrim.');
assert.equal(strengthOnly.perDose.min, 300);

// --------------------------------------------------------- helper unit contract

assert.equal(_test.convertValue(20, 'mcg', 'mg'), 0.02);
assert.equal(_test.convertValue(4, 'g', 'mg'), 4000);
assert.equal(_test.convertValue(1, 'tabletë', 'unit'), 1);
assert.equal(_test.convertValue(1, 'mmol', 'mg'), null);
assert.equal(_test.unitDescriptor('mg sodium alginate').dimension, 'mass');
assert.equal(_test.unitDescriptor('njësi e panjohur'), null);
assert.equal(_test.ageInDays(2, 'vjet'), 730.5);
assert.equal(_test.bodySurfaceArea(30, 130).toFixed(4), '1.0408');
assert.equal(_test.round(0.0625), 0.0625);

// --------------------------------------------------------- server authority

const snapshot = JSON.stringify(PER_DOSE_ROW);
assert.deepEqual(calculate(PER_DOSE_ROW, patient(20)), calculate(PER_DOSE_ROW, patient(20)));
assert.equal(JSON.stringify(PER_DOSE_ROW), snapshot);

const injected = calculate(PER_DOSE_ROW, {
  weightKg:20,
  pediatric_dose_min:9999, pediatric_dose_max:9999,
  doseMin:9999, perDose:9999, pediatric_max_single_value:99999,
});
assert.equal(injected.perDose.min, 300,
  'Hyrjet e pacientit nuk guxojnë ta ndryshojnë dozën e ruajtur në Neon.');

console.log(
  'Pediatric calculation passed: server-only dosing, automatic mcg/mg/g conversion, '
  + 'weight-normalized and absolute caps, direct-volume doses, BSA/infusion safety, '
  + 'and no guessed cross-dimension conversions.',
);
