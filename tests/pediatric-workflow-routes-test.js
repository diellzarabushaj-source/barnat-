'use strict';
const assert=require('node:assert/strict');
const {workflowAudit,policy}=require('../lib/pediatric-workflow');
const market=require('../lib/pediatric-market-catalog');
const makeEngine=require('../lib/pediatric-common-dose-engine.generated');
const server=require('../lib/pediatric-common-calculate-handler');
const products=require('./fixtures/pediatric-akkpm-products-20261014.json');
const original={...require('../data/pediatric-common-drugs-reference.json'),clinicalAudit:require('../data/pediatric-clinical-audit-v1.json'),weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json')};
const auditedRoutes=require('../data/pediatric-market-route-audit-v1.json');
assert.equal(new Set(auditedRoutes.productEvidence.map(p=>p.key)).size,auditedRoutes.productEvidence.length,'Product audit keys are unique');
for(const options of Object.values(auditedRoutes.drugs))assert.equal(new Set(options.map(o=>JSON.stringify(o))).size,options.length,'Exact indication entries are not duplicated');
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
const co4=variant('Amoxicillin + Clavulanic',v=>v.form.route==='oral'&&v.concentration.basis==='amoxicillin|ratio:4'&&v.concentration.value===125&&v.concentration.perML===5&&v.schemes.length);
const coLow=co4.schemes.find(s=>s.label.includes('ulët')),coHigh=co4.schemes.find(s=>s.label.includes('lartë'));assert.ok(coLow&&coHigh);
const coDose=(age,index,extra={})=>dose('Amoxicillin + Clavulanic',co4,12,age,{optionIndex:index,...extra});
assert.equal(coDose(1,coLow.index).selectedMeasure.min,3.2);assert.equal(coDose(1,coLow.index).selectedMeasure.max,6.4);
assert.ok(coDose(1.999,coHigh.index).error);assert.equal(coDose(2,coHigh.index).selectedMeasure.max,9.6);assert.ok(coDose(.249,coLow.index).error);
assert.equal(coDose(2,coLow.index,{safetyConfirmed:false}).needsSafetyConfirmation,true);assert.ok(coDose(2,0).error,'4:1 never uses the twice-daily 7:1 option');
assert.ok(dose('Amoxicillin + Clavulanic',co4,40,10,{optionIndex:coLow.index}).error);
const cpmTab=variant('CPM',v=>v.form.key==='tablet'&&v.schemes.length);assert.ok(dose('CPM',cpmTab,40,12).error);assert.equal(dose('CPM',cpmTab,40,13).selectedMeasure.min,1);assert.equal(dose('CPM',cpmTab,40,13).dailyCap,24);assert.ok(dose('CPM',cpmTab,40,13,{optionIndex:0}).error);
const salbOral=variant('Salbutamol',v=>v.form.key==='oral-liquid'&&v.schemes.length);assert.ok(dose('Salbutamol',salbOral,12,1.99).error);assert.equal(dose('Salbutamol',salbOral,12,2).selectedMeasure.min,2.5);assert.equal(dose('Salbutamol',salbOral,20,6).selectedMeasure.min,5);assert.ok(dose('Salbutamol',salbOral,20,6,{optionIndex:0}).error,'Nebulized dose is not oral');
const mdi=variant('Salbutamol',v=>v.form.route==='inhaled'&&v.products.some(p=>p.name==='SALBUTAMOL ALDO-UNION 100')&&v.schemes.length);assert.ok(mdi.products.every(p=>p.name==='SALBUTAMOL ALDO-UNION 100'));assert.ok(dose('Salbutamol',mdi,20,3.999).error);assert.equal(dose('Salbutamol',mdi,20,4).selectedMeasure.min,1);assert.equal(dose('Salbutamol',mdi,20,4).selectedMeasure.actualMin,100);assert.equal(dose('Salbutamol',mdi,20,4).selectedMeasure.actualUnit,'mcg');assert.equal(dose('Salbutamol',mdi,20,4).dailyCap,400,'Exact Aldo-Unión label has a 4-puff pediatric limit, not the 8-puff limit of another brand');
const changedMdi=products.map(p=>p.id===mdi.products[0].id?{...p,strength:'200 mcg/dose'}:p);assert.ok(market.withMarket(original,changedMdi).marketCatalog.drugs.find(d=>d.name==='Salbutamol').forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===mdi.products[0].id)).every(v=>!v.schemes.length));
const gent=variant('Gentamicin',v=>v.products.some(p=>p.id==='ee57fce2-1dbe-4c89-b2f8-e6dddf3832ae'));assert.equal(dose('Gentamicin',gent,20,5).selectedMeasure.min,1);assert.equal(dose('Gentamicin',gent,20,5).selectedMeasure.max,1.25);
const salbuair=variant('Salbutamol',v=>v.products.some(p=>p.id==='f75c5c03-795a-4bb1-a0ff-fc5c101a60a3'));assert.equal(dose('Salbutamol',salbuair,20,5).selectedMeasure.min,2);assert.equal(dose('Salbutamol',salbuair,20,5).selectedMeasure.max,2.5);
const salres=variant('Salbutamol',v=>v.products.some(p=>p.id==='0c0a36c0-9167-43c5-aac1-b6e5451a05bf'));assert.ok(dose('Salbutamol',salres,12,1.999).error);const sr=dose('Salbutamol',salres,12,2);assert.equal(sr.selectedMeasure.min,1);assert.equal(sr.selectedMeasure.max,2);assert.equal(sr.selectedMeasure.actualMax,200);assert.equal(sr.dailyCap,800);
assert.notEqual(sr.dailyCap,dose('Salbutamol',mdi,20,4).dailyCap,'Two 100 mcg inhalers retain their own manufacturer daily limits');
const klacid=variant('Clarithromycin',v=>v.products.some(p=>p.id==='151d0b8c-b23e-456f-a6f5-52582972f42b'));assert.ok(dose('Clarithromycin',klacid,45,12).error);assert.equal(dose('Clarithromycin',klacid,45,13).selectedMeasure.min,1);assert.equal(dose('Clarithromycin',klacid,45,13).dailyCap,500);assert.match(dose('Clarithromycin',klacid,45,13).frequency,/1 herë/);assert.equal(dose('Clarithromycin',klacid,45,13,{optionIndex:klacid.schemes[1].index}).selectedMeasure.max,2);assert.ok(dose('Clarithromycin',klacid,45,13,{optionIndex:0}).error,'Modified-release tablets never borrow immediate-release twice-daily dosing');
const effer=variant('Paracetamol',v=>v.products.some(p=>p.id==='fa21a4b2-38c2-4b3c-96a2-81ce3e95672e'));assert.ok(dose('Paracetamol',effer,7.999,1).error);assert.ok(dose('Paracetamol',effer,12.001,2).error);assert.equal(dose('Paracetamol',effer,8,1).selectedMeasure.min,1);assert.equal(dose('Paracetamol',effer,8,1).dailyCap,450);assert.equal(dose('Paracetamol',effer,10,1).dailyCap,600);assert.equal(dose('Paracetamol',effer,12,2).selectedMeasure.actualMax,150);assert.ok(dose('Paracetamol',effer,8,2.99,{ageUnit:'month'}).error);
const para250=variant('Paracetamol',v=>v.form.route==='rectal'&&v.concentration.value===250&&v.schemes.length);assert.ok(dose('Paracetamol',para250,20,5.999).error);assert.equal(dose('Paracetamol',para250,20,6).selectedMeasure.min,1);assert.equal(dose('Paracetamol',para250,30,10).selectedMeasure.max,1);assert.equal(dose('Paracetamol',para250,100/3,10).selectedMeasure.max,2);assert.equal(dose('Paracetamol',para250,40,12.99).selectedMeasure.max,2);assert.ok(dose('Paracetamol',para250,40,13).error);
for(let w=30;w<=40;w+=.01){const r=dose('Paracetamol',para250,w,10);assert.ok(r.selectedMeasure.actualMax*4<=60*w+1e-8,'Whole suppositories and 4-dose frequency stay within daily ceiling');}
assert.equal(JSON.stringify(original),snapshot);
const coES=variant('Amoxicillin + Clavulanic',v=>v.concentration.value===600&&v.concentration.perML===5&&v.schemes.length);
const esDose=(w,a,extra={})=>dose('Amoxicillin + Clavulanic',coES,w,a,extra);
assert.equal(esDose(12,2).selectedMeasure.min,4.5);assert.equal(esDose(40,12).selectedMeasure.min,15);
assert.match(esDose(12,2).frequency,/10 ditë/);assert.equal(esDose(12,2).doseMax,1080);assert.equal(esDose(40,12).doseMax,3600);
assert.ok(esDose(40.001,12).error);assert.ok(esDose(12,13).error);assert.ok(esDose(12,.249).error);
assert.equal(esDose(12,2,{ageConfirmed:false}).needsAgeConfirmation,true);assert.equal(esDose(12,2,{safetyConfirmed:false}).needsSafetyConfirmation,true);
assert.ok(esDose(12,2,{optionIndex:coLow.index}).error,'ES never borrows 4:1 or 7:1 dosing');
for(const entry of reference.marketCatalog.drugs)for(const v of entry.forms.flatMap(f=>f.variants).filter(v=>!v.schemes.length)){
 assert.ok(v.review?.reviewedAt&&v.review?.sources.length,entry.name+' inactive variant has a source review');
 assert.equal(v.reason,v.review.reasonSq);assert.ok(dose(entry.name,v,20,5,{optionIndex:0}).error,'Source review cannot authorize calculation');
 for(const source of v.review.sources)assert.equal(new URL(source.url).protocol,'https:');
}
const wrongDiclo=variant('Diclofenac',v=>v.concentration.raw==='100 g');assert.equal(wrongDiclo.review.status,'data-inconsistent');assert.match(wrongDiclo.reason,/g në mg/);
for(const evidence of auditedRoutes.productEvidence)for(const field of Object.keys(evidence.fields)){
 const changed=products.map(p=>p.id===evidence.id?{...p,[field]:field==='registry_number'?0:'changed'}:p);
 const changedRef=market.withMarket(original,changed);const options=changedRef.clinicalAudit.drugs[evidence.drugName].calculator.options;
 const revoked=new Set(options.map((o,index)=>o.marketEvidenceKey===evidence.key?index:-1).filter(index=>index>=0));
 const choices=changedRef.marketCatalog.drugs.find(d=>d.name===evidence.drugName).forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===evidence.id));
 assert.ok(choices.every(v=>v.schemes.every(s=>!revoked.has(s.index))),evidence.key+' exact source invalidated by '+field);
}
console.log(`PASS: ${comparisons} original-rule parity points; new route, age, product, component, daily-volume and contraindication gates`);
