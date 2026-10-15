'use strict';
const assert=require('node:assert/strict');
const market=require('../lib/pediatric-market-catalog');
const server=require('../lib/pediatric-common-calculate-handler');
const additions=require('../data/pediatric-market-additions-v1.json');
const products=require('./fixtures/pediatric-market-products-20261015');
const source={...require('../data/pediatric-common-drugs-reference.json'),weightAgeDefaults:require('../data/pediatric-weight-age-defaults.json'),clinicalAudit:require('../data/pediatric-clinical-audit-v1.json')};
const original=JSON.stringify(source),reference=market.withMarket(source,products);
const variants=name=>reference.marketCatalog.drugs.find(d=>d.name===name).forms.flatMap(f=>f.variants);
const variant=(name,predicate)=>{const v=variants(name).find(predicate);assert.ok(v,name+' has real AKKPM variant');return v;};
const byProduct=(name,id)=>variant(name,v=>v.products.some(p=>p.id===id));
const dose=(name,v,w,a,extra={})=>server.calculate(reference,{drugName:name,variantId:v.id,optionIndex:v.schemes[0]?.index,weight:w,age:a,ageUnit:'year',ageConfirmed:true,safetyConfirmed:true,referenceRevision:server.revisionOf(reference),...extra});
assert.equal(reference.marketCatalog.productCount,897);assert.equal(reference.marketCatalog.drugs.length,69);
assert.equal(new Set(products.map(p=>p.id)).size,products.length);
for(const d of reference.marketCatalog.drugs)for(const f of d.forms)assert.equal(new Set(f.variants.map(v=>v.label)).size,f.variants.length,'Different product choices are visibly distinguishable');
for(const d of additions.drugs){
 const section=reference.sections.find(s=>s.drugs.some(row=>row.name===d.name));assert.equal(section.title,d.section);
 const actual=variants(d.name).flatMap(v=>v.products.map(p=>p.id)).sort();const expected=products.filter(p=>d.atcCodes.includes(p.atc_code)).map(p=>p.id).sort();assert.deepEqual(actual,expected,d.name+' contains every published scoped product exactly once');
 for(const v of variants(d.name).filter(v=>!v.schemes.length)){assert.ok(v.review?.sources.length);assert.ok(dose(d.name,v,20,5,{optionIndex:0}).error);}
}
assert.equal(market.withMarket(reference,products).marketCatalog.revision,reference.marketCatalog.revision,'Additive normalization is idempotent');
const oral=variant('Loratadine',v=>v.form.key==='oral-liquid'&&v.schemes.length);
assert.ok(dose('Loratadine',oral,12,1.999).error);assert.equal(dose('Loratadine',oral,12,2).selectedMeasure.min,5);assert.equal(dose('Loratadine',oral,30,12).selectedMeasure.min,5);assert.equal(dose('Loratadine',oral,30,12.01).selectedMeasure.min,10);assert.equal(dose('Loratadine',oral,30.001,2).selectedMeasure.min,10);
assert.equal(dose('Loratadine',oral,12,2,{safetyConfirmed:false}).needsSafetyConfirmation,true);
const tablet=variant('Loratadine',v=>v.form.key==='tablet'&&v.schemes.length);assert.ok(dose('Loratadine',tablet,30,12).error);assert.ok(dose('Loratadine',tablet,31,5.999).error);assert.equal(dose('Loratadine',tablet,31,6).selectedMeasure.min,1);
const dex=variant('Dexamethasone',v=>v.form.key==='oral-liquid'&&v.schemes.length);assert.equal(dose('Dexamethasone',dex,12,2).selectedMeasure.min,4.5);assert.equal(dose('Dexamethasone',dex,12,2,{optionIndex:dex.schemes[1].index}).selectedMeasure.min,18);assert.ok(dose('Dexamethasone',dex,12,.499).error);assert.ok(dose('Dexamethasone',dex,12,6.001).error);
const kern=byProduct('Dexamethasone','eb0ca769-5f0f-479c-aad0-bb2390e43eee');assert.equal(kern.concentration.value,3.33);assert.match(kern.label,/4 mg\/ml.*3,33 mg bazë/);assert.ok(Math.abs(dose('Dexamethasone',kern,12,2).selectedMeasure.min-7.2/3.33)<1e-10);assert.equal(dose('Dexamethasone',kern,100,5).perDoseMax,12);assert.ok(dose('Dexamethasone',kern,12,2,{optionIndex:dex.schemes[0].index}).error);
const dexTab=variant('Dexamethasone',v=>v.form.key==='tablet'&&v.concentration.value===4&&v.schemes.length);assert.ok(dose('Dexamethasone',dexTab,12,2).selectedMeasure.error,'No fractional tablet or upward rounding');
const meth=variant('Methylprednisolone',v=>v.form.key==='tablet'&&v.concentration.value===4&&v.schemes.length);assert.equal(dose('Methylprednisolone',meth,20,5).selectedMeasure.min,5);assert.equal(dose('Methylprednisolone',meth,20,5).selectedMeasure.max,10);assert.equal(dose('Methylprednisolone',meth,20,12).perDoseMin,40);assert.equal(dose('Methylprednisolone',meth,20,12).perDoseMax,60);
const methylIV=byProduct('Methylprednisolone','9a674997-e803-426a-8fbf-7da99a6c4ba9');const mIV=dose('Methylprednisolone',methylIV,20,5);assert.equal(mIV.perDoseMin,20);assert.equal(mIV.perDoseMax,40);assert.ok(mIV.selectedMeasure.error);assert.equal(dose('Methylprednisolone',methylIV,100,5).perDoseMax,80);assert.ok(dose('Methylprednisolone',methylIV,20,1).error);assert.ok(dose('Methylprednisolone',methylIV,20,5,{optionIndex:meth.schemes[0].index}).error);
const supra=byProduct('Chloropyramine hydrochloride','a4bf5af7-068c-494a-a759-a3dc6ae0f8fa');const sDose=(w,a,extra={})=>dose('Chloropyramine hydrochloride',supra,w,a,extra);
assert.equal(sDose(5,6,{ageUnit:'month'}).selectedMeasure.min,.25);assert.ok(sDose(2.49,6,{ageUnit:'month'}).error);assert.ok(sDose(5,.99,{ageUnit:'month'}).error);assert.equal(sDose(10,1).selectedMeasure.min,.5);assert.equal(sDose(20,6).selectedMeasure.max,1);assert.equal(sDose(8,6).selectedMeasure.max,.5);assert.ok(sDose(20,14.01).error);
for(let w=5;w<=40;w+=.05){const r=sDose(w,7);assert.ok(r.perDoseMax<=r.dailyCap+1e-8,'Initial dose cannot exceed weight-based total ceiling');}
const syno=byProduct('Chloropyramine hydrochloride','1e5d8731-2432-434a-97b8-35109d15fa74');assert.equal(dose('Chloropyramine hydrochloride',syno,20,5).selectedMeasure.min,.4);assert.ok(dose('Chloropyramine hydrochloride',syno,20,5,{optionIndex:supra.schemes[0].index}).error);assert.ok(variants('Chloropyramine hydrochloride').filter(v=>v.products.some(p=>p.name.startsWith('Allergosan'))).every(v=>!v.schemes.length));
const ketoprofen=variant('Ketoprofen',v=>v.schemes.length);assert.ok(dose('Ketoprofen',ketoprofen,50,17.999).error);assert.equal(dose('Ketoprofen',ketoprofen,50,18).selectedMeasure.min,1);assert.equal(dose('Ketoprofen',ketoprofen,50,18).dailyCap,200);
const ketorolac=byProduct('Ketorolac','dff0e543-8db2-4d0a-9120-0772b3163af2');assert.ok(dose('Ketorolac',ketorolac,50,15.999).error);assert.equal(dose('Ketorolac',ketorolac,49.99,16).dailyCap,60);assert.equal(dose('Ketorolac',ketorolac,50,16).dailyCap,90);assert.equal(dose('Ketorolac',ketorolac,50,16).perDoseMin,10);assert.ok(Math.abs(dose('Ketorolac',ketorolac,50,16).selectedMeasure.min-1/3)<1e-10);assert.ok(variants('Ketorolac').filter(v=>v.products.some(p=>!p.approvedPopulation)).every(v=>!v.schemes.length),'Unknown population never silently becomes pediatric');
const vitamin=variant('Vitamin D3 · Cholecalciferol',v=>v.schemes.length);const vd=(age,extra={})=>dose('Vitamin D3 · Cholecalciferol',vitamin,5,age,{ageUnit:'day',...extra});assert.ok(vd(6).error);assert.equal(vd(7).selectedMeasure.min,1);assert.equal(vd(7).selectedMeasure.max,2);assert.equal(vd(7).selectedMeasure.unit,'pikë');assert.equal(vd(7).selectedMeasure.actualMax,800);assert.ok(dose('Vitamin D3 · Cholecalciferol',vitamin,20,4).error);
const folic=variant('Vitamin B9 · Folic acid',v=>v.schemes.length);assert.ok(dose('Vitamin B9 · Folic acid',folic,12,1).error);assert.equal(dose('Vitamin B9 · Folic acid',folic,12,1.001).selectedMeasure.min,1);assert.equal(dose('Vitamin B9 · Folic acid',folic,12,2).perDoseMin,5);
for(const ev of additions.productEvidence)for(const field of Object.keys(ev.fields)){
 const changed=products.map(p=>p.id===ev.id?{...p,[field]:field==='registry_number'?0:'changed'}:p);const after=market.withMarket(source,changed);const opts=after.clinicalAudit.drugs[ev.drugName]?.calculator.options||[];const revoked=new Set(opts.map((o,i)=>o.marketEvidenceKey===ev.key?i:-1));
 const choices=after.marketCatalog.drugs.find(d=>d.name===ev.drugName)?.forms.flatMap(f=>f.variants).filter(v=>v.products.some(p=>p.id===ev.id))||[];assert.ok(choices.every(v=>v.schemes.every(s=>!revoked.has(s.index))),ev.key+' fails closed for '+field);
 if(ev.key==='oleovit-d3-400iu-drop')assert.ok(choices.every(v=>!v.concentration.perDrop),'Drop calibration is revoked with product identity');
}
assert.equal(JSON.stringify(source),original,'Original 50-drug source/audit stay unchanged');
console.log('PASS: all 160 added AKKPM products, 19 grouped entries, 6 requested medicines, vitamins, exact product/base/drop identities, age/weight boundaries and route isolation');
