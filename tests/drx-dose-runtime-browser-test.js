'use strict';

const assert=require('node:assert/strict');
const BrowserRuntime=require('../dose-runtime-browser.js');
const NodeRuntime=require('../lib/dose-runtime-engine.js');
const Core=require('../dose-core.js');

const SNAP='a'.repeat(64);
const SEC='b'.repeat(64);
const source={snapshotId:SNAP,section:'4.2',sectionSha256:SEC,evidenceHash:SNAP,documentDate:'2026-08-31',official:true};
const verified={
  source,
  reviewStatus:'verified',
  verifiedBy:'reviewer',
  verifiedAt:'2026-08-31T20:00:00Z',
};

const baseRule={
  ruleKey:'browser-r1',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:100,
  doseMaxValue:100,
  doseUnit:'mg',
  frequencyMode:'single',
};

const renalRule={
  ...baseRule,
  requiredInputs:['age_months','renal_function'],
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    adjustmentId:'a-low',
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:29,
    doseAction:'reduce_dose',
    doseFactor:0.5,
  },{
    ...verified,
    adjustmentId:'a-normal',
    measureType:'CrCl_mL_min',
    minValue:30,
    maxValue:200,
    doseAction:'no_adjustment',
  }],
};

assert.deepEqual(BrowserRuntime.requiredMeasureTypes(renalRule),['CrCl_mL_min']);
assert.equal(BrowserRuntime.validateAdjustment(renalRule.renalAdjustments[0]).valid,true);

const missing=BrowserRuntime.calculate(renalRule,{ageMonths:300});
assert.equal(missing.outcome,Core.OUTCOME.NEEDS_INPUT);
assert.ok(missing.missing.includes('CrCl_mL_min'));

const reduced=BrowserRuntime.calculate(renalRule,{ageMonths:300,crClMlMin:20});
assert.equal(reduced.outcome,Core.OUTCOME.CALCULATED);
assert.equal(reduced.perDose.min,50);
assert.doesNotMatch(JSON.stringify(reduced.adjustedRule.requiredInputs||[]),/renal_function/);

const unchanged=BrowserRuntime.calculate(renalRule,{ageMonths:300,crClMlMin:80});
assert.equal(unchanged.outcome,Core.OUTCOME.CALCULATED);
assert.equal(unchanged.perDose.min,100);

const nodeReduced=NodeRuntime.calculate({
  ...renalRule,
  renalAdjustments:renalRule.renalAdjustments.map(row=>({
    ...row,
    sourceKey:'emc-test',
    sourceSection:'4.2',
    sourceSectionSha256:SEC,
    sourceSnapshotId:SNAP,
    sourceEvidenceHash:SNAP,
    sourceDocumentDate:'2026-08-31',
  })),
},{ageMonths:300,crClMlMin:20});
assert.equal(nodeReduced.outcome,reduced.outcome);
assert.equal(nodeReduced.perDose.min,reduced.perDose.min);

const hepaticOnly={
  ...baseRule,
  hepaticAdjustmentRequired:true,
  hepaticAdjustments:[{
    ...verified,
    adjustmentId:'h1',
    measureType:'hepatic_impairment_textual',
    severityOrClass:['hepatic impairment'],
    doseAction:'specialist_review',
  }],
};
const hepaticMissing=BrowserRuntime.calculate(hepaticOnly,{ageMonths:300});
assert.equal(hepaticMissing.outcome,Core.OUTCOME.NEEDS_INPUT);
assert.ok(hepaticMissing.missing.includes('hepatic_impairment_textual'));

const hepaticNormal=BrowserRuntime.calculate(hepaticOnly,{ageMonths:300,hepaticImpairment:'none'});
assert.equal(hepaticNormal.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(hepaticNormal.reasons.includes('no_exact_adjustment_match'));

const hepaticImpaired=BrowserRuntime.calculate(hepaticOnly,{ageMonths:300,hepaticImpairment:'hepatic impairment'});
assert.equal(hepaticImpaired.outcome,Core.OUTCOME.MANUAL_REVIEW);
assert.ok(hepaticImpaired.reasons.includes('specialist_review'));

const cappedRule={
  ...baseRule,
  doseMinValue:600,
  doseMaxValue:600,
  frequencyMode:'times_per_day',
  timesPerDay:2,
  renalAdjustmentRequired:true,
  renalAdjustments:[{
    ...verified,
    adjustmentId:'cap',
    measureType:'CrCl_mL_min',
    minValue:0,
    maxValue:200,
    doseAction:'max_daily_cap',
    maxDailyDoseMg:1000,
  }],
};
const capped=BrowserRuntime.calculate(cappedRule,{ageMonths:300,crClMlMin:80});
assert.equal(capped.outcome,Core.OUTCOME.CALCULATED);
assert.equal(capped.adjustedRule.maxDailyDoseMg,1000);
assert.equal(capped.perDose.max,500);

assert.equal(BrowserRuntime.validateAdjustment({
  ...cappedRule.renalAdjustments[0],
  maxDailyDoseMg:null,
}).valid,false);

console.log('DRx browser adjustment runtime matches fail-closed calculator semantics.');
