'use strict';

const assert = require('node:assert/strict');
const Core = require('../dose-core.js');
const ServerCore = require('../lib/dose-core.js');

assert.equal(ServerCore, Core);
assert.equal(Core.VERSION, 'drx-dose-core-v1');

const fixed = Core.calculate({
  ruleKey:'fixed',
  calculationMethod:'fixed_dose',
  doseMinValue:400,
  doseMaxValue:400,
  doseUnit:'mg',
  frequencyMode:'interval',
  intervalMinHours:6,
  intervalMaxHours:8,
  maxDailyDoseMg:1200,
  minAgeMonths:144,
  minWeightKg:40,
}, { ageMonths:240, weightKg:70 }, {
  numeratorValue:400,
  numeratorUnit:'mg',
  denominatorValue:1,
  denominatorUnit:'tablet',
});
assert.equal(fixed.outcome, Core.OUTCOME.CALCULATED);
assert.deepEqual(fixed.perDose, { min:400, max:400 });
assert.equal(fixed.practicalMeasure.min, 1);
assert.equal(fixed.practicalMeasure.max, 1);

const needs = Core.calculate({
  ruleKey:'kg',
  calculationMethod:'dose_per_kg_per_dose',
  doseMinValue:10,
  doseMaxValue:10,
  doseUnit:'mg/kg',
  frequencyMode:'times_per_day',
  timesPerDay:3,
}, {});
assert.equal(needs.outcome, Core.OUTCOME.NEEDS_INPUT);
assert.ok(needs.missing.includes('weight_kg'));

const kg = Core.calculate({
  ruleKey:'kg',
  calculationMethod:'dose_per_kg_per_dose',
  doseMinValue:5,
  doseMaxValue:10,
  doseUnit:'mg/kg',
  frequencyMode:'times_per_day',
  timesPerDay:4,
  maxSingleDoseMg:400,
  maxDailyDoseMg:1200,
}, { weightKg:50 });
assert.equal(kg.outcome, Core.OUTCOME.RANGE);
assert.deepEqual(kg.perDose, { min:250, max:400 });
assert.deepEqual(kg.daily, { min:1000, max:1200 });
assert.ok(kg.cappedBy.includes('max_single_dose_mg'));
assert.ok(kg.cappedBy.includes('max_daily_dose_mg'));

const daily = Core.calculate({
  ruleKey:'kgday',
  calculationMethod:'dose_per_kg_per_day',
  doseMinValue:20,
  doseMaxValue:40,
  doseUnit:'mg/kg/day',
  frequencyMode:'manual',
}, { weightKg:30 });
assert.equal(daily.outcome, Core.OUTCOME.DAILY_ONLY);
assert.deepEqual(daily.daily, { min:600, max:1200 });
assert.equal(daily.perDose, null);

const bsa = Core.calculate({
  ruleKey:'m2',
  calculationMethod:'dose_per_m2_per_dose',
  doseMinValue:100,
  doseMaxValue:100,
  doseUnit:'mg/m2',
  frequencyMode:'single',
}, { weightKg:60, heightCm:165 });
assert.equal(bsa.outcome, Core.OUTCOME.CALCULATED);
assert.ok(bsa.bsaM2 > 1.6 && bsa.bsaM2 < 1.7);
assert.ok(bsa.perDose.min > 160 && bsa.perDose.min < 170);

const outOfRange = Core.calculate({
  ruleKey:'age',
  calculationMethod:'age_band_fixed',
  doseMinValue:200,
  doseMaxValue:200,
  doseUnit:'mg',
  minAgeMonths:144,
  frequencyMode:'single',
}, { ageMonths:120 });
assert.equal(outOfRange.outcome, Core.OUTCOME.OUT_OF_RANGE);

for (const flag of [
  'renalAdjustmentRequired',
  'hepaticAdjustmentRequired',
  'cardiacAdjustmentRequired',
  'specialistOnly',
]) {
  const result = Core.calculate({
    ruleKey:flag,
    calculationMethod:'fixed_dose',
    doseMinValue:100,
    doseMaxValue:100,
    doseUnit:'mg',
    frequencyMode:'single',
    [flag]:true,
  }, {
    renalFunction:'known',
    hepaticFunction:'known',
    cardiacStatus:'known',
    manualClinicalReview:true,
  });
  assert.equal(result.outcome, Core.OUTCOME.MANUAL_REVIEW);
}

const invalid = Core.calculate({
  ruleKey:'bad',
  calculationMethod:'unknown',
}, {});
assert.equal(invalid.outcome, Core.OUTCOME.INVALID_RULE);

console.log('DRx shared deterministic dose-core contract passed.');
