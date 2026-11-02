'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs');
const core=require('../antibiotiket-catalog-core');
require('../antibiotiket-catalog-data');require('../antibiotiket-choices-data');require('../antibiotiket-clinical-tools');
const data=globalThis.DRX_ANTIBIOTIC_CATALOG,choices=globalThis.DRX_ANTIBIOTIC_CHOICES;
const original=JSON.stringify(data),all=core.withChoiceReferences(data.antibiotics,choices,data.conditions);
const get=name=>all.find(a=>a.name===name),condition=name=>data.conditions.find(c=>c.name===name).id;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tools=()=>globalThis.DRX_ANTIBIOTIC_CLINICAL_TOOLS.create({core,all,choices,conditions:new Map(data.conditions.map(c=>[c.id,c.name])),esc,link:(u,t)=>'<a href="'+esc(u)+'">'+esc(t)+'</a>'});
test('choice references have exact sources, bounded populations and no fabricated doses or approvals',()=>{
 assert.equal(choices.profiles.length,7);
 for(const p of choices.profiles){assert(p.conditionIds.every(id=>data.conditions.some(c=>c.id===id)));assert(choices.sources.some(s=>s.id===p.sourceId&&/^https:\/\/www\.nice\.org\.uk\/guidance\/ng\d+\/chapter\/Recommendations$/.test(s.url)));assert.equal(p.calculatorApproved,false);assert.equal(p.localApproval,null);for(const r of p.rows){assert(all.some(a=>a.id===r.substanceId));assert(['first','second','alternative'].includes(r.tier));assert.equal(r.route,'PO');assert(!('dose' in r));}}
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
