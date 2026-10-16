'use strict';
const assert=require('node:assert/strict');
const market=require('../lib/pediatric-market-catalog');
const additions=require('../lib/pediatric-market-additions');
const server=require('../lib/pediatric-common-calculate-handler');
const cough=require('../data/pediatric-cough-reference-v1.json');
const inventory=require('./fixtures/pediatric-cough-akkpm-products-20261016.json');
const products=require('./fixtures/pediatric-market-products-20261016');
const source={...require('../data/pediatric-common-drugs-reference.json'),weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json'),clinicalAudit:require('../data/pediatric-clinical-audit-v1.json')};
const before=JSON.stringify(source),reference=market.withMarket(source,products);
const variants=name=>reference.marketCatalog.drugs.find(d=>d.name===name).forms.flatMap(f=>f.variants);
const variant=(name,test)=>{const v=variants(name).find(test);assert.ok(v,name+' variant exists');return v;};
const active=(name,concentration)=>variant(name,v=>v.schemes.length&&(!concentration||Math.abs(v.concentration.value/v.concentration.perML-concentration)<1e-8));
const dose=(name,v,age,weight=20,extra={})=>server.calculate(reference,{drugName:name,variantId:v.id,optionIndex:v.schemes[0]?.index,weight,age,ageUnit:'year',ageConfirmed:true,safetyConfirmed:true,referenceRevision:server.revisionOf(reference),...extra});
const measure=(name,v,age,expected,weight=20)=>{const r=dose(name,v,age,weight);assert.ok(!r.error,JSON.stringify(r));assert.ok(Math.abs(r.selectedMeasure.min-expected)<1e-8,`${name} at ${age}: ${r.selectedMeasure.min} != ${expected}`);return r;};
assert.equal(cough.drugs.length,32);assert.equal(inventory.length,80);
assert.equal(new Set(cough.drugs.map(d=>d.section)).size,5);
assert.equal(reference.marketCatalog.productCount,977);assert.equal(reference.marketCatalog.drugs.length,101);
assert.equal(new Set(products.map(p=>p.id)).size,products.length);
const unrelated={...inventory.find(p=>p.atc_code==='N02BE51'),id:'11111111-1111-4111-8111-111111111111',active_substance:'Paracetamol; Caffeine; Codeine phosphate',trade_name:'Unrelated shared-ATC combination'};
const widerAtcLoad=market.withMarket(source,[...products,unrelated]);
assert.equal(widerAtcLoad.marketCatalog.productCount,977,'Counter includes only products actually represented by the catalog, not unrelated shared-ATC rows');
assert.ok(widerAtcLoad.marketCatalog.drugs.every(d=>d.forms.every(f=>f.variants.every(v=>v.products.every(p=>p.id!==unrelated.id)))));
for(const row of inventory){
 const matching=cough.drugs.filter(d=>additions.matchesDrug(d,row));assert.equal(matching.length,1,'No missing/duplicated shared ATC product: '+row.trade_name);
 const catalogProducts=variants(matching[0].name).flatMap(v=>v.products);assert.equal(catalogProducts.filter(p=>p.id===row.id).length,1);
}
for(const drug of cough.drugs){
 assert.equal(reference.sections.find(s=>s.drugs.some(d=>d.name===drug.name)).title,drug.section);
 assert.ok(drug.sources.every(s=>/^https:\/\//.test(s.url)));
 for(const v of variants(drug.name).filter(v=>!v.schemes.length)){
  assert.ok(v.review?.reasonSq);assert.ok(v.review.sources.length);assert.ok(dose(drug.name,v,10,30,{optionIndex:0}).error,'Reference-only product never inherits a dose');
 }
}
const nac=active('Acetylcysteine',20);
assert.ok(dose('Acetylcysteine',nac,1.999).error);measure('Acetylcysteine',nac,2,5);measure('Acetylcysteine',nac,7,5);measure('Acetylcysteine',nac,7.001,10);measure('Acetylcysteine',nac,18,10);assert.ok(dose('Acetylcysteine',nac,18.001).error);
const normon=variant('Acetylcysteine',v=>v.products.some(p=>p.name==='ACETILCISTEINA NORMON'));
assert.ok(dose('Acetylcysteine',normon,7).error);measure('Acetylcysteine',normon,7.001,1);
assert.ok(variants('Acetylcysteine').filter(v=>v.concentration.value===1200||v.concentration.perML&&v.concentration.value/v.concentration.perML===40).every(v=>!v.schemes.length));
const amb3=active('Ambroxol',3),amb6=active('Ambroxol',6);
measure('Ambroxol',amb3,2,2.5);measure('Ambroxol',amb3,6,5);measure('Ambroxol',amb3,12,10);
measure('Ambroxol',amb6,2,1.25);measure('Ambroxol',amb6,6,2.5);measure('Ambroxol',amb6,12,2.5);const ambTeen=measure('Ambroxol',amb6,12.001,5);assert.equal(ambTeen.selectedMeasure.max,7.5);
assert.ok(dose('Ambroxol',amb3,1.999).error);assert.ok(dose('Ambroxol',amb6,5,20,{optionIndex:amb3.schemes[0].index}).error);
const ambDual=variant('Ambroxol',v=>v.form.key==='oral-nebulizer');assert.equal(ambDual.form.route,'product-specific');assert.equal(ambDual.schemes.length,0);
const brom=active('Bromhexine',.8);measure('Bromhexine',brom,2,2.5);measure('Bromhexine',brom,6,5);measure('Bromhexine',brom,12,5);assert.ok(dose('Bromhexine',brom,12.001).error);
assert.ok(variants('Bromhexine').filter(v=>v.form.route==='injectable'||v.form.key==='oral-drops').every(v=>!v.schemes.length));
const carbo=active('Carbocisteine',50);assert.ok(dose('Carbocisteine',carbo,5.999).error);measure('Carbocisteine',carbo,6,5);measure('Carbocisteine',carbo,12,5);measure('Carbocisteine',carbo,12.001,15);
assert.ok(variants('Carbocisteine · kripë lizine').every(v=>!v.schemes.length));assert.ok(!variants('Carbocisteine').some(v=>v.products.some(p=>/FLUIFORT/.test(p.name))));
const butam=active('Butamirate citrate',1.5),omni=active('Butamirate citrate',.8);
assert.ok(dose('Butamirate citrate',butam,2.999).error);measure('Butamirate citrate',butam,3,5);measure('Butamirate citrate',butam,6,10);measure('Butamirate citrate',butam,12,10);measure('Butamirate citrate',butam,12.001,15);
measure('Butamirate citrate',omni,3,10);measure('Butamirate citrate',omni,6,15);assert.match(dose('Butamirate citrate',omni,8.999).frequency,/3 herë/);assert.match(dose('Butamirate citrate',omni,9).frequency,/4 herë/);
assert.ok(variants('Butamirate citrate').filter(v=>v.form.modified).every(v=>!v.schemes.length));
const levo=active('Levodropropizine',6);measure('Levodropropizine',levo,2,2,12);assert.ok(dose('Levodropropizine',levo,1.999).error);assert.ok(dose('Levodropropizine',levo,2,9.999).error);
for(let w=10;w<=150;w+=.25){const r=dose('Levodropropizine',levo,10,w);assert.ok(r.perDoseMax<=60);assert.ok(r.perDoseMax*3<=r.dailyCap);assert.ok(Math.abs(r.perDoseMax-Math.min(w,60))<1e-8);}
const ivy='Hedera helix · gjethe urthi';
const herbion=variant(ivy,v=>v.products.some(p=>p.name==='HERBION® IVY Syrup')),prospan=variant(ivy,v=>v.products.some(p=>p.name==='Prospan cough syrup'));
for(const v of [herbion,prospan]){assert.ok(dose(ivy,v,1.999).error);measure(ivy,v,2,2.5);measure(ivy,v,6,5);}
assert.equal(measure(ivy,herbion,12,5).selectedMeasure.max,7.5);assert.match(dose(ivy,herbion,12).frequency,/2 herë/);assert.match(measure(ivy,prospan,12,5).frequency,/3 herë/);
assert.ok(dose(ivy,prospan,12,20,{optionIndex:herbion.schemes[0].index}).error);assert.ok(variants(ivy).filter(v=>!v.products.some(p=>['HERBION® IVY Syrup','Prospan cough syrup'].includes(p.name))).every(v=>!v.schemes.length));
for(const name of ['Codeine phosphate','Codeine + Ephedrine','Dornase alfa · fibrozë cistike','Viburcol N · homeopatik'])assert.ok(variants(name).every(v=>!v.schemes.length));
assert.equal(dose('Levodropropizine',levo,5,20,{ageConfirmed:false}).needsAgeConfirmation,true);assert.equal(dose('Levodropropizine',levo,5,20,{safetyConfirmed:false}).needsSafetyConfirmation,true);assert.ok(dose('Levodropropizine',levo,5,20,{referenceRevision:'stale'}).error);
for(const evidence of cough.productEvidence)for(const key of Object.keys(evidence.fields)){
 const changed=products.map(p=>p.id===evidence.id?{...p,[key]:key==='registry_number'?0:'changed'}:p),after=market.withMarket(source,changed);
 const options=after.clinicalAudit.drugs[evidence.drugName].calculator.options,indices=new Set(options.map((o,i)=>o.marketEvidenceKey===evidence.key?i:-1));
 const choices=after.marketCatalog.drugs.find(d=>d.name===evidence.drugName)?.forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===evidence.id))||[];
 assert.ok(choices.every(v=>v.schemes.every(s=>!indices.has(s.index))),evidence.key+' is revoked when '+key+' changes');
}
for(const row of inventory.filter(p=>/granul|powder/i.test(p.pharmaceutical_form)&&!/m[lL]/.test(p.strength))){const f=market.classifyForm(row.pharmaceutical_form,row);assert.equal(f.measure,'whole');assert.equal(f.route,'oral');}
assert.equal(market.withMarket(reference,products).marketCatalog.revision,reference.marketCatalog.revision);
const legacy=require('../lib/pediatric-common-reference-handler').clientReference(reference);
assert.ok(!legacy.marketCatalog);for(const drug of cough.drugs)assert.ok(legacy.clinicalAudit.drugs[drug.name].calculator.disabled);
assert.equal(JSON.stringify(source),before,'Original 50-drug source and clinical audit are immutable');
console.log('PASS: all 80 published cough products / 32 entries / 5 groups, 11 scoped schemes, age/weight/daily ceilings, exact extract/product identities, route and combination isolation, confirmations and legacy safety');
