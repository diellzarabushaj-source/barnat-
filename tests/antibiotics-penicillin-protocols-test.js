'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../antibiotiket-penicillin-protocols');
const M=require('../antibiotiket-market-math');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const sandbox={window:{}};vm.runInNewContext(read('antibiotiket-data.js'),sandbox);
const guide=P.attach(sandbox.window.DRX_ANTIBIOTIC_GUIDE);
const context=(ageMonths,weightKg=20,extra={})=>({ageMonths,weightKg,ageConfirmed:true,pregnant:false,cultureSusceptible:false,...extra});
const resolve=(id,months,kg=20,extra={})=>P.resolve(guide.indications.find(i=>i.id===id),context(months,kg,extra));
const option=(id,months,regimen,kg=20,extra={})=>resolve(id,months,kg,extra).options.find(o=>o.id===regimen);
const shape=o=>[o.dose.value,o.frequency,o.duration.text,o.source];
assert.equal(guide.ageBands.find(b=>b.id==='adult').months,216);
assert.equal(guide.ageBands.find(b=>b.id==='12y').label,'12 vjeç');
for(const id of ['1m','2m','11m','3y','9y','11y','17y'])assert.ok(guide.ageBands.find(b=>b.id===id),id);
// Independent clinical examples from the source tables, rather than a mirror
// of the engine's branching code. These are operational per-administration doses.
for(const [m,mg] of [[3,125],[11,125],[12,250],[59,250],[60,500],[215,500]]){
  assert.deepEqual(shape(option('aom',m,'amox-aom')),[mg,'3 herë/ditë','5–7 ditë','nice-ng91']);
}
assert.deepEqual(shape(option('aom',216,'amox-aom',60)),[500,'3 herë/ditë','5 ditë','nhs-fife-aom']);
assert.equal(option('aom',144,'amox-aom',60).dose.value,500,'A 60kg child stays under the pediatric source');
for(const [m,mg,days] of [[3,125,3],[11,125,3],[12,250,3],[60,500,3],[143,500,3],[144,500,5],[216,500,5]]){
  assert.deepEqual(shape(option('pneumonia',m,'amox-pna')),[mg,'3 herë/ditë',`${days} ditë`,'nice-ng250']);
}
for(const [m,mg] of [[3,62.5],[11,62.5],[12,125],[71,125],[72,250],[143,250],[144,500],[216,500]]){
  assert.equal(option('sinusitis',m,'penicillin-sinusitis').dose.value,mg);
  assert.equal(option('gas',m,'penicillin-gas').dose.value,mg);
}
assert.equal(resolve('sinusitis',216).options.some(o=>o.drug==='Amoxicillin'),false,'No silent continuation of the old high-dose sinusitis protocol');
for(const [m,first,second] of [[12,125,31.25],[71,125,31.25],[72,250,62.5],[143,250,62.5],[144,500,125],[216,500,125]]){
  const o=option('aom',m,'amoxclav-aom',30);
  assert.deepEqual([o.dose.value,o.dose.secondComponent,o.productRule.ratio],[first,second,4]);
}
const infant=option('aom',6,'amoxclav-aom',8);
assert.equal(infant.dose.value*8,50); // 0.25mL/kg of 125/31.25mg per 5mL.
assert.equal(infant.requiresRealWeight,true);
assert.match(P.gate(infant,context(6,null)),/peshën reale/);
assert.match(P.gate(option('aom',216,'amoxclav-aom',24.9),context(216,24.9)),/25 kg/);
assert.equal(option('aom',60,'amoxclav-aom',40).dose.value,500);
assert.equal(option('aom',60,'amoxclav-aom',40).source,'emc-coamox-500-125');
assert.equal(P.gate(option('aom',216,'amoxclav-aom',40),context(216,40)),'');
for(const indication of guide.indications){
  assert.equal(P.resolve(indication,{ageConfirmed:false,weightKg:80}).options.length,0,'Weight alone cannot select age: '+indication.id);
}
assert.equal(option('bite',216,'amoxclav-bite-proph',70).duration.text,'3 ditë');
assert.equal(option('bite',216,'amoxclav-bite-treat',70).duration.text,'5 ditë');
assert.equal(option('preseptal',216,'amoxclav-preseptal',70).duration.text,'7 ditë');
for(const id of ['cellulitis','impetigo'])assert.equal(option(id,216,`fluclox-${id}`,70).dose.value,500);
assert.equal(option('gas',216,'amoxicillin-gas',70).dose.value,1000);
assert.equal(option('gas',144,'amoxicillin-gas',40).dose.value,1000);
const pyelo=option('uti-pyelo',216,'amoxclav-pyelo',70);
assert.match(P.gate(pyelo,context(216,70)),/urinokulturën/);
assert.equal(P.gate(pyelo,context(216,70,{cultureSusceptible:true})), '');
assert.equal(option('uti-pyelo',180,'amoxclav-pyelo',50).requiresCulture,true);
assert.equal(option('uti-pyelo',192,'amoxclav-pyelo',50).source,'nice-ng111');
assert.equal(resolve('uti-cystitis',216,70).options.length,0,'No adult empirical penicillin invented for cystitis');
assert.equal(option('uti-cystitis',180,'amox-cystitis-nice',50,{pregnant:true}).duration.text,'7 ditë');
assert.equal(resolve('uti-pyelo',216,70,{pregnant:true}).options.length,0,'Do not reuse nonpregnant pyelo table in pregnancy');
for(const id of ['aom','gas','pneumonia','sinusitis','cellulitis','impetigo']){
  const pregnancy=resolve(id,216,70,{pregnant:true});
  assert.equal(pregnancy.options.some(o=>/Clarithromycin|Doxycycline/.test(o.drug)),false);
}
for(const m of [3,6,12,24,60,72,120,144,192,204,216])for(const i of guide.indications){
  for(const o of resolve(i.id,m,60).options){
    assert.ok(guide.sources.some(s=>s.id===o.source),`${i.id}/${o.id} has a traceable source`);
    if(P.isPenicillin(o.drug))assert.equal(o.allergy.includes('a3'),false,o.id+' cannot allow SCAR');
    if(o.drug==='Amoxicillin / clavulanate')assert.ok(o.productRule?.ratio>0,o.id+' must bind product ratio');
    if(o.dose.type==='fixed'&&o.route==='PO')assert.ok(o.dose.value>0,o.id);
  }
}
const form={route:'oral',measure:'whole',unit:'tabletë'};
const product={population:'Adult only'};
const args={drug:'Amoxicillin',form,concentration:{unit:'mg',value:1000},product};
assert.match(P.productReason({...args,months:204,confirmed:true}),/≥18/);
assert.match(P.productReason({...args,months:216,confirmed:false}),/≥18/);
assert.equal(P.productReason({...args,months:216,confirmed:true}), '');
const combo={...args,drug:'Amoxicillin / clavulanate',months:216,confirmed:true,rule:{ratio:4}};
assert.match(P.productReason({...combo,concentration:{value:875,basis:'amoxicillin|ratio:7'}}),/raport 4:1/);
assert.match(P.productReason({...combo,concentration:{value:600,basis:'amoxicillin|ratio:14'}}),/raport 4:1/);
assert.equal(P.productReason({...combo,concentration:{value:500,basis:'amoxicillin|ratio:4'}}),'');
assert.match(P.productReason({...combo,rule:null,concentration:{value:500,basis:'amoxicillin|ratio:4'}}),/Mungon raporti/);
const convert=mg=>M.convert({doseText:`${mg} mg/dozë`,drug:'Amoxicillin',form,concentration:{unit:'mg',value:1000}}).rows[0];
assert.equal(convert(1200).units,null);assert.equal(convert(1200).choices.length,0,'1200mg cannot become a 1000mg tablet');
assert.equal(convert(1000).units,1);
const adult500=M.convert({doseText:'500 mg/dozë',drug:'Amoxicillin',form,concentration:{unit:'mg',value:500}});
assert.equal(M.dailyTotals(adult500,'3 herë/ditë')[0].rows[0].mgMax,1500);
assert.equal(adult500.rows[0].units*3*5,15);
// Dose transport must work for fixed schedules even with no weight entered.
const runtime=vm.createContext({window:{matchMedia:()=>({matches:false}),DRX_ANTIBIOTIC_GUIDE:guide,DRX_PENICILLIN_PROTOCOLS:P},document:{getElementById:()=>null}});
vm.runInContext(read('antibiotiket.js').replace(/  restoreContext\(\);[\s\S]*$/, '  window.engine={ctx,currentIndication,calculateSimple,calculatedValue,dailyDose,allergyAllowed};\n})();'),runtime);
const e=runtime.window.engine;
assert.equal(e.dailyDose(option('aom',216,'amox-aom',70),null).text,'1500 mg/ditë');
assert.equal(e.dailyDose(pyelo,null).text,'1500/375 mg (amoxicillin/clavulanate)/ditë');
assert.equal(e.calculatedValue(infant,8),'50/12,5 mg/dozë');
Object.assign(e.ctx,{age:'adult',ageConfirmed:true,weight:'60',indication:'aom'});
assert.equal(e.currentIndication().source,'nhs-fife-aom');
e.ctx.allergy='a4';e.ctx.cephLowRiskConfirmed=false;
assert.equal(e.allergyAllowed(option('cellulitis',216,'fluclox-cellulitis')),false);
const hospital={window:{}};vm.runInNewContext(read('antibiotiket-hospital-data.js'),hospital);
for(const r of hospital.window.DRX_ANTIBIOTIC_HOSPITAL.regimens){
  const adult=P.resolveHospital(r,216);
  if(r.drug==='Ampicillin')assert.deepEqual([adult.dose.type,adult.dose.value,adult.frequency],['fixed',2000,'q4h']);
  else if(r.drug==='Ampicillin/sulbactam')assert.deepEqual([adult.dose.value,adult.dose.secondComponent,adult.frequency],[2000,1000,'q6h']);
  else if(r.drug==='Benzathine penicillin G')assert.equal(adult.dose.units,r.dose.units);
  else assert.equal(adult,null,'Pediatric hospital source may not be extrapolated to adults: '+r.id);
}
const html=read('antibiotiket.html');
assert.ok(html.indexOf('antibiotiket-data.js')<html.indexOf('antibiotiket-penicillin-protocols.js'));
assert.ok(html.indexOf('antibiotiket-penicillin-protocols.js')<html.indexOf('/antibiotiket.js?'));
assert.match(html,/data-penicillin-protocols="required"/);
assert.match(read('sw.js'),/antibiotiket-penicillin-protocols.js/);
console.log('PASS: penicillin source/age boundaries, adult schedules, exact components, culture/pregnancy gates, whole tablets, hospital separation and missing-protocol guard.');
