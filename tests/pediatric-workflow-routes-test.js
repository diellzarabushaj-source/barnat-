'use strict';
const assert=require('node:assert/strict');
const {workflowAudit,policy}=require('../lib/pediatric-workflow');
const market=require('../lib/pediatric-market-catalog');
const makeEngine=require('../lib/pediatric-common-dose-engine.generated');
const server=require('../lib/pediatric-common-calculate-handler');
const products=require('./fixtures/pediatric-akkpm-products-20261014.json');
const original={...require('../data/pediatric-common-drugs-reference.json'),clinicalAudit:require('../data/pediatric-clinical-audit-v1.json'),weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json')};
const snapshot=JSON.stringify(original),normalized=workflowAudit(original),engine=makeEngine(original);
assert.equal(workflowAudit(normalized),normalized);
let comparisons=0;
const relevant=result=>Object.fromEntries(['doseMin','doseMax','doseUnit','dosePeriod','perDoseMin','perDoseMax','frequency','dailyCap','capped'].map(key=>[key,result[key]]));
for(const [name,mapping] of Object.entries(policy.drugs)){
 const options=original.clinicalAudit.drugs[name].calculator.options||[];
 for(const [index,group] of mapping.groups.entries()){
  const merged=normalized.clinicalAudit.drugs[name].calculator.options[index];
  assert.ok(group.label.length<=70,name+' has a concise indication');
  for(const sourceIndex of group.sourceIndexes){
   const source=options[sourceIndex];const weights=new Set([0.5,3,10,20,35,40,60,100]);const days=new Set([0,7,8,21,22,59,60,90,180,365,730,1826,2192,4383,5479,6574]);
   for(const rule of source.rules){for(const key of ['minKg','maxKg'])if(Number.isFinite(rule[key]))for(const d of [-.001,0,.001])weights.add(rule[key]+d);for(const [key,mult] of [['minDays',1],['maxDays',1],['minMonths',365.25/12],['maxMonths',365.25/12]])if(Number.isFinite(rule[key]))for(const d of [-.001,0,.001])days.add(rule[key]*mult+d);}
   for(const weight of weights)for(const day of days){if(weight<=0||day<0)continue;const values={weight:String(weight),age:String(day),ageUnit:'day',ageManual:true};const before=engine.calculateOption(source,values);if(before.error)continue;const after=engine.calculateOption(merged,values);assert.ok(!after.error,JSON.stringify({name,sourceIndex,weight,day,after}));assert.deepEqual(relevant(after),relevant(before),name+' grouping preserves every dose/frequency boundary');comparisons++;}
  }
 }
}
assert.equal(JSON.stringify(original),snapshot,'Published source remains immutable');
const changed=JSON.parse(snapshot);changed.clinicalAudit.drugs.Cetirizine.calculator.options[0].rules[0].min=100;
assert.equal(workflowAudit(changed).clinicalAudit.drugs.Cetirizine.calculator.disabled,true,'Source change fails closed');
const reference=market.withMarket(original,products);
assert.equal(market.withMarket(reference,products).marketCatalog.revision,reference.marketCatalog.revision,'Stable repeat normalization');
const variants=name=>reference.marketCatalog.drugs.find(d=>d.name===name).forms.flatMap(f=>f.variants);
const variant=(name,test)=>{const v=variants(name).find(test);assert.ok(v,name+' existing registry variant');return v;};
const dose=(name,v,weight,age,extra={})=>server.calculate(reference,{referenceRevision:server.revisionOf(reference),drugName:name,variantId:v.id,optionIndex:v.schemes[0]?.index,weight,age,ageUnit:'year',ageConfirmed:true,safetyConfirmed:true,...extra});
const panto=variant('Pantoprazole',v=>v.label.includes('NORMON')&&v.concentration.value===20);
assert.equal(dose('Pantoprazole',panto,40,12).selectedMeasure.min,1);
assert.ok(dose('Pantoprazole',panto,40,11.99).error);
assert.equal(dose('Pantoprazole',panto,40,12,{safetyConfirmed:false}).needsSafetyConfirmation,true);
const panto40=variant('Pantoprazole',v=>v.label.includes('Nolpaza')&&v.concentration.value===40);
assert.equal(dose('Pantoprazole',panto40,50,14).selectedMeasure.min,1);
assert.ok(variants('Pantoprazole').filter(v=>v.schemes.length).every(v=>v.form.route==='oral'&&v.products.every(p=>/NORMON|Nolpaza/.test(p.name))),'Brand-specific source cannot authorize other brands or IV');
const domp=variant('Domperidone',v=>v.schemes.length);
assert.ok(dose('Domperidone',domp,34.99,12).error);assert.ok(dose('Domperidone',domp,35,11.99).error);
assert.equal(dose('Domperidone',domp,35,12).perDoseMax,10);assert.equal(dose('Domperidone',domp,35,12).dailyCap,30);
const sulcef=variant('Cefoperazone',v=>v.schemes.length);
assert.equal(sulcef.concentration.value,2000);assert.equal(dose('Cefoperazone',sulcef,10,2).perDoseMax,400);
assert.equal(dose('Cefoperazone',sulcef,3,7,{ageUnit:'day'}).perDoseMax,120);
assert.ok(dose('Cefoperazone',sulcef,3,.2,{ageUnit:'month'}).error,'Exact neonatal days mandatory');
const changedSulcef=products.map(p=>p.id===sulcef.products[0].id?{...p,strength:'1 g + 0.5 g'}:p);
assert.ok(!market.withMarket(original,changedSulcef).marketCatalog.drugs.find(d=>d.name==='Cefoperazone').forms[0].variants[0].schemes.length,'No 1:1 dose applied to 2:1');
const iron=variant('Iron',v=>v.schemes.length);const ir=dose('Iron',iron,10,2);assert.equal(ir.doseMax,30);assert.equal(ir.selectedMeasure.max,.6);assert.equal(ir.selectedMeasure.period,'day');assert.ok(dose('Iron',iron,40.01,15).error);
const changedIron=products.map(p=>p.id===iron.products[0].id?{...p,active_substance:'Ferric hydroxide polymaltose complex'}:p);
assert.ok(market.withMarket(original,changedIron).marketCatalog.drugs.find(d=>d.name==='Iron').forms.flatMap(f=>f.variants).every(v=>!v.schemes.length),'Elemental identity must still match exactly');
const chew=variant('Montelukast',v=>v.form.key==='tablet-chewable'&&v.concentration.value===4);assert.ok(dose('Montelukast',chew,10,1.5).error);assert.equal(dose('Montelukast',chew,12,2).selectedMeasure.min,1);
const gran=variant('Montelukast',v=>v.form.key==='oral-granules');assert.equal(dose('Montelukast',gran,10,1).selectedMeasure.min,1);
for(const name of ['Amoxicillin','Cefuroxime','Acyclovir']){
 const iv=variant(name,v=>v.form.route==='injectable'&&v.schemes.length);
 const r=dose(name,iv,20,5);assert.ok(!r.error,name+' IV dose');assert.equal(r.route,'injectable');assert.ok(r.selectedMeasure.error,'No guessed reconstitution volume');
 assert.ok(dose(name,iv,20,5,{optionIndex:0}).error,'Oral option cannot be used with IV');
}
const cef=variant('Cefuroxime',v=>v.form.route==='injectable'&&v.schemes.length);
assert.ok(dose('Cefuroxime',cef,3,21,{ageUnit:'day'}).error);assert.equal(dose('Cefuroxime',cef,3,22,{ageUnit:'day'}).perDoseMax,60);
const cet=variant('Cetirizine',v=>v.form.key==='oral-liquid'&&v.schemes.length);
const c=dose('Cetirizine',cet,12,4);assert.equal(c.perDoseMax,2.5);assert.ok(c.resultWarnings.every(w=>!w.includes('12–23')));
assert.ok(variants('Diclofenac').filter(v=>v.schemes.length&&v.form.route==='rectal').every(v=>[12.5,25].includes(v.concentration.value)));
const diclo=variant('Diclofenac',v=>v.products.some(p=>p.id==='210dc4c9-c4d2-4de1-9c0b-75eddc2d9587'));
const acute=diclo.schemes.find(s=>s.label.includes('2–5'));assert.ok(acute);assert.match(acute.eligibilitySq,/13/);
const acuteDose=(weight,age=2,extra={})=>dose('Diclofenac',diclo,weight,age,{optionIndex:acute.index,...extra});
assert.match(acuteDose(12).error,/13 deri nën 20 kg/);
assert.ok(acuteDose(13,1.999).error);assert.ok(acuteDose(13,6).error);assert.ok(acuteDose(20,5).error);
assert.equal(acuteDose(13).selectedMeasure.min,1);assert.equal(acuteDose(13).perDoseMax,12.5);assert.equal(acuteDose(13).dailyCap,25);
assert.match(acuteDose(18.749).frequency,/2 herë/);assert.match(acuteDose(18.75).frequency,/3 herë/);assert.equal(acuteDose(18.75).dailyCap,37.5);
for(let weight=13;weight<20;weight+=.01){const r=acuteDose(weight);assert.ok(r.dailyCap<=2*weight+1e-8);assert.equal(r.selectedMeasure.min,1);}
assert.equal(acuteDose(13,2,{ageConfirmed:false}).needsAgeConfirmation,true);assert.equal(acuteDose(13,2,{safetyConfirmed:false}).needsSafetyConfirmation,true);
assert.match(dose('Diclofenac',diclo,12,2,{optionIndex:1}).error,/6–12 vjeç/);
assert.ok(!dose('Diclofenac',diclo,12,2,{optionIndex:0}).error,'JIA is a separate indication, not a postoperative workaround');
const voltfast=variant('Diclofenac',v=>v.products.some(p=>p.id==='23bc3fce-378b-4f56-969b-c1ffd88e2af6'));
assert.equal(voltfast.form.key,'oral-granules');assert.equal(voltfast.form.measure,'whole');assert.equal(voltfast.schemes.length,1);
assert.ok(dose('Diclofenac',voltfast,50,13.999).error);assert.equal(dose('Diclofenac',voltfast,50,14).selectedMeasure.min,1);assert.equal(dose('Diclofenac',voltfast,50,14).dailyCap,100);
assert.match(dose('Diclofenac',voltfast,50,14).note,/migren/);assert.ok(dose('Diclofenac',voltfast,50,14,{optionIndex:0}).error);
assert.ok(variants('Diclofenac').filter(v=>v.form.route==='oral'&&v.schemes.length).every(v=>v.products.every(p=>p.name==='VOLTFAST')),'No syrup, tablet or different sachet brand inherits the adolescent product audit');
for(const field of ['trade_name','strength','active_substance','pharmaceutical_form','packaging','approved_population','registry_number']){
 const changed=products.map(p=>p.id===voltfast.products[0].id?{...p,[field]:field==='registry_number'?0:'changed'}:p);
 assert.ok(market.withMarket(original,changed).marketCatalog.drugs.find(d=>d.name==='Diclofenac').forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===voltfast.products[0].id)).every(v=>!v.schemes.length),'Exact product audit invalidated by '+field);
}
const lin=variant('Linezolid',v=>v.schemes.length);assert.equal(dose('Linezolid',lin,20,5).selectedMeasure.max,100);assert.equal(dose('Linezolid',lin,20,5,{safetyConfirmed:false}).needsSafetyConfirmation,true);assert.match(dose('Linezolid',lin,20,5).administrationNote,/30–120/);
const wrongBag=products.map(p=>p.id===lin.products[0].id?{...p,strength:'2 mg/mL; bag 300 mL = 500 mg'}:p);assert.ok(market.withMarket(original,wrongBag).marketCatalog.drugs.find(d=>d.name==='Linezolid').forms.flatMap(f=>f.variants).every(v=>!v.schemes.length));
assert.equal(JSON.stringify(original),snapshot);
console.log(`PASS: ${comparisons} original-rule parity points; new route, age, product, component, daily-volume and contraindication gates`);
