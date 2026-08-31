'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const V3=require('../lib/pediatric-v3-runtime.js');
const Core=require('../lib/dose-core.js');

assert.equal(typeof V3.buildProduct,'function');
assert.equal(typeof V3.calculate,'function');
assert.equal(typeof V3.readPayload,'function');

assert.equal(V3._test.ageMonthsFromBody({age:{value:12,unit:'vjet'}}),144);
assert.equal(V3._test.ageMonthsFromBody({age:{value:18,unit:'muaj'}}),18);
assert.ok(Math.abs(V3._test.ageMonthsFromBody({age:{value:14,unit:'ditë'}})-(14/30.4375))<1e-9);

const source={
  url:'https://example.test/smpc',
  section:'4.2',
  snapshotId:'a'.repeat(64),
  sectionSha256:'b'.repeat(64),
  evidenceHash:'a'.repeat(64),
  documentDate:'2026-08-31',
  official:true,
};
const base={
  indicationId:'ind-pain',
  indicationKey:'IND-PAIN',
  indicationName:'Pain',
  patientGroup:'age_band',
  calculationMethod:'age_band_fixed',
  doseMinValue:500,
  doseMaxValue:500,
  doseUnit:'mg',
  doseBasis:'per_dose',
  frequencyMode:'prn',
  intervalMinHours:4,
  maxDoses24h:4,
  route:'PO',
  requiredInputs:['age_months'],
  renalAdjustmentRequired:false,
  hepaticAdjustmentRequired:false,
  cardiacAdjustmentRequired:false,
  source,
};
const child={...base,ruleId:'r-child',ruleKey:'R-CHILD',minAgeMonths:120,maxAgeMonths:191};
const older={...base,ruleId:'r-older',ruleKey:'R-OLDER',minAgeMonths:192,maxAgeMonths:null,doseMaxValue:1000};

const groups=V3._test.rulesByIndication([child,older]);
assert.equal(groups.size,1,'age bands of one indication must not become false separate indications');
assert.equal(groups.get('ind-pain').length,2);

const option=V3._test.optionFromRules('ind-pain',[child,older]);
assert.equal(option.ruleCount,2);
assert.equal(option.requires.age,true);
assert.equal(option.requires.weight,false);

const childPick=V3._test.selectRule([child,older],{ageMonths:144,weightKg:null,heightCm:null});
assert.equal(childPick.status,'matched');
assert.equal(childPick.rule.ruleKey,'R-CHILD');

const olderPick=V3._test.selectRule([child,older],{ageMonths:192,weightKg:null,heightCm:null});
assert.equal(olderPick.status,'matched');
assert.equal(olderPick.rule.ruleKey,'R-OLDER');

assert.equal(V3._test.selectRule([child,older],{ageMonths:100,weightKg:null,heightCm:null}).status,'out-of-range');
assert.equal(V3._test.selectRule([child,older],{ageMonths:null,weightKg:null,heightCm:null}).status,'needs-input');

const coreResult=Core.calculate(child,{ageMonths:144});
const publicResult=V3._test.publicCalculation(coreResult,child,{
  drugId:'11111111-1111-4111-8111-111111111111',
  tradeName:'TEST',
  activeSubstance:'Test',
  numeratorValue:500,numeratorUnit:'mg',denominatorValue:1,denominatorUnit:'tablet',
});
assert.equal(publicResult.outcome,'CALCULATED');
assert.equal(publicResult.perDose.min,500);
assert.equal(publicResult.source.url,'https://example.test/smpc');

const handler=fs.readFileSync('lib/pediatric-dosage-handler-core.js','utf8');
assert.match(handler,/V3Calculator\.buildProduct/);
assert.match(handler,/V3Calculator\.calculate/);
assert.match(handler,/Cutover\.decision/);
assert.match(
  handler,
  /if \(!v3\.error \|\| v3\.status !== 404\) \{[\s\S]*?recordCalculatorRuntime\([\s\S]*?'v3'[\s\S]*?return v3;/,
  'valid V3 results and fail-closed V3 clinical outcomes must return without silent V2 substitution'
);
assert.match(
  handler,
  /const fallback=await calculateLegacyDose\(body\);[\s\S]*?recordCalculatorRuntime\([\s\S]*?'v2-fallback'[\s\S]*?fallbackUsed:true[\s\S]*?return fallback;/,
  'V2 fallback must be explicit, observable, and limited to unavailable/pre-result V3 failures'
);
assert.match(handler,/function calculatorTelemetryOutcome\(/);
assert.match(handler,/Cutover\.recordEvent\(/);

const html=fs.readFileSync('dozologjia.html','utf8');
for(const id of ['patientIndication','patientCrCl','patientEgfr','patientDialysisStatus','patientChildPugh','patientHepaticImpairment']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing from dosage UI');
}

const ui=fs.readFileSync('dozologjia-v2.js','utf8');
assert.match(ui,/product\.runtime === 'v3' \? 'V3 live'/);
assert.match(ui,/if \(!options\.length\) \{[\s\S]*?return;/,
  'legacy products must bypass the V3 indication selector without mutating their regimen');
assert.match(ui,/payload\.crClMlMin/);
assert.match(ui,/payload\.hepaticImpairment/);

console.log('DRx Phase 10 pediatric V3 calculator consumer contract: PASS');
