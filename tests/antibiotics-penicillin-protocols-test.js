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
assert.equal(P.aomDecision(context(60)).blocks,true,'No antibiotic plan is assumed');
assert.equal(P.aomDecision(context(60,20,{aomPlan:'none'})).blocks,true);
assert.equal(P.aomDecision(context(60,20,{aomPlan:'backup'})),null);
assert.equal(P.aomDecision(context(60,20,{aomPlan:'immediate'})),null);
assert.match(P.aomDecision(context(60,20,{aomRisk:'urgent',ageConfirmed:false})).text,/STOP/);
assert.equal(P.aomDecision(context(60,20,{aomRisk:'high',aomPlan:'backup'})).blocks,true);
assert.equal(P.aomDecision(context(60,20,{aomPlan:'backup',aomFailure:true})).blocks,true);
assert.match(P.gate(option('aom',60,'amoxclav-aom'),context(60)),/2–3 ditësh/);
const failedAom=resolve('aom',60,20,{aomFailure:true});
assert.deepEqual(failedAom.options.map(o=>o.id),['amoxclav-aom']);
const adolescentClari=option('aom',144,'clarithro-aom-nice');
assert.deepEqual([adolescentClari.dose.value,adolescentClari.dose.maxValue,adolescentClari.frequency],[250,500,'2 herë/ditë']);
assert.equal(option('aom',143,'clarithro-aom-nice').dose.maxValue,undefined);
assert.equal(option('aom',96,'erythro-aom-pregnancy',30,{pregnant:true}).dose.maxValue,500);
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
assert.match(P.gate(infant,context(6,null,{aomFailure:true})),/peshën reale/);
assert.match(P.gate(option('aom',216,'amoxclav-aom',24.9),context(216,24.9,{aomFailure:true})),/25 kg/);
assert.equal(option('aom',60,'amoxclav-aom',40).dose.value,500);
assert.equal(option('aom',60,'amoxclav-aom',40).source,'emc-coamox-500-125');
assert.equal(P.gate(option('aom',216,'amoxclav-aom',40),context(216,40,{aomFailure:true})),'');
for(const indication of guide.indications){
  assert.equal(P.resolve(indication,{ageConfirmed:false,weightKg:80}).options.length,0,'Weight alone cannot select age: '+indication.id);
}
assert.equal(option('bite',216,'amoxclav-bite-proph',70).duration.text,'3 ditë');
assert.equal(option('bite',216,'amoxclav-bite-treat',70).duration.text,'5 ditë');
assert.equal(option('preseptal',216,'amoxclav-preseptal',70).duration.text,'7 ditë');
for(const id of ['cellulitis','impetigo'])assert.equal(option(id,216,`fluclox-${id}`,70).dose.value,500);
assert.equal(option('gas',216,'amoxicillin-gas',70).dose.maxDose,1000);
assert.equal(option('gas',144,'amoxicillin-gas',40).dose.maxDose,1000);
assert.equal(option('gas',144,'amoxicillin-gas',40).requiresRealWeight,true);
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
assert.equal(e.dailyDose(adolescentClari,null).text,'500–1000 mg/ditë');
assert.equal(e.calculatedValue(adolescentClari,null),'250–500 mg/dozë');
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

// NG84 schedules are alternatives, not a continuous therapeutic range.
for(const [m,qds,bid] of [[3,62.5,125],[12,125,250],[72,250,500],[144,500,1000],[216,500,1000]]){
  assert.deepEqual(shape(option('gas',m,'penicillin-gas',20,{gasSchedule:'bid'})),[bid,'2 herë/ditë','5–10 ditë','nice-ng84']);
  assert.equal(qds*4,bid*2);
}
assert.match(P.gate(option('gas',216,'amoxicillin-gas',70),context(216,70)),/Konfirmo GAS/);
assert.equal(P.gate(option('gas',216,'amoxicillin-gas',70),context(216,70,{gasConfirmed:true})),'');
const adultGasBid=option('gas',216,'amoxicillin-gas',70,{gasAmoxSchedule:'bid'});
assert.equal(e.calculateSimple(adultGasBid.dose,70).min,500);
assert.deepEqual([adultGasBid.frequency,adultGasBid.duration.text,adultGasBid.source],['2 herë/ditë','10 ditë','cdc-gas']);
assert.equal(e.calculateSimple(adultGasBid.dose,18).min,450);
assert.equal(e.calculateSimple(option('gas',216,'amoxicillin-gas',18).dose,18).min,900);
assert.match(P.gate(adultGasBid,context(216,null,{gasConfirmed:true})),/peshën reale/);
const amoxChildBid=option('gas',36,'amoxicillin-gas',12,{gasAmoxSchedule:'bid'});
assert.equal(e.calculatedValue(amoxChildBid,12),'300 mg/dozë');
assert.equal(e.dailyDose(amoxChildBid,12).text,'600 mg/ditë');
assert.match(e.calculatedValue(option('gas',144,'amoxicillin-gas',56),56),/^1000 mg\/dozë.*kufiri maksimal/);
for(const m of [144,204,216]){
  const o=option('gas',m,'clarithro-gas-nice',null);
  assert.deepEqual([o.dose.value,o.dose.maxValue,o.frequency,o.duration.text],[250,500,'2 herë/ditë','5 ditë']);
}
for(const [kg,mg] of [[7,52.5],[8,62.5],[12,125],[20,187.5],[30,250],[40,250]]){
  const o=option('gas',84,'clarithro-gas-nice',kg);
  assert.equal(e.calculateSimple(o.dose,kg).min,mg);
}
assert.equal(option('gas',132,'clarithro-gas-nice',41),undefined,'No published under-12 weight band above 40 kg');
const erythBid=option('gas',216,'erythro-gas-pregnancy',70,{pregnant:true,gasSchedule:'bid'});
assert.deepEqual([erythBid.dose.value,erythBid.dose.maxValue,erythBid.frequency],[500,1000,'2 herë/ditë']);
assert.match(P.productReason({...args,drug:'Penicillin V',product:{},concentration:{unit:'IU',value:1000000}}),/ekuivalenca e verifikuar/);
console.log('PASS: NG84 pharyngitis age/schedule boundaries, CDC GAS confirmation and amoxicillin ceilings, macrolide ranges and IU isolation.');
