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
assert.equal(cough.drugs.reduce((n,d)=>n+d.options.length,0),38);
const coughNames=new Set(cough.drugs.map(d=>d.name)),coughVariants=reference.marketCatalog.drugs.filter(d=>coughNames.has(d.name)).flatMap(d=>d.forms.flatMap(f=>f.variants));
assert.equal(new Set(coughVariants.filter(v=>v.schemes.length).flatMap(v=>v.products.map(p=>p.id))).size,54);
const referenceIds=new Set(coughVariants.filter(v=>!v.schemes.length).flatMap(v=>v.products.map(p=>p.id)));
assert.equal(referenceIds.size,26);assert.equal(cough.productReviews.length,26);assert.ok(cough.productReviews.every(r=>referenceIds.has(r.id)));
assert.equal(new Set(products.map(p=>p.id)).size,products.length);
const unrelated={...inventory.find(p=>p.atc_code==='N02BE51'),id:'11111111-1111-4111-8111-111111111111',active_substance:'Paracetamol; Caffeine; Codeine phosphate',trade_name:'Unrelated shared-ATC combination'};
const widerAtcLoad=market.withMarket(source,[...products,unrelated]);
assert.equal(widerAtcLoad.marketCatalog.productCount,977,'Counter includes only products actually represented by the catalog, not unrelated shared-ATC rows');
assert.ok(widerAtcLoad.marketCatalog.drugs.every(d=>d.forms.every(f=>f.variants.every(v=>v.products.every(p=>p.id!==unrelated.id)))));
for(const row of inventory){
 const matching=cough.drugs.filter(d=>additions.matchesDrug(d,row));assert.equal(matching.length,1,'No missing/duplicated shared ATC product: '+row.trade_name);
 const catalogProducts=variants(matching[0].name).flatMap(v=>v.products);assert.equal(catalogProducts.filter(p=>p.id===row.id).length,row.trade_name==='Ambroxol Aldo-Unión'?2:1);
}
for(const drug of cough.drugs){
 assert.equal(reference.clinicalAudit.drugs[drug.name].auditedAt,drug.auditedAt||cough.auditedAt,'Each added reference reports its own source-review date');
 assert.equal(reference.sections.find(s=>s.drugs.some(d=>d.name===drug.name)).title,drug.section);
 assert.ok(drug.sources.every(s=>/^https:\/\//.test(s.url)));
 for(const v of variants(drug.name).filter(v=>!v.schemes.length)){
  assert.ok(v.review?.reasonSq);assert.ok(v.review.sources.length);assert.ok(dose(drug.name,v,10,30,{optionIndex:0}).error,'Reference-only product never inherits a dose');
 }
}
assert.equal(reference.clinicalAudit.drugs.Loratadine.auditedAt,'2026-10-15','Earlier additions keep their original audit date');
const nac=active('Acetylcysteine',20);
assert.ok(dose('Acetylcysteine',nac,1.999).error);measure('Acetylcysteine',nac,2,5);measure('Acetylcysteine',nac,7,5);measure('Acetylcysteine',nac,7.001,10);measure('Acetylcysteine',nac,18,10);assert.ok(dose('Acetylcysteine',nac,18.001).error);
const normon=variant('Acetylcysteine',v=>v.products.some(p=>p.name==='ACETILCISTEINA NORMON'));
assert.ok(dose('Acetylcysteine',normon,7).error);measure('Acetylcysteine',normon,7.001,1);
assert.ok(variants('Acetylcysteine').filter(v=>v.concentration.perML&&v.concentration.value/v.concentration.perML===40).every(v=>!v.schemes.length));
for(const brand of ['ACC® 600','Mukozero'])for(const v of variants('Acetylcysteine').filter(v=>v.products.some(p=>p.name===brand))){assert.ok(dose('Acetylcysteine',v,14).error);measure('Acetylcysteine',v,14.001,1);assert.equal(dose('Acetylcysteine',v,16).dailyCap,brand==='Mukozero'?1200:600);}
const amb3=active('Ambroxol',3),amb6=active('Ambroxol',6);
measure('Ambroxol',amb3,2,2.5);measure('Ambroxol',amb3,6,5);measure('Ambroxol',amb3,12,10);
measure('Ambroxol',amb6,2,1.25);measure('Ambroxol',amb6,6,2.5);measure('Ambroxol',amb6,12,2.5);const ambTeen=measure('Ambroxol',amb6,12.001,5);assert.equal(ambTeen.selectedMeasure.max,7.5);
assert.ok(dose('Ambroxol',amb3,1.999).error);assert.ok(dose('Ambroxol',amb6,5,20,{optionIndex:amb3.schemes[0].index}).error);
const ambOral=variant('Ambroxol',v=>v.form.key==='aldo-oral'),ambNeb=variant('Ambroxol',v=>v.form.key==='aldo-nebulized');
assert.equal(ambOral.form.route,'oral');assert.equal(ambNeb.form.route,'nebulized');measure('Ambroxol',ambOral,2,1);measure('Ambroxol',ambOral,5,1);assert.equal(measure('Ambroxol',ambOral,5.001,1).selectedMeasure.max,2);
assert.equal(measure('Ambroxol',ambNeb,2,1).selectedMeasure.max,2);measure('Ambroxol',ambNeb,5.001,2);assert.ok(dose('Ambroxol',ambNeb,1.999).error);assert.ok(dose('Ambroxol',ambNeb,5,20,{optionIndex:ambOral.schemes[0].index}).error);assert.ok(dose('Ambroxol',ambOral,5,20,{optionIndex:ambNeb.schemes[0].index}).error);
const brom=active('Bromhexine',.8);measure('Bromhexine',brom,2,2.5);measure('Bromhexine',brom,6,5);measure('Bromhexine',brom,12,5);assert.ok(dose('Bromhexine',brom,12.001).error);
assert.ok(variants('Bromhexine').filter(v=>v.form.route==='injectable').every(v=>!v.schemes.length));
const liso=variant('Bromhexine',v=>v.products.some(p=>p.name==='Lisomucin'));measure('Bromhexine',liso,2,1);measure('Bromhexine',liso,5,1);assert.ok(dose('Bromhexine',liso,1.999).error);assert.ok(dose('Bromhexine',liso,5.001).error);
const bisolvon=variant('Bromhexine',v=>v.products.some(p=>p.name==='BISOLVON')&&v.concentration.value===2);assert.ok(dose('Bromhexine',bisolvon,5.999).error);assert.equal(measure('Bromhexine',bisolvon,6,2).selectedMeasure.max,4);measure('Bromhexine',bisolvon,12.001,8);
const carbo=active('Carbocisteine',50);assert.ok(dose('Carbocisteine',carbo,5.999).error);measure('Carbocisteine',carbo,6,5);measure('Carbocisteine',carbo,12,5);measure('Carbocisteine',carbo,12.001,15);
assert.ok(!variants('Carbocisteine').some(v=>v.products.some(p=>/FLUIFORT/.test(p.name))));
const lysine='Carbocisteine · kripë lizine',fluifort=active(lysine,90),fluigran=variant(lysine,v=>v.form.key==='oral-granules');assert.equal(fluifort.label,'90 mg/1 ml · FLUIFORT','Keep concentration rather than total bottle mass');
assert.equal(fluigran.products.length,2,'Identical sachet regimens share one choice across pack sizes');assert.ok(dose(lysine,fluifort,1.999).error);measure(lysine,fluifort,2,2.5);measure(lysine,fluifort,5,2.5);measure(lysine,fluifort,5.001,5);assert.equal(dose(lysine,fluifort,5).perDoseMax,225);assert.equal(dose(lysine,fluifort,6).perDoseMax,450);assert.ok(dose(lysine,fluifort,18).error);assert.ok(dose(lysine,fluigran,10.999).error);measure(lysine,fluigran,11,1);assert.ok(dose(lysine,fluifort,12,20,{optionIndex:fluigran.schemes[0].index}).error);
const bronles=active('Carbocisteine',25);assert.ok(dose('Carbocisteine',bronles,1.999).error);assert.equal(measure('Carbocisteine',bronles,2,2.5).selectedMeasure.max,5);measure('Carbocisteine',bronles,5,2.5);measure('Carbocisteine',bronles,5.001,10);measure('Carbocisteine',bronles,12,10);assert.ok(dose('Carbocisteine',bronles,12.001).error);
const priv=active('Cloperastine fendizoate',7.08);assert.ok(dose('Cloperastine fendizoate',priv,1.999).error);measure('Cloperastine fendizoate',priv,2,2);measure('Cloperastine fendizoate',priv,4,3);measure('Cloperastine fendizoate',priv,7,5);measure('Cloperastine fendizoate',priv,15,5);assert.ok(dose('Cloperastine fendizoate',priv,15.001).error);assert.equal(dose('Cloperastine fendizoate',priv,4).perDoseMax,21.24);
const oxol=active('Oxolamine citrate',10);assert.ok(dose('Oxolamine citrate',oxol,.999).error);measure('Oxolamine citrate',oxol,1,5);measure('Oxolamine citrate',oxol,4,10);assert.equal(dose('Oxolamine citrate',oxol,4).dailyCap,400);
const dextro=active('Dextromethorphan hydrobromide',1.8);assert.ok(dose('Dextromethorphan hydrobromide',dextro,12).error);measure('Dextromethorphan hydrobromide',dextro,12.001,15);assert.equal(dose('Dextromethorphan hydrobromide',dextro,16).dailyCap,108);
const ice='Cetraria islandica · liken islandez',icev=active(ice,6);assert.ok(dose(ice,icev,1.999).error);for(const [a,ml]of [[2,2.5],[4,5],[10,10],[16,10],[16.001,15]])measure(ice,icev,a,ml);
const cowslip=active('Primula + Thymus',616);assert.ok(dose('Primula + Thymus',cowslip,12).error);measure('Primula + Thymus',cowslip,12.001,5);
const plant='Plantago + Malva + Vitamin C',plantv=active(plant,500);assert.ok(dose(plant,plantv,3.999).error);measure(plant,plantv,4,5);assert.equal(measure(plant,plantv,7,5).selectedMeasure.max,10);measure(plant,plantv,14.001,10);
for(const [name,minAge,minKg]of [['Paracetamol + Guaifenesin + Phenylephrine',16,50],['Paracetamol + Pheniramine + Vitamin C',15,50]]){const v=active(name);assert.equal(v.concentration.unit,'unit');assert.ok(dose(name,v,minAge-.001,minKg).error);assert.ok(dose(name,v,minAge,minKg-.001).error);measure(name,v,minAge,1,minKg);assert.equal(dose(name,v,minAge,minKg).dailyCap,3);}
const tylol='Paracetamol + Chlorpheniramine + Pseudoephedrine',tyv=variant(tylol,v=>v.products.some(p=>p.name==='Tylol Hot Pediatric'));assert.ok(dose(tylol,tyv,5.999).error);measure(tylol,tyv,6,1);measure(tylol,tyv,12,1);assert.ok(dose(tylol,tyv,12.001).error);assert.equal(dose(tylol,tyv,9).dailyCap,4);
const parol=variant(tylol,v=>v.products.some(p=>p.name.startsWith('PAROL Hot'))),aferin=variant(tylol,v=>v.products.some(p=>p.name==='A-Ferin Plus'));
assert.ok(dose(tylol,parol,12).error);measure(tylol,parol,12.001,1);assert.equal(dose(tylol,parol,16).dailyCap,4);
assert.ok(dose(tylol,aferin,12).error);measure(tylol,aferin,12.001,20);assert.equal(dose(tylol,aferin,16).dailyCap,80);assert.equal(dose(tylol,aferin,16).doseUnit,'mL');
for(const [a,b] of [[parol,aferin],[tyv,parol],[aferin,tyv]])assert.ok(dose(tylol,a,16,40,{optionIndex:b.schemes[0].index}).error,'Do not borrow another combination/form/dose');
const bal='Theophylline + Guaifenesin',balv=variant(bal,()=>true);assert.equal(balv.schemes.length,2);assert.equal(balv.concentration.basis,'theophylline');
for(const s of balv.schemes){const n=s.label.includes('2 marrje')?2:3;
 for(const kg of [10,20,39.999]){const r=dose(bal,balv,8,kg,{optionIndex:s.index});assert.ok(!r.error,JSON.stringify(r));assert.ok(Math.abs(r.perDoseMin*n-11*kg)<1e-8);assert.ok(Math.abs(r.perDoseMax*n-16.5*kg)<1e-8);assert.ok(Math.abs(r.selectedMeasure.max-r.perDoseMax/10)<1e-8);assert.equal(r.dailyCap,16.5*kg);}
 const upper=dose(bal,balv,12,40.001,{optionIndex:s.index});assert.equal(upper.selectedMeasure.min,5);assert.equal(upper.selectedMeasure.max,10);assert.equal(upper.dailyCap,n*100);
 for(const [age,kg] of [[5.999,20],[6,20],[8,40]])assert.ok(dose(bal,balv,age,kg,{optionIndex:s.index}).error,'Unspecified exact age/weight boundaries stay blocked');
 assert.equal(dose(bal,balv,8,20,{optionIndex:s.index,ageConfirmed:false}).needsAgeConfirmation,true);
 assert.equal(dose(bal,balv,8,20,{optionIndex:s.index,safetyConfirmed:false}).needsSafetyConfirmation,true);
}
const oledroName='Paracetamol + Chlorpheniramine + Phenylephrine + Oxolamine',oledro=variant(oledroName,()=>true);assert.equal(oledro.concentration.unit,'unit');assert.ok(dose(oledroName,oledro,12).error);measure(oledroName,oledro,12.001,1);assert.equal(dose(oledroName,oledro,16).dailyCap,4);
for(const name of ['Paracetamol + Phenylephrine + Chlorpheniramine','Paracetamol + Caffeine + Chlorpheniramine + Vitamin C'])for(const v of variants(name)){assert.ok(dose(name,v,12).error);measure(name,v,12.001,1);assert.ok(dose(name,v,12.001).dailyCap<=4);}
assert.equal(variant('Paracetamol + Acetylcysteine',()=>true).review.status,'source-conflict');
for(const name of ['Paracetamol + Oxolamine + Chlorpheniramine','Paracetamol + Oxolamine + Pseudoephedrine + Chlorpheniramine'])for(const v of variants(name)){assert.equal(v.schemes.length,0);assert.equal(v.review.status,'product-unconfirmed');assert.ok(v.review.sources.every(s=>s.url.startsWith('https://lekovi.zdravstvo.gov.mk/')));}
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
 const options=after.clinicalAudit.drugs[evidence.drugName]?.calculator.options||[],indices=new Set(options.map((o,i)=>o.marketEvidenceKey===evidence.key?i:-1));
 const choices=after.marketCatalog.drugs.find(d=>d.name===evidence.drugName)?.forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===evidence.id))||[];
 assert.ok(choices.every(v=>v.schemes.every(s=>!indices.has(s.index))),evidence.key+' is revoked when '+key+' changes');
}
for(const row of inventory.filter(p=>/granul|powder/i.test(p.pharmaceutical_form)&&!/m[lL]/.test(p.strength))){const f=market.classifyForm(row.pharmaceutical_form,row);assert.equal(f.measure,'whole');assert.equal(f.route,'oral');}
assert.equal(market.withMarket(reference,products).marketCatalog.revision,reference.marketCatalog.revision);
const legacy=require('../lib/pediatric-common-reference-handler').clientReference(reference);
assert.ok(!legacy.marketCatalog);for(const drug of cough.drugs)assert.ok(legacy.clinicalAudit.drugs[drug.name].calculator.disabled);
assert.equal(JSON.stringify(source),before,'Original 50-drug source and clinical audit are immutable');
console.log('PASS: 80 cough products / 32 entries / 38 scoped schemes for 54 products, individual theophylline ranges, exact combination volumes, age/weight/daily limits, identities, routes, unresolved sources and legacy safety');
