'use strict';

const assert = require('assert');
const engine = require('../lib/dosage-rule-engine-v4.js');
const pediatricCalculation = require('../lib/pediatric-calculation.js');

const baseRule = Object.freeze({
  drugId:'drug-1',
  regimenId:'regimen-1',
  sourceKey:'regimen-1',
  verificationStatus:'calculable_verified',
  sourceUrl:'https://example.test/smpc',
  route:'PO',
  minAgeValue:1,
  minAgeUnit:'muaj',
  maxAgeValue:12,
  maxAgeUnit:'vjet',
  minWeightKg:3,
  maxWeightKg:60,
  requires:{ weight:true, age:true, route:true },
});

function main() {
  assert.strictEqual(engine._test.normalizeRoute('per os'), 'oral');
  assert.strictEqual(engine._test.normalizeRoute('IV'), 'iv');
  assert.ok(engine._test.normalizeAgeDays(1, 'vjet') > 365);

  const missing = engine.evaluate({
    rule:baseRule,
    patient:{ ageValue:2, ageUnit:'vjet' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(missing.outcome, engine.OUTCOME.NEEDS_PATIENT_DATA);
  assert.deepStrictEqual(missing.missing, ['weightKg']);

  const wrongRoute = engine.evaluate({
    rule:baseRule,
    patient:{ weightKg:15, ageValue:2, ageUnit:'vjet' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'IV' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(wrongRoute.outcome, engine.OUTCOME.OUT_OF_RANGE);

  const tooYoung = engine.evaluate({
    rule:baseRule,
    patient:{ weightKg:4, ageValue:10, ageUnit:'ditë' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(tooYoung.outcome, engine.OUTCOME.OUT_OF_RANGE);

  const unverified = engine.evaluate({
    rule:{ ...baseRule, verificationStatus:'draft' },
    patient:{ weightKg:15, ageValue:2, ageUnit:'vjet' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(unverified.outcome, engine.OUTCOME.SOURCE_NOT_VERIFIED);

  const renalRule = {
    ...baseRule,
    requires:{ ...baseRule.requires, renal:true },
    renal:{ ranges:[
      { min:30, max:null, action:'standard' },
      { min:null, max:29.99, contraindicated:true, reason:'Mos përdor në këtë interval renal.' },
    ] },
  };
  const renalBlocked = engine.evaluate({
    rule:renalRule,
    patient:{ weightKg:15, ageValue:2, ageUnit:'vjet', crclMlMin:20 },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(renalBlocked.outcome, engine.OUTCOME.CONTRAINDICATED);

  const calculated = engine.evaluate({
    rule:baseRule,
    patient:{ weightKg:15, ageValue:2, ageUnit:'vjet' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({
      outcome:'CALCULATED',
      perDose:{ min:125, max:125, unit:'mg' },
    }),
  });
  assert.strictEqual(calculated.outcome, engine.OUTCOME.CALCULATED);
  assert.strictEqual(calculated.engine, 'drx-dosage-rule-engine-v4');
  assert.strictEqual(calculated.perDose.min, 125);

  const pregnancyMissing = engine.evaluate({
    rule:{ ...baseRule, requires:{ ...baseRule.requires, pregnancy:true } },
    patient:{ weightKg:15, ageValue:2, ageUnit:'vjet' },
    context:{ drugId:'drug-1', regimenId:'regimen-1', route:'PO' },
    calculate:() => ({ outcome:'CALCULATED' }),
  });
  assert.strictEqual(pregnancyMissing.outcome, engine.OUTCOME.NEEDS_PATIENT_DATA);
  assert.ok(pregnancyMissing.missing.includes('pregnancy'));

  const mapped = pediatricCalculation._test.ruleFromRow({
    id:'drug-1',
    pediatric_primary_regimen_id:'regimen-1',
    pediatric_source_url:'https://example.test/smpc',
    pediatric_verification_status:'verified',
    pediatric_route:'PO',
    pediatric_min_age_value:1,
    pediatric_min_age_unit:'muaj',
    pediatric_max_age_value:12,
    pediatric_max_age_unit:'vjet',
    pediatric_min_weight_kg:3,
    pediatric_max_weight_kg:60,
  });
  assert.strictEqual(mapped.drugId, 'drug-1');
  assert.strictEqual(mapped.regimenId, 'regimen-1');
  assert.strictEqual(mapped.route, 'PO');

  console.log('dosage-rule-engine-v4-test: PASS');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
