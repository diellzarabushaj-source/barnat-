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
test('calculator drafts are independent per antibiotic and clear without browser or network persistence',()=>{
 const t=tools(),a=get('Amoxicillin'),b=get('Clarithromycin'),id=condition('Infeksion nga Helicobacter pylori');
 t.renderCalculator(a,id);const event={target:{dataset:{calcField:'weight'},value:'25',closest:()=>({dataset:{calculator:a.id}})}};
 assert.equal(t.handleInput(event),true);assert.match(t.renderCalculator(a,id),/data-calc-field="weight" value="25"/);assert.match(t.renderCalculator(b,id),/data-calc-field="weight" value=""/);
 t.clearDrafts();assert.match(t.renderCalculator(a,id),/data-calc-field="weight" value=""/);
 const code=fs.readFileSync(require.resolve('../antibiotiket-clinical-tools'),'utf8');assert.doesNotMatch(code,/localStorage|sessionStorage|fetch\(|XMLHttpRequest|postMessage|console\./);
 const html=t.renderCalculator(a,id);assert.match(html,/<button[^>]*disabled>Llogarit dozën/);assert.match(html,/Llogaritja është e bllokuar/);
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
test('age unit changes clear the entered age and local forms do not offer weight-based calculations',()=>{
 const t=tools(),a=get('Amoxicillin'),id=condition('Infeksion nga Helicobacter pylori');t.renderCalculator(a,id);
 const target=(field,value)=>({target:{dataset:{calcField:field},value,closest:()=>({dataset:{calculator:a.id}})}});
 t.handleInput(target('age','8'));assert.match(t.renderCalculator(a,id),/data-calc-field="age" value="8"/);
 assert(t.handleChange(target('ageUnit','months')));const html=t.renderCalculator(a,id);assert.match(html,/data-calc-field="age" value=""/);assert.match(html,/value="months" selected/);assert(!t.handleChange(target('ageUnit','invalid')));
 const mup=all.find(a=>a.name==='Mupirocin'&&a.atc==='D06AX09'),local=t.renderCalculator(mup,condition('Impetigo'));assert(!local.includes('data-calc-field="weight"'));assert.match(local,/Formë lokale/);assert.match(local,/disabled>Llogarit dozën/);
});
test('each antibiotic-indication pair owns a separate workspace and drafts do not cross indications',()=>{
 const t=tools(),a=get('Amoxicillin'),first=condition('Infeksion nga Helicobacter pylori'),second=condition('Otit media akut');
 t.renderCalculator(a,first);t.handleInput({target:{dataset:{calcField:'weight'},value:'65',closest:()=>({dataset:{calculator:a.id,calculatorCondition:first}})}});
 assert.match(t.renderCalculator(a,second),/data-calc-field="weight" value=""/);assert.match(t.renderCalculator(a,first),/data-calc-field="weight" value="65"/);
 const coverage=globalThis.DRX_ANTIBIOTIC_PROTOCOLS.coverage(all);assert.equal(coverage.length,all.reduce((n,a)=>n+a.conditionIds.length,0));assert.equal(new Set(coverage.map(c=>c.id)).size,coverage.length);assert(coverage.every(c=>!c.clinicalApproved));
});
test('the Qilu SmPC is never applied to CEFIN, other indications, strengths or inactive records',()=>{
 const catalog=globalThis.DRX_ANTIBIOTIC_PROTOCOLS,a=get('Ceftazidime'),id=condition('Infeksione urinare të komplikuara'),qilu=a.products.find(p=>p.brand==='CEFTAZIDIMA QILU'),cefin=a.products.find(p=>p.brand==='CEFIN');
 const choices=catalog.candidates(a,id,qilu,core);assert.equal(choices.length,1);assert.equal(choices[0].sourceKind,'SmPC');assert.equal(choices[0].sourceVersion,'2025-10');assert.equal(choices[0].doseMin,1);assert.equal(choices[0].doseMax,2);assert.equal(choices[0].daysMin,null);
 assert.equal(catalog.candidates(a,id,cefin,core).length,0);assert.equal(catalog.candidates(a,condition('Meningjit bakterial'),qilu,core).length,0);
 assert.equal(catalog.candidates(a,id,{...qilu,strength:'2 g'},core).length,0);assert.equal(catalog.candidates(a,id,{...qilu,status:'Suspended'},core).length,0);
 const state=catalog.workspaceState(a,{conditionId:id,productId:qilu.id,regimenId:'',crcl:'40'},core);assert.equal(state.enabled,false);assert.equal(state.result,null);assert(state.reasons.some(r=>r.includes('insuficiencën renale')));assert.equal(Object.keys(catalog.approvedBindings).length,0);
});
