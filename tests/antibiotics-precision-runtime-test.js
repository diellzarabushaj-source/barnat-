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
  const code = read('antibiotiket.js').replace(/  restoreContext\(\);[\s\S]*$/, '  window.engine = {fmt, calculateSimple, calculatedValue, dailyDose, formulaText, calculationSteps};\n})();');
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
assert.equal(base.engine.fmt(1.75),'1,75');
assert.match(base.engine.formulaText(option(base,'nitro-cystitis')),/1,25–1,75/);
const pen = option(live,'core4-penicillin-gas');
for (const [weight, expected] of [[26.99,300],[27,600],[27.01,600],[40,600]]) {
  assert.equal(live.engine.calculateSimple(pen.dose,weight).min,expected);
  assert.match(live.engine.dailyDose(pen,weight).text,new RegExp(`${expected*2}–${expected*3} mg/ditë`));
}
for (const id of ['core4-amoxicillin-gas','core4-cephalexin-gas','core4-clarithro-gas']) {
  const o=option(live,id);
  assert.equal(o.duration.text,'10 ditë');
  assert.ok(live.guide.sources.some(s => s.id===o.durationSource && s.url.endsWith('/group-a-streptococcal')));
}
// Caps apply to each administration before computing the daily total.
const capped=option(live,'core4-amox-aom');
assert.equal(live.engine.calculateSimple(capped.dose,40).max,500);
assert.match(live.engine.dailyDose(capped,40).text,/1000 mg\/ditë/);
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
console.log(`Antibiotics runtime precision: PASS (${count} live regimen/weight cases, CORE4 overlay, thresholds, caps, exact transport and GAS durations).`);
