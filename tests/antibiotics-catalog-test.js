'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const core=require('../antibiotiket-catalog-core');require('../antibiotiket-catalog-data');
const data=globalThis.DRX_ANTIBIOTIC_CATALOG,snapshot=require('../data/antibiotics/sheet-snapshot-2026-11-02.json');
const a=data.antibiotics,find=name=>a.find(x=>x.name===name);
test('complete uploaded registry: active display and inactive history remain separate',()=>{
 assert.equal(a.length,135);assert.equal(a.flatMap(x=>x.products).length,660);assert.equal(data.audit.historicalProducts.length,47);
 assert.equal(new Set(a.map(x=>x.id)).size,135);assert.equal(a.some(x=>x.name==='Cefprozil'),false);assert.equal(a.some(x=>x.name==='Cloxacillin'),false);
 assert(a.every(x=>x.products.length&&x.products.every(p=>p.status==='Active')));
 const source=snapshot.sheets.find(s=>s.title==='Produktet').rows.slice(1);const pp=[...a.flatMap(x=>x.products),...data.audit.historicalProducts];assert.equal(pp.length,707);
 for(const r of source){const p=pp.find(p=>p.id===r[0]);assert.deepEqual([p.brand,p.activeIngredient,p.strength,p.form,p.packaging,p.atc,p.legalStatus,p.applicationType,p.authorizationHolder,p.manufacturer,p.registration,p.status,p.withdrawalNote,p.authorizationType],r.slice(3,17));}
});
test('controlled indication names share an ID, generic infection labels never enter filters',()=>{
 assert.equal(new Set(data.conditions.map(x=>x.name)).size,data.conditions.length);assert.equal(new Set(data.conditions.map(x=>x.id)).size,data.conditions.length);
 assert(data.conditions.every(x=>!/^infeksione?($| bakteriale$)/i.test(x.name)));
 const ids=new Map(data.conditions.map(x=>[x.id,x.name]));
 for(const drug of a)for(const ref of drug.indicationReferences){assert(ref.conditionIds.length);assert(ref.conditionIds.every(id=>ids.has(id)));assert(data.sources.some(s=>s.id===ref.sourceId));}
 const amo=find('Amoxicillin + Clavulanic acid');assert(amo.indications.includes('Cistit'));assert(amo.indications.includes('Otit media akut'));
 const c=data.conditions.find(x=>x.name==='Konjuktivit bakterial');assert(core.filterAntibiotics(a,{indication:c.id}).length>1);
});
test('two chemical parent groups, useful subgroups, no products invented for empty classes',()=>{
 assert.deepEqual([...new Set(a.map(x=>x.group))].sort(),['Beta-Laktamët','Jo-Beta-Laktamët']);
 assert.equal(find('Amoxicillin').subgroup,'Penicilinat');assert.equal(find('Ceftriaxone').subgroup,'Cefalosporinat');assert.equal(find('Ceftriaxone').generation,'III');assert.equal(find('Meropenem').subgroup,'Karbapenemët');
 assert.equal(find('Linezolid').subgroup,'Oxazolidinonet');assert.equal(a.some(x=>x.name==='Aztreonam'),false);
 assert.equal(find('Betamethasone + Gentamicin').group,'Jo-Beta-Laktamët');
});
test('search and all seven filters compose; route and form match one product',()=>{
 const result=core.filterAntibiotics(a,{search:'amoxicillin',group:'Beta-Laktamët',subgroup:'Penicilinat',route:'PO',form:'Tabletë'});assert(result.length);assert(result.every(x=>x.group==='Beta-Laktamët'));
 assert(core.filterAntibiotics(a,{search:'ALMACIN'}).length>0);
 const synthetic={id:'a',name:'a',atc:'x',group:'x',subgroup:'x',conditionIds:['c'],indications:['Cistit'],populations:['Të rritur'],products:[{status:'Active',route:'PO',formLabel:'Tabletë'},{status:'Active',route:'IV',formLabel:'Solucion për infuzion'}]};
 assert.equal(core.filterAntibiotics([synthetic],{route:'PO',form:'Solucion për infuzion'}).length,0);assert.equal(core.filterAntibiotics([synthetic],{route:'PO',form:'Tabletë',population:'Të rritur',indication:'c'}).length,1);
 assert.equal(core.filterAntibiotics([synthetic],{population:'Fëmijë / adoleshentë'}).length,0);
});
test('selection uses composition IDs, so shared ATC combinations do not select each other',()=>{
 const shared=a.filter(x=>x.atc==='D07CC01');assert(shared.length>1);const chosen=shared[0].id;
 assert.deepEqual(core.readSelected(JSON.stringify([chosen,chosen,'INVALID']),a.map(x=>x.id)),[chosen]);assert.deepEqual(core.readSelected('invalid',[]),[]);
 assert.deepEqual(core.filterAntibiotics(a,{selectedOnly:true},[chosen]).map(x=>x.id),[chosen]);
});
test('all 290 original Mayo records retain dose, route, form, duration, source and audit',()=>{
 const rr=[...a.flatMap(x=>x.regimens),...data.audit.unmatchedMayo];assert.equal(new Set(rr.map(x=>x.id)).size,290);
 for(const r of snapshot.legacyMayo.slice(1)){const m=rr.find(m=>m.id===r[0]);assert(m);const n=v=>v===''?null:v;assert.deepEqual([m.route,m.formulation,m.originalIndication,m.population,m.doseMin,m.doseMax,m.doseUnit,m.interval,m.daysMin,m.daysMax,m.note,m.maxDaily,m.sourceType,m.mayoUrl,m.clinicalStatus,m.qaStatus,m.qaReason],[r[2],r[3],r[4],r[5],n(r[6]),n(r[7]),r[8],r[9],n(r[10]),n(r[11]),r[12],n(r[13]),r[14],r[15],r[16],r[17],r[19]]);assert.equal(core.isCalculatorApproved(m),false);}
 assert.equal(core.isCalculatorApproved({calculatorApproved:true,qaStatus:'MIRATUAR'}),false);
 for(const id of ['M065','M066']){const m=rr.find(r=>r.id===id);assert.equal(m.qaStatus,'BLLOKUAR / VERIFIKO');assert.match(m.qaReason,/FDA/);}
});
test('oral doses, nonspecific indications and extended release do not leak into other forms',()=>{
 for(const drug of a){const rr=core.matchingRegimens(drug,{route:'IV'});assert(rr.every(r=>!r.route.includes('PO')));assert(core.matchingRegimens(drug).every(r=>r.conditionIds.length));}
 const fake={products:[{status:'Active',route:'PO',formLabel:'Tabletë'}],regimens:[{conditionIds:['c'],route:'PO',formulation:'tabletë me çlirim të zgjatur',populations:[]}]};assert.equal(core.matchingRegimens(fake,{form:'Tabletë'}).length,0);
 const mup=a.filter(x=>x.name==='Mupirocin');assert.equal(mup.length,2);assert(mup.some(x=>x.forms.includes('Pomadë nazale')));assert(mup.some(x=>x.forms.includes('Pomadë')));
});
test('local identity conflicts stay blocked and exact local approval dates stay empty',()=>{
 const suspect=a.find(x=>x.name==='Amoxicillin'&&x.atc==='J01CR02');assert.match(suspect.clinicalStatus,/Bllokuar/);assert(suspect.products.every(p=>/Bllokuar/.test(p.clinicalStatus)));
 assert(data.sources.every(s=>!s.localApprovalDate));assert(a.every(x=>x.calculatorApproved===false));
});

test('oral C. difficile and cream-only mupirocin references are not shown on incompatible products',()=>{
 const van=find('Vancomycin');assert(!van.indications.includes('Diarre nga Clostridioides difficile'));assert(core.matchingRegimens(van).every(r=>r.route!=='PO'));
 const mup=a.find(x=>x.name==='Mupirocin'&&x.atc==='D06AX09');assert.deepEqual(mup.indications,['Impetigo']);
 for(const p of a.flatMap(x=>x.products))if(/powder.*injection/i.test(p.form)&&!/infusion/i.test(p.form))assert(!p.formLabel.includes('infuzion'));
 const topical=a.find(x=>x.name==='Hydrocortisone + Oxytetracycline');assert(!topical.forms.includes('Suspension oral'));
});
