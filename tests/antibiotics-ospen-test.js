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
