'use strict';
const assert=require('node:assert/strict');
const {buildCatalog,scopes}=require('../lib/antibiotic-market-catalog');
const {rows,row,catalog}=require('./antibiotic-market-fixture');
const get=(c,n)=>c.drugs.find(d=>d.name===n);
assert.equal(catalog.productCount,9);
assert.equal(Object.keys(scopes).length,38);
assert.equal(get(catalog,'Amoxicillin').forms.length,4,'Oral, powder injection and solid forms stay separate');
const liquid=get(catalog,'Amoxicillin').forms.find(f=>f.measure==='liquid');
assert.equal(liquid.variants[0].concentration.value/liquid.variants[0].concentration.perML,50);
const tmp=get(catalog,'Trimethoprim / sulfamethoxazole').forms[0].variants[0].concentration;
assert.equal(tmp.basis,'trimethoprim');assert.equal(tmp.value/tmp.perML,8);
const clav=get(catalog,'Amoxicillin / clavulanate').forms[0].variants;
assert.equal(clav.length,3,'Distinct strengths and 7:1 versus 14:1 remain separate choices');
assert.equal(new Set(clav.map(variant=>variant.concentration.basis)).size,2,'The two 7:1 strengths share a component basis; 14:1 does not');
const duplicate=buildCatalog([...rows,row('duplicate','Amoxicillin','J01CA04','250mg/5ml','Oral suspension')]);
assert.equal(get(duplicate,'Amoxicillin').forms.find(f=>f.key==='oral-liquid').variants.length,1);
const bad=buildCatalog([
  row('bad-active','Amoxicillin; Metronidazole','J01CA04','250 mg','Tablet'),
  row('bad-liquid','Amoxicillin','J01CA04','250 mg','Oral suspension'),
  row('bad-code','Amoxicillin','J01FA10','250 mg','Tablet'),
]);
assert.equal(get(bad,'Amoxicillin').productCount,1,'A second active or wrong ATC cannot borrow a monocomponent regimen');
assert.ok(get(bad,'Amoxicillin').forms[0].variants[0].concentration.reason,'Bare mg is not mg/mL');
assert.equal(get(bad,'Azithromycin').productCount,0);
assert.notEqual(catalog.revision,duplicate.revision,'Any published product change invalidates the catalog revision');
const source=require('../data/pediatric-clinical-audit-v1.json');
const policy=require('../lib/pediatric-workflow');
for(const n of ['Azithromycin','Ampicillin','Amoxicillin + Clavulanic'])assert.equal(policy.fingerprint(source.drugs[n].calculator.options),policy.policy.drugs[n].sourceOptionsSha256);
assert.deepEqual(source.drugs.Azithromycin.calculator.options.map(o=>o.rules[0].maxPerDose),[500,250,500,500]);
assert.equal(source.drugs.Ampicillin.calculator.options[1].rules[0].maxPerDose,2000);
for(const o of source.drugs['Amoxicillin + Clavulanic'].calculator.options)for(const r of o.rules||[])if(r.maxKg===40)assert.equal(r.maxKgInclusive,false);
console.log('PASS: AKKPM identity, component ratios, units, route separation, revision and dose audit fingerprints');

const fosfo=buildCatalog([row("f-3g","Fosfomycin trometamol","J01XX01","3 g","Granules for oral solution",{packaging:"1 sachet"})]);
assert.equal(get(fosfo,"Fosfomycin").forms[0].unit,"qese");
assert.equal(get(fosfo,"Fosfomycin").forms[0].variants[0].concentration.value,3000);

const ATC=require('../antibiotiket-classification.js');
assert.equal(ATC.forDrug('Penicillin V')[0].code,'J01CE02');
assert.equal(ATC.forCode('J01DD04').subgroup,'Cefalosporina · gjenerata III');
assert.equal(ATC.forDrug('Piperacillin / tazobactam')[0].code,'J01CR05');
assert.equal(ATC.forDrug('Mupirocin')[0].groupCode,'D06A');
assert.equal(ATC.forCode('QJ01CE02'),null,'Do not merge veterinary and human classes');
assert.equal(ATC.forCode('J01CE'),null,'A subgroup is not a substance code');
assert.deepEqual(ATC.forDrug('Unidentified'),[]);
for(const [name,codes] of Object.entries(ATC.scopes))for(const code of codes)assert.ok(ATC.forCode(code),name);
