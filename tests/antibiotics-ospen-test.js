'use strict';
const assert=require('node:assert/strict');
const O=require('../antibiotiket-ospen');
const p1=O.products[0],p15=O.products[1];
const form={route:'oral',measure:'whole',unit:'tabletë',modified:false};
const product={...p1,activeSubstance:'Phenoxymethylpenicillin Potassium',form:'Film coated tablet',population:'Pediatric and adult both'};
const strength={unit:'IU',value:1000000,perML:null};
assert.equal(O.identify(product,form,strength),p1);
for(const [key,value] of [['id','other'],['registryNumber','3135'],['name','PHENOCILLIN®'],['strength','1000000 mg'],['activeSubstance','Benzylpenicillin'],['form','Capsule'],['population','Adult only']])assert.equal(O.identify({...product,[key]:value},form,strength),null,key);
assert.equal(O.identify(product,{...form,modified:true},strength),null);
assert.equal(O.identify(product,form,{...strength,unit:'mg'}),null);
assert.equal(O.identify(product,form,{...strength,value:1500000}),null);
let p=O.plan({months:48,weight:16,times:2});
assert.deepEqual([p.dailyMin,p.dailyMax,p.min,p.max],[800000,1600000,400000,800000]);
assert.deepEqual(O.choices(p,p1),[{units:0.5,iu:500000,dailyIU:1000000}]);
assert.deepEqual(O.choices(p,p15),[{units:0.5,iu:750000,dailyIU:1500000}]);
assert.equal(O.prescription(p,p1,O.choices(p,p1)[0]).quantity,10);
assert.match(O.prescription(p,p1,O.choices(p,p1)[0]).text,/½ tablete PO 2 herë\/ditë × 10 ditë/);
assert.equal(O.choices(O.plan({months:48,weight:16,times:4}),p1).length,0);
assert.equal(O.choices(O.plan({months:48,weight:16,times:3}),p1)[0].dailyIU,1500000);
assert.equal(O.choices(O.plan({months:6,weight:8,times:2}),p1).length,0,'Do not round an infant tablet above the range');
for(const context of [{months:2,weight:5},{months:144,weight:40},{months:132,weight:41},{months:216,weight:39},{months:216,weight:181},{months:216,weight:null},{months:216,weight:70,times:5}])assert.ok(O.plan(context).error,JSON.stringify(context));
const adult=O.plan({months:216,weight:70,times:3});
assert.deepEqual([adult.dailyMin,adult.dailyMax],[3000000,4500000]);
assert.deepEqual(O.choices(adult,p1).map(c=>c.units),[1,1.5]);
assert.deepEqual(O.choices(adult,p15).map(c=>c.units),[1]);
const highWeight=O.plan({months:216,weight:160,times:2});assert.equal(highWeight.dailyMin,4000000);
assert.deepEqual(O.choices(highWeight,p1).map(c=>c.units),[2]);
assert.equal(O.prescription(p,p1,{units:1,iu:1000000}),null,'Out-of-range tablets cannot be copied');
assert.equal(O.prescription(p,{...p1},O.choices(p,p1)[0]),null,'A look-alike product is not verified');
assert.equal(O.prescription({...p,days:5},p1,O.choices(p,p1)[0]).text.includes('× 10 ditë'),true,'Native duration cannot become the NICE five-day course');
for(const months of [3,12,48,143,144,204,216])for(const weight of [4,8,10,12,16,20,25,30,40,41,60,70,120,160,180,181])for(const times of [2,3,4]){
  const plan=O.plan({months,weight,times});
  for(const product of O.products)for(const choice of O.choices(plan,product)){
    assert.ok(choice.dailyIU>=plan.dailyMin&&choice.dailyIU<=plan.dailyMax);
    assert.equal(choice.units*2%1,0);
    assert.equal(choice.iu,product.iu*choice.units);
    assert.ok(O.prescription(plan,product,choice));
  }
}
console.log('PASS: verified Ospen identities, native IU bounds, 16kg halves, source duration, adult limits and no out-of-range rounding.');

// The registered product's activity and mass are informational equivalences,
// never a generic IU-to-mg replacement for a fixed NICE prescription.
assert.equal(p1.freeMg,590);assert.equal(p15.freeMg,885);
const sinus=O.plan({months:216,weight:70,times:4,indication:'sinusitis'});
assert.equal(sinus.days,5,'The complete IU sinusitis protocol sets the course automatically');
assert.deepEqual(O.choices(sinus,p1),[{units:1,iu:1000000,dailyIU:4000000}]);
assert.deepEqual(O.choices(sinus,p15),[],'Never round a fixed 1 MIU dose to an incompatible 1.5 MIU tablet');
const rx=O.prescription(sinus,p1,O.choices(sinus,p1)[0]);
assert.equal(rx.dailyIU,4000000);assert.equal(rx.quantity,20);assert.match(rx.line,/1 tabletë PO 4 herë\/ditë × 5 ditë/);
assert.match(rx.text,/DK · sinusit/);
for(const days of [0,1,2,-1,7,5.5,NaN,Infinity,366]){
 const changed=O.plan({...sinus,days});
 assert.equal(changed.days,5,'Caller input cannot override the automatic course');
 assert.equal(O.prescription(changed,p1,O.choices(changed,p1)[0]).quantity,20);
}
assert.ok(O.plan({...sinus,times:3}).error,'The fixed adult IU protocol requires four doses');
assert.ok(O.plan({...sinus,weight:161}).error,'Do not extend a fixed regimen beyond product weight boundaries');
const childSinus=O.plan({months:48,weight:16,times:3,indication:'sinusitis'});
assert.deepEqual(O.choices(childSinus,p1),[{units:0.5,iu:500000,dailyIU:1500000}]);
assert.equal(O.prescription(childSinus,p1,O.choices(childSinus,p1)[0]).quantity,7.5);
assert.equal(O.choices(O.plan({...childSinus,times:4}),p1).length,0,'Keep tablet increments inside pediatric bounds');
assert.ok(O.plan({...childSinus,times:2}).error,'Sinusitis does not inherit the twice-daily GAS schedule');
assert.ok(O.plan({months:216,weight:70,indication:'pneumonia'}).error,'Never inherit this source into another indication');
