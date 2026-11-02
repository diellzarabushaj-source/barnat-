'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createApprovedCalculator}=require('../lib/antibiotic-dose-math');
// Synthetic arithmetic fixtures, not clinical regimens or patient records.
const binding=model=>({productId:'TEST-PRODUCT',conditionId:'TEST-CONDITION',route:'PO',form:'TEST-FORM',strength:'TEST-STRENGTH',sourceId:'TEST-SOURCE',sourceVersion:'fixture-v1',minAgeYears:2,maxAgeYears:80,minWeightKg:5,maxWeightKg:150,model,approval:{status:'approved',reviewer:'SYNTHETIC TEST FIXTURE',reviewedAt:'2026-11-02',sourceVersion:'fixture-v1',productVerified:true,routeVerified:true,formVerified:true,concentrationVerified:true}});
const patient={productId:'TEST-PRODUCT',conditionId:'TEST-CONDITION',route:'PO',ageYears:10,weightKg:20};
test('fixed and per-day/per-dose weight models remain mathematically distinct',()=>{
 const registry={fixed:binding({kind:'fixed',doseMg:125,intervalHours:8}),day:binding({kind:'mg_per_kg_day',coefficient:30,intervalHours:8}),dose:binding({kind:'mg_per_kg_dose',coefficient:30,intervalHours:8})},calc=createApprovedCalculator(registry);
 assert.deepEqual(calc('fixed',patient).result,{perDoseMg:125,dailyMg:375,intervalHours:8,dosesPerDay:3});
 assert.equal(calc('day',patient).result.perDoseMg,200);assert.equal(calc('day',patient).result.dailyMg,600);
 assert.equal(calc('dose',patient).result.perDoseMg,600);assert.equal(calc('dose',patient).result.dailyMg,1800);
});
test('source-provided caps apply once; fixed-dose caps block rather than silently rewrite a regimen',()=>{
 const calc=createApprovedCalculator({capped:binding({kind:'mg_per_kg_day',coefficient:50,intervalHours:8,maxDailyMg:600}),fixed:binding({kind:'fixed',doseMg:250,intervalHours:8,maxDailyMg:600}),perDose:binding({kind:'fixed',doseMg:250,intervalHours:8,maxDoseMg:200})});
 assert.equal(calc('capped',patient).result.dailyMg,600);assert.equal(calc('capped',patient).result.perDoseMg,200);
 assert.equal(calc('fixed',patient).result,null);assert.equal(calc('perDose',patient).result,null);
});
test('missing approval, stale sources, identity/route mismatch and patient flags cannot enable calculations',()=>{
 const b=binding({kind:'fixed',doseMg:125,intervalHours:12});delete b.approval;
 assert.equal(createApprovedCalculator({x:b})('x',{...patient,clinicalApproved:true}).result,null);
 const stale=binding({kind:'fixed',doseMg:125,intervalHours:12});stale.sourceVersion='new';assert.equal(createApprovedCalculator({x:stale})('x',patient).result,null);
 const calc=createApprovedCalculator({x:binding({kind:'fixed',doseMg:125,intervalHours:12})});for(const changed of [{productId:'OTHER'},{conditionId:'OTHER'},{route:'IV'}])assert.equal(calc('x',{...patient,...changed}).result,null);
 assert.equal(calc('unknown',patient).result,null);
});
test('renal/dialysis, age and weight boundaries fail before arithmetic',()=>{
 const b={...binding({kind:'fixed',doseMg:125,intervalHours:12}),requiresRenal:true,minCrclExclusive:50},calc=createApprovedCalculator({x:b});
 for(const changed of [{},{crclMlMin:50,dialysis:false},{crclMlMin:90,dialysis:true},{crclMlMin:90},{crclMlMin:90,dialysis:false,ageYears:1},{crclMlMin:90,dialysis:false,weightKg:151}])assert.equal(calc('x',{...patient,...changed}).result,null);
 assert.equal(calc('x',{...patient,crclMlMin:51,dialysis:false}).status,'calculated');
});
test('unreviewed schema, ambiguous intervals, nonfinite/negative input and source conflict return no result',()=>{
 for(const intervalHours of [0,7,Infinity])assert.equal(createApprovedCalculator({x:binding({kind:'fixed',doseMg:125,intervalHours})})('x',patient).result,null);
 const b=binding({kind:'fixed',doseMg:125,intervalHours:12});const calc=createApprovedCalculator({x:b});for(const weightKg of [0,-1,NaN,Infinity,'20'])assert.equal(calc('x',{...patient,weightKg}).result,null);
 const noBounds={...b};delete noBounds.minAgeYears;assert.equal(createApprovedCalculator({x:noBounds})('x',patient).result,null);
 assert.equal(createApprovedCalculator({x:{...b,sourceConflict:true}})('x',patient).result,null);
});
test('registry is snapshotted; no volume, duration, rounding or renal dose is invented',()=>{
 const registry={x:binding({kind:'fixed',doseMg:125,intervalHours:12})},calc=createApprovedCalculator(registry);registry.x.model.doseMg=999;
 const result=calc('x',patient).result;assert.equal(result.perDoseMg,125);for(const key of ['volumeMl','durationDays','vials','renalDose'])assert(!Object.hasOwn(result,key));
 require('../antibiotiket-protocols');assert.equal(Object.keys(globalThis.DRX_ANTIBIOTIC_PROTOCOLS.approvedBindings).length,0);
});
