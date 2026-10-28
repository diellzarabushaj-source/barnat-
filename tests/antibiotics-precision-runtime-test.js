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
  const code = read('antibiotiket.js').replace(/  restoreContext\(\);[\s\S]*$/, '  window.engine = {fmt, calculateSimple, calculatedValue, dailyDose, formulaText, calculationSteps, doseLimits};\n})();');
  vm.runInContext(code, context);
  return { engine:context.window.engine, guide:context.window.DRX_ANTIBIOTIC_GUIDE };
}
const base = runtime(false);
const live = runtime(true);
const option = (r, id) => r.guide.indications.flatMap(i => i.options).find(o => o.id === id);
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
    count++;
  }
}
console.log(`Antibiotics runtime precision: PASS (${count} live regimen/weight cases, canonical source identity, thresholds, caps, exact transport and GAS durations).`);
