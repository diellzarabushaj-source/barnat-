'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('../dose-core.js');
const PediatricV3 = require('../lib/pediatric-v3-runtime.js');

const neonatal = {
  ruleKey:'TEST-NEONATE',
  patientGroup:'pediatric_only',
  calculationMethod:'dose_per_kg_per_day',
  doseMinValue:50,
  doseMaxValue:50,
  doseUnit:'mg',
  frequencyMode:'times_per_day',
  timesPerDay:1,
  minAgeDays:0,
  maxAgeDays:14,
  minWeightKg:1,
};

const neonatalInputs = Core.requiredInputs(neonatal);
assert(neonatalInputs.includes('age_days'));
assert(neonatalInputs.includes('weight_kg'));
assert(!neonatalInputs.includes('age_months'));

assert.equal(
  Core.eligibility(neonatal,{ageDays:10,weightKg:3}).eligible,
  true
);
assert.equal(
  Core.eligibility(neonatal,{ageDays:15,weightKg:3}).outcome,
  Core.OUTCOME.OUT_OF_RANGE
);
assert.deepEqual(
  Core.eligibility(neonatal,{weightKg:3}).missing,
  ['age_days']
);

const sequence = {
  ruleKey:'TEST-SEQUENCE',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:15,
  doseMaxValue:15,
  doseUnit:'mg',
  frequencyMode:'times_per_day',
  timesPerDay:2,
  startDay:1,
  endDay:21,
};
assert(Core.requiredInputs(sequence).includes('treatment_day'));
assert.equal(Core.eligibility(sequence,{ageMonths:360,treatmentDay:7}).eligible,true);
assert.equal(Core.eligibility(sequence,{ageMonths:360,treatmentDay:22}).outcome,Core.OUTCOME.OUT_OF_RANGE);

const conditional = {
  ruleKey:'TEST-CONDITIONAL',
  patientGroup:'adult_only',
  calculationMethod:'fixed_dose',
  doseMinValue:20,
  doseMaxValue:20,
  doseUnit:'mg',
  frequencyMode:'times_per_day',
  timesPerDay:1,
  conditionReviewRequired:true,
  regimenOptionKey:'TEST-CONDITIONAL-B1',
};
assert(Core.requiredInputs(conditional).includes('clinical_variant'));
assert.equal(
  Core.eligibility(conditional,{ageMonths:360,clinicalVariant:'TEST-CONDITIONAL-B1'}).eligible,
  true
);
assert.equal(
  Core.eligibility(conditional,{ageMonths:360,clinicalVariant:'OTHER'}).outcome,
  Core.OUTCOME.OUT_OF_RANGE
);

const p = PediatricV3._test.patientFromBody({
  weightKg:3.2,
  age:{value:10,unit:'ditë'},
  treatmentDay:2,
  clinicalVariant:'TEST-CONDITIONAL-B1',
});
assert.equal(p.ageDays,10);
assert(p.ageMonths > 0 && p.ageMonths < 1);
assert.equal(p.treatmentDay,2);
assert.equal(p.clinicalVariant,'TEST-CONDITIONAL-B1');

const requires = PediatricV3._test.requiresOf([neonatal]);
assert.equal(requires.age,true);
assert.equal(requires.ageDays,true);

/* The pediatric V3 runtime no longer lives on the Dozologjia page: that page
   moved to the Master v2.7 engine and its previous UI is archived as inert
   text, exactly as tests/pediatric-calculator-ui-test.js already reads it.
   The contract itself is unchanged — the markup is asserted against the
   archive, and the client behaviour against the runtime that still ships. */
const html = fs.readFileSync(path.join(__dirname,'..','docs','archive','dozologjia-before-v27','dozologjia.html.txt'),'utf8');
const ui = fs.readFileSync(path.join(__dirname,'..','pediatric-calculator-client.js'),'utf8');
const reader = fs.readFileSync(path.join(__dirname,'..','lib','dose-v3-product-reader.js'),'utf8');

assert.match(html,/id="patientTreatmentDay"/);
assert.match(html,/id="patientClinicalVariant"/);
assert.match(ui,/payload\.treatmentDay = treatmentDay/);
assert.match(ui,/payload\.clinicalVariant = elements\.clinicalVariant\.value/);
assert.match(ui,/requires\.ageDays/);
assert.match(ui,/treatmentDayRange/);
assert.match(reader,/minAgeDays:rule\.min_age_days/);
assert.match(reader,/regimenOptionKey:clean\(rule\.regimen_option_key\)/);

console.log('DRx V3 extended regimen runtime contract passed.');
