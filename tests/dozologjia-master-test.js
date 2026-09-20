'use strict';
const assert=require('node:assert/strict');
const e=require('../lib/dozologjia-master');
function input(id){const r=e.data.regimens.find(r=>r.Atomic_Regimen_ID===id);const x={regimenId:id,drugId:r.Drug_ID,indicationId:r.Indication_ID,scope:true,age:r.Age_Max_Value||Math.max(r.Age_Min_Value||18,18),ageUnit:r.Age_Max_Unit||r.Age_Min_Unit||'year',weight:r.Weight_Max_Kg?20:70,given24h:0,givenTotal:0,gates:Object.fromEntries(r.gates.map(g=>[g.Gate_ID,'PASS']))};if(r.bindings.length)x.productId=r.bindings[0].Formulation_ID;if(r.steps.length)x.stepId=r.steps[0].Step_ID;return x;}
const calc=(id,extra={})=>e.calculate({...input(id),...extra});
assert.equal(e.data.regimens.length,43);
assert.deepEqual(e.data.regimens.reduce((a,r)=>(a[r.Release_Status]=(a[r.Release_Status]||0)+1,a),{}),{ACTIVE_FULL:18,ACTIVE_GATED:7,ACTIVE_PROTOCOL_GATED:1,ACTIVE_DOSE_ONLY:17});
for(const r of e.data.regimens){const id=r.Atomic_Regimen_ID;assert.notEqual(calc(id).outcome,'BLOCKED',id);assert.equal(calc(id,{scope:false}).outcome,'BLOCKED');assert.equal(calc(id,{dose:5}).outcome,'BLOCKED');for(const g of r.gates.filter(g=>g.Gate_Level==='REQUIRED'&&g.Gate_Type!=='PRODUCT_MATCH')){const x=input(id);delete x.gates[g.Gate_ID];assert.equal(e.calculate(x).outcome,'BLOCKED',g.Gate_ID);}}
assert.equal(calc('R2-0001').conversion.min,10);
assert.equal(calc('R2-0002').conversion.min,.5);
assert.equal(calc('R2-0003').conversion.min,5);
assert.equal(calc('R2-0003',{givenTotal:3000}).outcome,'BLOCKED');
assert.equal(calc('R2-0006').conversion,null);
assert.equal(calc('R2-0006',{stepId:'S0004'}).dose.min,150);
assert.equal(calc('R2-0060',{stepId:'S0010'}).dose.min,250);
assert.equal(calc('R2-0040',{stepId:'S0008'}).dose,null);
assert.equal(calc('R2-0063').conversion.min,100);
assert.equal(calc('R2-0022',{age:3,ageUnit:'month',weight:10}).outcome,'BLOCKED');
assert.equal(calc('R2-0022',{age:6,ageUnit:'month',weight:10}).dose.min,150);
assert.equal(calc('R2-0022',{age:6,ageUnit:'month',weight:10,given24h:500}).outcome,'BLOCKED');
assert.equal(calc('R2-0022',{given24h:undefined}).outcome,'BLOCKED');
assert.equal(calc('R2-0066',{weight:40}).outcome,'BLOCKED');
assert.equal(calc('R2-0066',{weight:20}).dose.max,125);
assert.equal(calc('R2-0017').dose.period,'day');
assert.equal(calc('R2-0081').conversion,null);
assert.equal(calc('R2-0054').dose.unit,'tabletë');
assert.equal(calc('R2-0054',{productId:undefined}).outcome,'BLOCKED');
assert.equal(calc('R2-0001',{productId:'F2-0001'}).outcome,'BLOCKED');
assert.equal(calc('R2-0044').conversion.max,50);
// SmPC 6594: adult metoclopramide must respect BOTH 30 mg/day and 0.5 mg/kg/day.
for (const id of ['R2-0027','R2-0028']) {
  assert.equal(calc(id,{weight:40,given24h:10}).dose.max,10);
  assert.equal(calc(id,{weight:40,given24h:15}).outcome,'BLOCKED');
  assert.equal(calc(id,{weight:80,given24h:25}).outcome,'BLOCKED');
  assert.equal(calc(id,{weight:undefined}).outcome,'BLOCKED');
}
// SmPC 101465: pediatric postoperative indication, 0.1 mg/kg capped at 4 mg.
assert.equal(calc('R2-0038',{age:8,ageUnit:'year',weight:25}).dose.max,2.5);
assert.equal(calc('R2-0038',{age:16,ageUnit:'year',weight:60}).dose.max,4);
assert.equal(calc('R2-0038',{age:0.5,ageUnit:'month',weight:3}).outcome,'BLOCKED');
console.log('PASS: 43 active regimens, required gates, units, caps, exact bindings and sequence steps');
