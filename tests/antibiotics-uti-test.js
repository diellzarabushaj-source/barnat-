'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const P=require('../antibiotiket-penicillin-protocols');const box={window:{}};vm.runInNewContext(fs.readFileSync('antibiotiket-data.js','utf8'),box);
const guide=P.attach(box.window.DRX_ANTIBIOTIC_GUIDE);
const resolve=(id,ageMonths,extra={})=>P.resolve(guide.indications.find(i=>i.id===id),{ageMonths,weightKg:20,ageConfirmed:true,...extra}).options;
for(const [age,mg,times] of [[3,125,'2 herë/ditë'],[12,125,'3 herë/ditë'],[60,250,'3 herë/ditë'],[144,500,'2 herë/ditë']]){
 const o=resolve('uti-pyelo',age).find(o=>o.drug==='Cephalexin');assert.equal(o.dose.value,mg);assert.equal(o.frequency,times);assert.equal(o.source,'nice-ng111');
}
assert.equal(resolve('uti-cystitis',192,{utiSex:'female'}).find(o=>o.drug==='Nitrofurantoin').duration.text,'3 ditë');
assert.equal(resolve('uti-cystitis',192,{utiSex:'male'}).find(o=>o.drug==='Nitrofurantoin').duration.text,'7 ditë');
const nitro=resolve('uti-cystitis',48).find(o=>o.drug==='Nitrofurantoin');assert.equal(nitro.dose.value,0.75);
assert.match(P.gate(nitro,{ageConfirmed:true,weightKg:16,utiEgfr:44}),/eGFR/);assert.equal(P.gate(nitro,{ageConfirmed:true,weightKg:16,utiEgfr:45}),'');
assert.equal(resolve('uti-pyelo',216).some(o=>o.drug==='Nitrofurantoin'),false);
assert.equal(resolve('uti-cystitis',216,{utiSex:'male'}).some(o=>o.drug==='Fosfomycin'),false);
assert.deepEqual(resolve('uti-pyelo',216,{pregnant:true}).map(o=>o.drug),['Cephalexin']);
assert.equal(resolve('uti-cystitis',180).find(o=>o.drug==='Nitrofurantoin').duration.text,'3 ditë');
console.log('PASS UTI NICE: age bands, 16-year threshold, sex/pregnancy duration, nitro micrograms, eGFR and source isolation.');
