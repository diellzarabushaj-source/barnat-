'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Base=require('../antibiotiket-penicillin-protocols'),Manual=require('../antibiotiket-guide'),NICE=require('../antibiotiket-nice');
const s={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../antibiotiket-data.js'),'utf8'),s);
const active=NICE.apply(Base,Manual,Base.attach(s.window.DRX_ANTIBIOTIC_GUIDE));
const context=(ageMonths,extra={})=>({ageMonths,weightKg:20,ageConfirmed:true,allergy:'none',...extra});
const resolve=(id,m,extra={})=>active.protocols.resolve(active.guide.indications.find(i=>i.id===id),context(m,extra));
const option=(id,m,drug,extra={})=>resolve(id,m,extra).options.find(o=>o.drug===drug&&!o.atypical);
assert.equal(Object.keys(NICE.coverage).length,13);assert.equal(Object.values(NICE.coverage).filter(Boolean).length,9);
for(const id of Object.keys(NICE.outside))for(const age of [3,60,144,216]){assert.equal(resolve(id,age).options.length,0);assert.ok(resolve(id,age).standardBlock);}
assert.ok(resolve('aom',216).standardBlock);assert.equal(resolve('aom',215).options[0].dose.value,500);
for(const [id,m,drug,value,times,days] of [
 ['aom',60,'Amoxicillin',500,'3 herë/ditë',5],['gas',60,'Penicillin V',125,'4 herë/ditë',10],
 ['pneumonia',60,'Amoxicillin',500,'3 herë/ditë',3],['pneumonia',216,'Amoxicillin',500,'3 herë/ditë',5],
 ['sinusitis',72,'Penicillin V',250,'4 herë/ditë',5],['uti-cystitis',144,'Nitrofurantoin',50,'4 herë/ditë',3],
 ['uti-pyelo',144,'Cephalexin',500,'2 herë/ditë',7],['impetigo',120,'Flucloxacillin',500,'4 herë/ditë',5],
 ['cellulitis',216,'Flucloxacillin',500,'4 herë/ditë',5],['bite',36,'Amoxicillin / clavulanate',125,'3 herë/ditë',3]
]){const o=option(id,m,drug);assert.ok(o,`${id}/${drug}`);assert.equal(o.dose.value,value);assert.equal(o.frequency,times);assert.equal(o.duration.defaultDays,days);}
for(const id of ['aom','pneumonia','uti-cystitis','uti-pyelo'])assert.equal(resolve(id,2).minAgeMonths,3);
assert.equal(resolve('gas',120,{gasPenicillinSource:'ospen'}).options.some(o=>o.nativeOspen||o.source==='cdc-gas'),false);
assert.equal(resolve('sinusitis',216,{sinusPenicillinSource:'ospen'}).options.some(o=>o.nativeOspen||o.source.startsWith('dk-')),false);
assert.equal(option('pneumonia',144,'Clarithromycin').dose.maxValue,500);
assert.equal(option('pneumonia',6,'Clarithromycin',{weightKg:7}).dose.maxDose,undefined);
const mild=resolve('pneumonia',120,{atypical:true});assert.equal(mild.options.length,1);assert.equal(mild.options[0].drug,'Clarithromycin');assert.ok(!mild.options[0].atypical);
const moderate=resolve('pneumonia',216,{atypical:true,pneumoniaSeverity:'moderate'});assert.equal(moderate.options.filter(o=>o.atypical).length,1);assert.ok(moderate.options.some(o=>o.drug==='Amoxicillin'));
assert.equal(resolve('pneumonia',216,{atypical:true,pneumoniaSeverity:'moderate',pregnant:true}).options.find(o=>o.atypical).drug,'Erythromycin');
for(const [id,key,value] of [['pneumonia','severity','other']])assert.ok(active.manual.decide(id,[],{guideAnswers:{[key]:value}}).block);
assert.ok(active.manual.decide('pneumonia',[],{ageMonths:120,guideAnswers:{severity:'moderate'}}).block);
assert.equal(active.manual.configurations.aom.questions.length,0);assert.equal(active.manual.configurations.gas.questions.length,0);
assert.equal(active.protocols.resolveHospital({source:'cm2026'},120),null);
assert.match(active.protocols.gate({source:'nice-fabricated'},context(120)),/NICE/);
let audited=0;
for(const id of Object.keys(NICE.coverage))for(const m of [0,1,2,3,11,12,23,24,59,60,71,72,119,120,143,144,191,192,215,216])for(const allergy of ['none','a0','a1','a2','a3','a4','a5'])for(const pregnant of [false,true]){
 const r=resolve(id,m,{allergy,pregnant,gasPenicillinSource:'ospen',sinusPenicillinSource:'ospen'});
 for(const o of r.options){assert.match(o.source,/^nice-ng(?:91|84|250|79|109|111|153|141|184)$/);assert.equal(o.authority,'NICE');assert.ok(!o.nativeOspen);}
 if(['a4','a5'].includes(allergy))assert.equal(r.options.length,0);
 audited++;
}
console.log(`PASS NICE-only: 13 infections, ${audited} source-isolation contexts, independent dose/course examples, exclusions, pediatric UTI boundary and alternative-versus-addition.`);
