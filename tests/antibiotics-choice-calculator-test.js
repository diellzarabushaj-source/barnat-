'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs');
const core=require('../antibiotiket-catalog-core');
require('../antibiotiket-catalog-data');require('../antibiotiket-choices-data');globalThis.DRX_ANTIBIOTIC_DOSE_ENGINE=require('../antibiotiket-dose-engine');require('../antibiotiket-protocols');require('../antibiotiket-clinical-tools');
const data=globalThis.DRX_ANTIBIOTIC_CATALOG,choices=globalThis.DRX_ANTIBIOTIC_CHOICES;
const original=JSON.stringify(data),all=core.withChoiceReferences(data.antibiotics,choices,data.conditions);
const get=name=>all.find(a=>a.name===name),condition=name=>data.conditions.find(c=>c.name===name).id;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tools=()=>globalThis.DRX_ANTIBIOTIC_CLINICAL_TOOLS.create({core,all,choices,conditions:new Map(data.conditions.map(c=>[c.id,c.name])),esc,link:(u,t)=>'<a href="'+esc(u)+'">'+esc(t)+'</a>'});
test('choice references have exact sources, bounded populations and no fabricated doses or approvals',()=>{
 assert.equal(choices.profiles.length,12);
 assert.equal(new Set(choices.profiles.flatMap(p=>p.conditionIds)).size,10);
 for(const p of choices.profiles){assert(p.conditionIds.every(id=>data.conditions.some(c=>c.id===id)));assert(choices.sources.some(s=>s.id===p.sourceId&&/^https:\/\/www\.nice\.org\.uk\/guidance\/ng\d+\/chapter\/Recommendations$/.test(s.url)));assert.equal(p.calculatorApproved,false);assert.equal(p.localApproval,null);for(const r of p.rows){if(r.substanceId)assert(all.some(a=>a.id===r.substanceId));else{assert(r.sourceSubstance);assert(!all.some(a=>a.name===r.sourceSubstance));}assert(['first','second','alternative'].includes(r.tier));assert(['PO','TOP'].includes(r.route));assert(!('dose' in r));}}
 assert.equal(core.choiceProfiles(choices,condition('Otit media akut'),'Të rritur').length,0);
 const childDoxy=choices.profiles.find(p=>p.id==='cap-child-nonsevere').rows.find(r=>r.substanceId==='ABX-6ba3b90f3334');assert.match(childDoxy.note,/12–17/);assert.match(childDoxy.note,/alergji/);assert.match(childDoxy.note,/jo në shtatzëni/);
 const cap=core.choiceProfiles(choices,condition('Pneumoni e fituar në komunitet'));assert(cap.every(p=>!p.rows.some(r=>r.tier==='second')));assert(cap.every(p=>p.secondNote));
});
test('choice indications enrich only compatible catalog identities without changing products or Mayo regimens',()=>{
 assert.equal(JSON.stringify(data),original);assert.equal(all.length,135);assert.equal(all.flatMap(a=>a.products).length,660);
 for(const a of all){const before=data.antibiotics.find(b=>b.id===a.id);assert.deepEqual(a.products,before.products);assert.deepEqual(a.regimens,before.regimens);}
 const sinus=condition('Sinusit akut bakterial');assert(core.filterAntibiotics(all,{indication:sinus}).some(a=>a.name==='Phenoxymethylpenicillin'));
 assert(core.filterAntibiotics(all,{indication:sinus}).some(a=>a.name==='Clarithromycin'));
 const conflict=all.find(a=>a.name==='Amoxicillin'&&a.atc==='J01CR02');assert(!conflict.indicationReferences.some(r=>r.sourceId.startsWith('CHOICE-')));
 const iv=core.filterAntibiotics(all,{indication:sinus,route:'IV'});assert(!iv.some(a=>a.name==='Phenoxymethylpenicillin'));
});
test('uncovered indications, missing second choices and filtered products never acquire an invented rank',()=>{
 const t=tools();assert.equal(t.renderChoices({}),'');
 const unknown=t.renderChoices({indication:condition('Infeksion nga Helicobacter pylori')});assert.match(unknown,/Mungon renditje burimore/);assert(!unknown.includes('abx-choice-tier'));
 const throat=t.renderChoices({indication:condition('Faringjit streptokoksik'),population:'Të rritur'});assert.match(throat,/Zgjedhja e parë/);assert.match(throat,/Zgjedhja e dytë/);assert.match(throat,/Burimi nuk cakton antibiotik të dytë rutinë/);assert.match(throat,/Alternativa/);
 const filtered=t.renderChoices({indication:condition('Sinusit akut bakterial'),population:'Të rritur',route:'IV'});assert(!filtered.includes('data-choice-open='));assert.match(filtered,/Nuk përputhet me filtrat aktualë/);
});
test('every per-antibiotic calculator remains blocked, including forged approval flags and mismatched route or formulation',()=>{
 for(const a of all){const state=core.calculatorState(a);assert.equal(state.enabled,false);assert.equal(state.result,null);assert(state.reasons.length);}
 const a=get('Amoxicillin'),p=a.products.find(p=>p.route==='PO'),r=a.regimens.find(r=>r.id==='M006');
 const selection={conditionId:r.conditionIds[0],productId:p.id,regimenId:r.id};assert.equal(core.calculatorState(a,selection).enabled,false);
 const forged={...a,products:[{...p,registryVerifiedAt:'2026-11-02',clinicalStatus:'MIRATUAR'}],regimens:[{...r,calculatorApproved:true,qaStatus:'MIRATUAR'}]};assert.equal(core.calculatorState(forged,selection).enabled,false);
 const wrong={...forged,products:[{...forged.products[0],route:'IV'}]};assert(core.calculatorState(wrong,selection).reasons.some(r=>r.includes('nuk përputhet')));
 const xr={...forged,products:[{...forged.products[0],form:'Modified-release tablet'}]};assert(core.calculatorState(xr,selection).reasons.some(r=>r.includes('nuk përputhet')));
 const blocked=all.find(a=>/^Bllokuar/.test(a.clinicalStatus));assert(core.calculatorState(blocked).reasons.some(r=>r.startsWith('Bllokuar')));
});
test('unapproved workspaces show a compact reference card and never collect patient inputs',()=>{
 const t=tools(),a=get('Amoxicillin'),id=condition('Infeksion nga Helicobacter pylori');
 t.renderCalculator(a,id);const event={target:{dataset:{calcField:'weight'},value:'25',closest:()=>({dataset:{calculator:a.id}})}};
 assert.equal(t.handleInput(event),false);
 for(const item of all)for(const conditionId of item.conditionIds){const html=t.renderCalculator(item,conditionId);assert.equal(t.calculatorAvailable(item,conditionId),false);assert.match(html,/abx-dose-pending/);assert.doesNotMatch(html,/<input|data-calculate|data-calc-field="(?:age|ageUnit|weight|crcl|dialysis)"/);assert(!html.includes('Llogaritja është e bllokuar'));}
 t.clearDrafts();
 const code=fs.readFileSync(require.resolve('../antibiotiket-clinical-tools'),'utf8');assert.doesNotMatch(code,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|postMessage|console\./);
 const html=t.renderCalculator(a,id);assert.match(html,/Produktet dhe burimet/);assert.doesNotMatch(html,/abx-dose-reference" open/);
});
test('urinary choices preserve exact release/strength and unavailable monotherapies stay outside the catalog',()=>{
 const p=choices.profiles.find(p=>p.id==='cystitis-women-nonpregnant'),nitro=p.rows.find(r=>r.substanceId===get('Nitrofurantoin').id);
 const product=(form,strength)=>({status:'Active',route:'PO',form,strength});
 assert(core.referenceMatchesProduct(nitro,product('Modified release capsule','100 mg')));
 assert(core.referenceMatchesProduct(nitro,product('Capsule','50 mg')));
 for(const pp of [product('Modified release capsule','50 mg'),product('Capsule','100 mg'),product('Tablet','100 mg'),product('Oral suspension','25 mg/5 ml')])assert(!core.referenceMatchesProduct(nitro,pp));
 const fos=p.rows.find(r=>r.substanceId===get('Fosfomycin').id);assert(core.referenceMatchesProduct(fos,product('Granules','3 g')));assert(!core.referenceMatchesProduct(fos,product('Tablet','3 g')));assert(!core.referenceMatchesProduct(fos,product('Granules','3.g')));
 const trim=p.rows.find(r=>r.sourceSubstance==='Trimethoprim');assert.equal(trim.substanceId,null);
 const cotrim=all.find(a=>a.name==='Sulfamethoxazole + Trimethoprim');assert(!cotrim.indicationReferences.some(r=>r.id.startsWith(p.id)));
 const t=tools(),html=t.renderChoices({indication:condition('Cistit akut i pakomplikuar'),population:'Të rritur'});assert.match(html,/Trimethoprim/);assert.match(html,/Pivmecillinam/);assert(!html.includes('data-choice-open="'+cotrim.id+'"'));
 assert(core.choiceProfiles(choices,condition('Cistit akut i pakomplikuar'),'Fëmijë / adoleshentë').some(x=>x.id===p.id));assert.match(p.label,/≥16/);
});
test('skin choices do not turn injectable, nasal, eye or steroid combination products into dermal/oral substitutes',()=>{
 const p=choices.profiles.find(p=>p.id==='impetigo-adult-local'),mup=p.rows.find(r=>r.substanceId===get('Mupirocin').id),fus=p.rows.find(r=>r.substanceId===get('Fusidic acid').id);
 assert(core.referenceMatchesProduct(mup,{status:'Active',route:'TOP',form:'Ointment',strength:'2 %'}));
 assert(!core.referenceMatchesProduct(mup,{status:'Active',route:'NASAL',form:'Nasal ointment',strength:'2 %'}));
 assert(!core.referenceMatchesProduct(fus,{status:'Active',route:'TOP',form:'Cream',strength:'12 %'}));
 assert(!core.referenceMatchesProduct(fus,{status:'Active',route:'TOP',form:'Cream',strength:'20 mg'}));
 const fluclox=get('Flucloxacillin');assert(!fluclox.indicationReferences.some(r=>r.id.startsWith('cellulitis-adult-oral')));
 const html=tools().renderChoices({indication:condition('Celulit bakterial'),population:'Të rritur'});assert.match(html,/Flucloxacillin/);assert.match(html,/Pa produkt të përputhshëm/);assert(!html.includes('data-choice-open="'+fluclox.id+'"'));
 for(const a of all.filter(a=>a.atc==='R01AX06'||a.atc==='S01AA13'||a.name.includes('Hydrocortisone')))assert(!a.indicationReferences.some(r=>r.id.startsWith('impetigo-adult-local')));
});
test('local and systemic reference cards have no age, weight, renal or inactive calculation controls',()=>{
 const t=tools();for(const a of [get('Amoxicillin'),all.find(a=>a.name==='Mupirocin'&&a.atc==='D06AX09')]){const html=t.renderCalculator(a,a.conditionIds[0]);assert.doesNotMatch(html,/<input|data-calculate/);assert.match(html,/Në përgatitje/);}
});
test('each antibiotic-indication pair owns a separate workspace and drafts do not cross indications',()=>{
 const t=tools(),a=get('Amoxicillin'),first=condition('Infeksion nga Helicobacter pylori'),second=condition('Otit media akut');
 t.renderCalculator(a,first);t.handleChange({target:{dataset:{calcField:'productId'},value:a.products[0].id,closest:()=>({dataset:{calculator:a.id,calculatorCondition:first}})}});
 assert(!t.renderCalculator(a,second).includes('value="'+a.products[0].id+'" selected'));assert(t.renderCalculator(a,first).includes('value="'+a.products[0].id+'" selected'));
 const coverage=globalThis.DRX_ANTIBIOTIC_PROTOCOLS.coverage(all);assert.equal(coverage.length,all.reduce((n,a)=>n+a.conditionIds.length,0));assert.equal(new Set(coverage.map(c=>c.id)).size,coverage.length);assert(coverage.every(c=>!c.clinicalApproved));
});
test('the Qilu SmPC is never applied to CEFIN, other indications, strengths or inactive records',()=>{
 const catalog=globalThis.DRX_ANTIBIOTIC_PROTOCOLS,a=get('Ceftazidime'),id=condition('Infeksione urinare të komplikuara'),qilu=a.products.find(p=>p.brand==='CEFTAZIDIMA QILU'),cefin=a.products.find(p=>p.brand==='CEFIN');
 const choices=catalog.candidates(a,id,qilu,core);assert.equal(choices.length,1);assert.equal(choices[0].sourceKind,'SmPC');assert.equal(choices[0].sourceVersion,'2025-10');assert.equal(choices[0].doseMin,1);assert.equal(choices[0].doseMax,2);assert.equal(choices[0].daysMin,null);
 assert.equal(catalog.candidates(a,id,cefin,core).length,0);assert.equal(catalog.candidates(a,condition('Meningjit bakterial'),qilu,core).length,0);
 assert.equal(catalog.candidates(a,id,{...qilu,strength:'2 g'},core).length,0);assert.equal(catalog.candidates(a,id,{...qilu,status:'Suspended'},core).length,0);
 const state=catalog.workspaceState(a,{conditionId:id,productId:qilu.id,regimenId:'',crcl:'40'},core);assert.equal(state.enabled,false);assert.equal(state.result,null);assert(state.reasons.some(r=>r.includes('insuficiencën renale')));assert.equal(Object.keys(catalog.approvedBindings).length,0);
});

// Isolated, synthetic release fixtures exercise the future approved UI without
// adding a clinical approval to the production registry or modifying patient data.
function releasedFixture(overrides={}){
 const product={id:'TEST-PRODUCT',status:'Active',brand:'SYNTHETIC TEST',route:'PO',form:'Tablet',formLabel:'Tabletë',strength:'125 mg',registration:'TEST-MA',registryVerifiedAt:'2026-11-02'},item={id:'TEST-ABX',name:'SYNTHETIC TEST',products:[product],clinicalStatus:'Reviewed test fixture'};
 const base={productId:product.id,route:'PO',form:product.form,strength:product.strength,sourceId:'TEST-SOURCE',sourceVersion:'fixture-v1',protocolId:'TEST-PROTOCOL',minAgeYears:2,maxAgeYears:80,minWeightKg:5,maxWeightKg:150,model:{kind:'fixed',doseMg:125,intervalHours:12},approval:{status:'approved',reviewer:'SYNTHETIC TEST FIXTURE',reviewedAt:'2026-11-02',sourceVersion:'fixture-v1',productVerified:true,routeVerified:true,formVerified:true,concentrationVerified:true}};
 const registry=Object.fromEntries(['TEST-A','TEST-B'].map(id=>[id,{...base,conditionId:id,...overrides}]));
 const candidates=(a,id,p)=>p&&['TEST-A','TEST-B'].includes(id)?[{id,modelBindingId:id,sourceId:'TEST-SOURCE',sourceVersion:'fixture-v1',sourceKind:'Synthetic test',sourceUrl:'https://example.invalid/test',sourceLabel:'Synthetic fixture',doseMin:125,doseMax:125,doseUnit:'mg/dozë',interval:'q12h',population:'Synthetic test only',route:'PO'}]:[];
 const protocolData={approvedBindings:registry,candidates,workspaceState(a,d){const p=a.products.find(p=>p.id===d.productId),available=candidates(a,d.conditionId,p);return {enabled:false,product:p,available,selected:available[0],reasons:['Synthetic test']};}};
 const sandbox={DRX_ANTIBIOTIC_PROTOCOLS:protocolData,DRX_ANTIBIOTIC_DOSE_ENGINE:require('../antibiotiket-dose-engine')};
 require('node:vm').runInNewContext(fs.readFileSync(require.resolve('../antibiotiket-clinical-tools'),'utf8'),sandbox);
 const t=sandbox.DRX_ANTIBIOTIC_CLINICAL_TOOLS.create({core,all:[item],choices:{sources:[]},conditions:new Map([['TEST-A','Synthetic A'],['TEST-B','Synthetic B']]),esc,link:(u,s)=>s});
 const event=(conditionId,field,value)=>({target:{dataset:{calcField:field},value,closest:()=>({dataset:{calculator:item.id,calculatorCondition:conditionId}})}});
 const select=id=>{t.renderCalculator(item,id);t.handleChange(event(id,'productId',product.id));};
 return {t,item,event,select};
}
test('only a complete reviewed binding shows a patient form; stale or mismatched releases stay compact',()=>{
 for(const override of [{approval:null},{sourceVersion:'stale'},{form:'Other form'},{strength:'250 mg'},{sourceId:'Other source'},{model:null},{model:{kind:'fixed',doseMg:125,intervalHours:12,maxDoseMg:100}},{model:{kind:'fixed',doseMg:125,intervalHours:12,maxDailyMg:200}}]){const {t,item,select}=releasedFixture(override);select('TEST-A');assert.equal(t.calculatorAvailable(item,'TEST-A'),false);assert.doesNotMatch(t.renderCalculator(item,'TEST-A'),/<input|data-calculate/);}
 const {t,item,select}=releasedFixture();assert(t.calculatorAvailable(item,'TEST-A'));assert.doesNotMatch(t.renderCalculator(item,'TEST-A'),/<input/);select('TEST-A');assert.match(t.renderCalculator(item,'TEST-A'),/data-calc-field="age"/);
});
test('released synthetic forms retain separate drafts, clear changed age units and calculate through the same gate',()=>{
 const {t,item,event,select}=releasedFixture();select('TEST-A');t.handleInput(event('TEST-A','age','8'));t.handleInput(event('TEST-A','weight','25'));
 select('TEST-B');assert.match(t.renderCalculator(item,'TEST-B'),/data-calc-field="weight" value=""/);assert.match(t.renderCalculator(item,'TEST-A'),/data-calc-field="weight" value="25"/);
 t.handleChange(event('TEST-A','ageUnit','months'));assert.match(t.renderCalculator(item,'TEST-A'),/data-calc-field="age" value=""/);assert.match(t.renderCalculator(item,'TEST-A'),/value="months" selected/);
 t.handleChange(event('TEST-A','ageUnit','years'));t.handleInput(event('TEST-A','age','8'));
 const container={dataset:{calculator:item.id,calculatorCondition:'TEST-A'}},button={closest:()=>container};t.handleCalculate({target:{closest:()=>button}});assert.match(t.renderCalculator(item,'TEST-A'),/125 mg për dozë/);
 t.clearDrafts();assert.doesNotMatch(t.renderCalculator(item,'TEST-A'),/<input|125 mg për dozë/);
});
