'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function runtime(overlay) {
  const context = vm.createContext({ window:{ matchMedia:() => ({matches:false}) }, document:{
    querySelector:() => null, getElementById:() => null,
    readyState:'loading', addEventListener() {},
  } });
  if (overlay) vm.runInContext(read('antibiotiket-shell.js'), context);
  vm.runInContext(read('antibiotiket-data.js'), context);
  // Exercise the actual calculation functions without mounting a DOM.
  const code = read('antibiotiket.js').replace(/  restoreContext\(\);[\s\S]*$/, '  window.engine = {fmt, calculateSimple, calculatedValue, dailyDose, formulaText, calculationSteps, doseLimits, marketCeilings, ctx, eligibility, allergyAllowed, durationText};\n})();');
  vm.runInContext(code, context);
  return { engine:context.window.engine, guide:context.window.DRX_ANTIBIOTIC_GUIDE };
}
const base = runtime(false);
const live = runtime(true);
const option = (r, id) => r.guide.indications.flatMap(i => i.options).find(o => o.id === id);
// Independent review ledger: indication-specific source coefficients and caps,
// including explicit absence of an absolute maximum in the CPS UTI table.
const reviewedSimple = [
  [['amox-aom','amox-pna'],40,50,2000], [['amoxclav-aom'],40,50,2000],
  [['cefpodoxime-aom','cefpodoxime-pna','cefpodoxime-sinusitis'],5,5,200],
  [['cefdinir-aom'],7,7,300], [['clinda-aom','clinda-pna'],10,10,600],
  [['amoxicillin-gas'],50,50,1000], [['cephalexin-gas'],20,20,500],
  [['clinda-gas'],7,7,300], [['clarithro-gas'],7.5,7.5,250],
  [['amox-sinusitis','amoxclav-sinusitis'],45,45,2000], [['levo-sinusitis'],8,10,750],
  [['cephalexin-cystitis'],12.5,12.5,null], [['amoxclav-cystitis','amoxclav-pyelo'],40/3,40/3,null],
  [['cefixime-cystitis','cefixime-pyelo','tmpsmx-cystitis','tmpsmx-pyelo'],4,4,null],
  [['nitro-cystitis'],1.25,1.75,null], [['cephalexin-pyelo'],25,25,null], [['cipro-pyelo'],15,15,null],
  [['cephalexin-impetigo','cephalexin-cellulitis','cephalexin-preseptal'],17,17,500],
  [['clinda-impetigo','clinda-cellulitis','clinda-abscess','clinda-preseptal','clinda-lymph'],10,10,450],
  [['tmpsmx-impetigo','tmpsmx-abscess'],4,6,160], [['cefpodoxime-preseptal'],5,5,400],
  [['amoxclav-cellulitis','amoxclav-preseptal','amoxclav-bite-proph','amoxclav-bite-treat','amoxclav-lymph'],22.5,22.5,875],
  [['cephalexin-lymph'],17,25,1000],
];
const reviewed = new Set();
for(const [ids,min,max,cap] of reviewedSimple)for(const id of ids){
  const dose=option(base,id).dose;reviewed.add(id);
  assert.deepEqual([dose.type==='range'?dose.min:dose.value,dose.type==='range'?dose.max:dose.value,dose.maxDose??null],[min,max,cap],id+' differs from its reviewed source');
}
for(const id of ['penicillin-gas','mupirocin-impetigo','amoxclav-wound-cut-ge40','id-abscess','azithro-gas','azithro-pna-atypical','combo-bite-proph','combo-bite-treat'])reviewed.add(id);
assert.equal(reviewed.size,51,'Every current option must be represented in the review ledger');
assert.deepEqual([...reviewed].sort(),Array.from(base.guide.indications.flatMap(i=>i.options.map(o=>o.id))).sort());
for(const [id,values,caps] of [['azithro-gas',[12,6],[500,250]],['azithro-pna-atypical',[10,5],[500,250]]]){
  const steps=option(base,id).dose.steps;
  assert.deepEqual(Array.from(steps,s=>s.value),values,id);
  assert.deepEqual(Array.from(steps,s=>s.maxDose),caps,id);
}
for(const id of ['combo-bite-proph','combo-bite-treat']){
  const parts=option(base,id).dose.parts;
  assert.deepEqual(Array.from(parts,p=>[p.dose.value,p.dose.maxDose,p.frequency]),[[5,160,'2 herë/ditë'],[10,450,'3 herë/ditë']],id);
}
assert.equal(option(base,'penicillin-gas').dose.value,250);
assert.equal(option(base,'amoxclav-wound-cut-ge40').dose.text,'875/125 mg/dozë');
for (const id of ['amoxclav-cystitis','amoxclav-pyelo']) {
  const o = option(base,id);
  assert.equal(base.engine.calculateSimple(o.dose,18).min,240);
  assert.match(base.engine.dailyDose(o,18).text,/720 mg amoxicillin\/ditë/);
  assert.match(base.engine.formulaText(o),/40 mg\/kg\/ditë ÷ 3/);
}
assert.equal(base.engine.fmt(1.25),'1,25');
assert.match(base.engine.doseLimits(option(base,'amox-aom'))[0],/2000 mg\/dozë.*4000 mg\/24 orë/);
assert.match(base.engine.doseLimits(option(base,'amox-aom'),12)[0],/600 mg\/dozë.*1200 mg\/24 orë/);
assert.match(base.engine.doseLimits(option(base,'amox-aom'),100)[0],/2000 mg\/dozë.*4000 mg\/24 orë/);
assert.match(base.engine.doseLimits(option(base,'amoxclav-aom'))[0],/mg amoxicillin\/dozë/);
assert.equal(base.engine.doseLimits(option(base,'cephalexin-cystitis')).length,0,'An omitted source maximum must never be invented');
assert.match(base.engine.doseLimits(option(base,'azithro-gas'))[0],/Dita 1: 500 mg\/ditë/);
assert.match(base.engine.doseLimits(option(base,'azithro-gas'))[1],/Ditët 2–5: 250 mg\/ditë/);
assert.match(base.engine.doseLimits(option(base,'combo-bite-treat'))[1],/Clindamycin: 450 mg\/dozë.*1350 mg\/24 orë/);
const ceilings=(id,kg)=>JSON.parse(JSON.stringify(base.engine.marketCeilings(option(base,id),kg)));
assert.deepEqual(ceilings('amox-aom',12)[0].rows,[{label:'',mg:600,absoluteMg:2000}]);
assert.deepEqual(ceilings('amox-aom',80)[0].rows,[{label:'',mg:2000,absoluteMg:2000}]);
assert.deepEqual(ceilings('azithro-gas',30)[0].rows.map(r=>[r.mg,r.absoluteMg]),[[360,500],[180,250]]);
assert.deepEqual(ceilings('combo-bite-treat',15).map(r=>[r.drug,r.frequency,r.rows[0].mg,r.rows[0].absoluteMg]),[['Trimethoprim / sulfamethoxazole','2 herë/ditë',75,160],['Clindamycin','3 herë/ditë',150,450]]);
assert.equal(ceilings('cephalexin-cystitis',12)[0].rows[0].absoluteMg,null,'A missing absolute maximum stays unspecified');
assert.equal(ceilings('penicillin-gas',12)[0].fixed,true,'A fixed regimen is not relabeled as a drug maximum');
assert.equal(base.engine.fmt(1.75),'1,75');
assert.match(base.engine.formulaText(option(base,'nitro-cystitis')),/1,25–1,75/);
assert.deepEqual(JSON.parse(JSON.stringify(live.guide)),JSON.parse(JSON.stringify(base.guide)), 'Shell may not replace current regimens with a historical overlay');
const capped=option(live,'amox-aom');
assert.equal(live.engine.calculateSimple(capped.dose,80).max,2000);
assert.match(live.engine.dailyDose(capped,80).text,/4000 mg\/ditë/);
assert.equal(option(live,'nitro-cystitis').duration.text,'5 ditë');
assert.equal(option(live,'combo-bite-treat').dose.parts[1].dose.maxDose,450);
// Transport to the mL and prescription modules must not round away precision.
const fractional=option(base,'amoxclav-pyelo');
const exact=base.engine.calculatedValue(fractional,10,String);
const mg=Number(exact.split(' ')[0]);
assert.ok(Math.abs(mg*3-400)<1e-10);
for (const file of ['antibiotiket-formulations.js','antibiotiket-prescription.js']) {
  assert.match(read(file),/card\.dataset\.exactDoseText \|\|/);
}
// Exercise every live simple/range/threshold/sequence regimen at boundary weights.
let count=0;
for (const i of live.guide.indications) for(const o of i.options) {
  for(const weight of [1,3.3,7.6,18,26.99,27,34.99,35,40,80,200]) {
    const text=live.engine.calculatedValue(o,weight);
    assert.doesNotMatch(text,/NaN|Infinity/);
    const dose=live.engine.calculateSimple(o.dose,weight);
    if(dose) {
      assert.ok(dose.min>0 && dose.max>=dose.min);
      if(o.dose.maxDose) assert.ok(dose.max<=o.dose.maxDose);
    }
    for(const ceiling of live.engine.marketCeilings(o,weight))for(const row of ceiling.rows){
      if(row.mg!==null)assert.ok(Number.isFinite(row.mg)&&row.mg>0,o.id);
      if(row.absoluteMg!==null)assert.ok(row.mg<=row.absoluteMg,o.id+' exceeds its source ceiling');
    }
    count++;
  }
}
// Review the actual eligibility path for every indication, including those
// without a source-specific age field. None is a neonatal treatment pathway.
for(const indication of base.guide.indications){
  Object.assign(base.engine.ctx,{indication:indication.id,weight:'40',age:'newborn',ageConfirmed:true});
  assert.equal(base.engine.eligibility(indication).blocks,true,indication.id+' must exclude newborns');
}
for(const indication of base.guide.indications)for(const o of indication.options){
  if(!(o.allergy||[]).includes('a4')||!/amoxicillin|ampicillin|penicillin/i.test(o.drug))continue;
  Object.assign(base.engine.ctx,{allergy:'a4',cephLowRiskConfirmed:false});
  assert.equal(base.engine.allergyAllowed(o),false,o.id+' cannot assume low-risk cephalosporin allergy');
  base.engine.ctx.cephLowRiskConfirmed=true;
  assert.equal(base.engine.allergyAllowed(o),true,o.id+' retains the explicitly confirmed low-risk path');
}
for(const o of base.guide.indications.find(i=>i.id==='sinusitis').options){
  assert.match(base.engine.durationText(o),/5–7 ditë.*>39°C.*5–10 ditë/);
}
// Exercise the production parser, rather than duplicating its range logic.
const parser=read('antibiotiket-prescription.js').match(/  function durationSpec\(text\) \{[\s\S]*?(?=  function isWeightBased)/)[0];
const parseDuration=new Function('clean',parser+'return durationSpec;')(x=>String(x).trim());
assert.deepEqual(parseDuration('5–7 ditë · Simptoma të rënda: 5–10 ditë').values,[5,6,7,8,9,10]);
assert.deepEqual(parseDuration('5–7 ditë · Sëmundje e rëndë: 10 ditë').values,[5,6,7,10]);
console.log(`Antibiotics runtime precision: PASS (${count} live regimen/weight cases, all-indication neonatal exclusion, risk-qualified allergy, conditional durations and exact transport).`);
