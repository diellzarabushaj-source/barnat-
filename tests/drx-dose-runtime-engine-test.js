'use strict';

const assert=require('node:assert/strict');
const Runtime=require('../lib/dose-runtime-engine.js');
const Core=require('../dose-core.js');

const SNAP='a'.repeat(64);
const SEC='b'.repeat(64);
const verified={
  sourceKey:'emc-test',
  sourceSection:'4.2',
  sourceSectionSha256:SEC,
  sourceSnapshotId:SNAP,
  sourceEvidenceHash:SNAP,
  reviewStatus:'verified',
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-29T12:00:00Z',
};

const baseRule={
  ruleKey:'r1',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:100,
  doseMaxValue:100,
  doseUnit:'mg',
  frequencyMode:'single',
};

const renalRule={
  ...baseRule,
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:29,
    doseAction:'reduce_dose',
    doseFactor:0.5,
  },{
    ...verified,
    measureType:'CrCl_mL_min',
    minValue:30,
    maxValue:200,
    doseAction:'no_adjustment',
  }],
};

const needs=Runtime.calculate(renalRule,{ageMonths:300});
assert.equal(needs.outcome,Core.OUTCOME.NEEDS_INPUT);
assert.ok(needs.missing.includes('CrCl_mL_min'));

const reduced=Runtime.calculate(renalRule,{ageMonths:300,crClMlMin:20});
assert.equal(reduced.outcome,Core.OUTCOME.CALCULATED);
assert.equal(reduced.perDose.min,50);
assert.equal(reduced.appliedAdjustments.length,1);
assert.equal(reduced.appliedAdjustments[0].domain,'renal');
assert.equal(reduced.appliedAdjustments[0].action,'reduce_dose');

const unchanged=Runtime.calculate(renalRule,{ageMonths:300,crClMlMin:80});
assert.equal(unchanged.outcome,Core.OUTCOME.CALCULATED);
assert.equal(unchanged.perDose.min,100);
assert.equal(unchanged.appliedAdjustments[0].action,'no_adjustment');

const genericRenalInputRule={
  ...renalRule,
  requiredInputs:['age_months','renal_function'],
};
const structuredRenalResolved=Runtime.calculate(genericRenalInputRule,{ageMonths:300,crClMlMin:80});
assert.equal(structuredRenalResolved.outcome,Core.OUTCOME.CALCULATED);
assert.equal(structuredRenalResolved.perDose.min,100);
assert.doesNotMatch(
  JSON.stringify(structuredRenalResolved.adjustedRule.requiredInputs || []),
  /renal_function/
);

const noRange=Runtime.calculate(renalRule,{ageMonths:300,crClMlMin:250});
assert.equal(noRange.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(noRange.reasons.includes('no_exact_adjustment_match'));

const blockedRule={
  ...baseRule,
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:20,
    doseAction:'contraindicated',
  }],
};
const contraindicated=Runtime.calculate(blockedRule,{ageMonths:300,crClMlMin:10});
assert.equal(contraindicated.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(contraindicated.reasons.includes('contraindicated'));

const dual={
  ...baseRule,
  renalAdjustmentRequired:true,
  hepaticAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:29,
    doseAction:'reduce_dose',
    doseFactor:0.5,
  }],
  hepaticAdjustments:[{
    ...verified,
    measureType:'Child_Pugh_class',
    acceptedValues:['B'],
    doseAction:'extend_interval',
    intervalMinHours:12,
  }],
};
const dualResult=Runtime.calculate(dual,{ageMonths:300,crClMlMin:20,childPughClass:'B'});
assert.equal(dualResult.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(dualResult.reasons.includes('multiple_dose_changing_adjustments_require_manual_review'));

const oneChange={
  ...dual,
  hepaticAdjustments:[{
    ...verified,
    measureType:'Child_Pugh_class',
    acceptedValues:['B'],
    doseAction:'no_adjustment',
  }],
};
const oneChangeResult=Runtime.calculate(oneChange,{ageMonths:300,crClMlMin:20,childPughClass:'B'});
assert.equal(oneChangeResult.outcome,Core.OUTCOME.CALCULATED);
assert.equal(oneChangeResult.perDose.min,50);
assert.equal(oneChangeResult.appliedAdjustments.length,2);

const invalidAdjustment={
  ...baseRule,
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    sourceSectionSha256:'',
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:29,
    doseAction:'no_adjustment',
  }],
};
const invalid=Runtime.calculate(invalidAdjustment,{ageMonths:300,crClMlMin:20});
assert.equal(invalid.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(invalid.reasons.includes('invalid_adjustment_rows'));

const cappedRule={
  ...baseRule,
  doseMinValue:600,
  doseMaxValue:600,
  frequencyMode:'times_per_day',
  timesPerDay:2,
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:200,
    doseAction:'max_daily_cap',
    maxDailyDoseMg:1000,
  }],
};
const capped=Runtime.calculate(cappedRule,{ageMonths:300,crClMlMin:80});
assert.equal(capped.outcome,Core.OUTCOME.CALCULATED);
assert.equal(capped.adjustedRule.maxDailyDoseMg,1000);
assert.equal(capped.perDose.max,500);

console.log('DRx adjustment-aware dose runtime engine contract passed.');
