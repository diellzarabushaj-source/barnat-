'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const data=require('../data/recetat-clinical-revisions-16-20.json'),fixtures=require('./fixtures/prescription-clinical-plan-16-20');
const {sourceFingerprint,withPrescriptionClinicalPlan,forPrescriptionReader}=require('../lib/prescription-clinical-plan');
const source=fs.readFileSync(path.join(__dirname,'../recetat-v2.js'),'utf8');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'")),end=source.indexOf('  if (document.readyState',start);
const c={window:{},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.qa={clinicalChoiceState,sourceDraftText,renderGuide,reset(){state.clinicalChoices=Object.create(null);}};})();',c);
const {clinicalChoiceState,sourceDraftText,renderGuide}=c.qa;
const get=key=>structuredClone(fixtures.find(g=>g.chapterNumber+'.'+g.orderInChapter===key));
assert.equal(data.coverage.length,116);assert.equal(fixtures.length,116);
assert.equal(Object.keys(data.guides).length,113);assert.equal(data.coverage.filter(p=>p.disposition==='pending-editorial').length,3);
assert.equal(Object.values(data.guides).filter(p=>p.status==='ready').length,50);
for(const fixture of fixtures){
 const {clinicalPlan:p,...raw}=fixture,before=JSON.stringify(raw);
 if(!p){assert.equal(withPrescriptionClinicalPlan(raw),raw);continue;}
 assert.match(p.sourceFingerprint,/^[a-f0-9]{64}$/);assert.equal(p.reviewState,'evidence-reconciled');
 assert.notEqual(sourceFingerprint(raw),p.sourceFingerprint);assert.equal(withPrescriptionClinicalPlan(raw).clinicalPlan.status,'source-changed');
 assert.equal(JSON.stringify(raw),before);assert.equal(withPrescriptionClinicalPlan({...raw,reviewStatus:'source-imported'}).clinicalPlan,undefined);
 const legacy=forPrescriptionReader(raw,'');assert.equal(legacy.clinicalPlan,undefined);assert.equal(legacy.reviewStatus,'source-imported');
 const html=renderGuide(fixture);assert.match(html,/<summary aria-label="Informacion për skemën"[^>]*>\?<\/summary>/);assert.doesNotMatch(html,/<details class="rx-source-information" open/);
 for(const ref of p.references){assert.match(ref.url,/^https:\/\//);assert.doesNotMatch(ref.url,/docs\.google\.com/);}
 if(p.status==='reference'){assert.equal(sourceDraftText(fixture),'');assert.match(html,/data-rx-source-custom=/);continue;}
 const state=clinicalChoiceState(fixture);
 for(const group of p.groups){
  assert.ok(group.options.length);if(!group.condition&&group.options.length>1)state.options[group.id]=group.options[0].id;
  for(const option of group.options)for(const item of option.items)if(item.kind==='active-substance')for(const key of ['genericName','dose','frequency','duration','route'])assert.ok(item[key],p.key+' '+key);
 }
 if(p.confirmation){assert.equal(sourceDraftText(fixture),'');state.confirmed=true;}
 assert.ok(sourceDraftText(fixture).startsWith('Rp:'),p.key);
}
c.qa.reset();
const text=g=>sourceDraftText(g).split('\nKujdes:')[0];
const acne=get('16.3');assert.match(text(acne),/Adapalene[\s\S]*EDHE[\s\S]*Doxycycline[\s\S]*100 mg[\s\S]*12 javë/);assert.doesNotMatch(text(acne),/Isotretinoin|Minocycline|Azithromycin/);
const severe=get('16.4');assert.equal(severe.clinicalPlan.status,'reference');assert.match(severe.clinicalPlan.notes.join(' '),/Isotretinoin[\s\S]*mg\/kg\/DITË/);assert.doesNotMatch(severe.clinicalPlan.notes.join(' '),/Dermatiti atopik/);
const nails=get('16.15'),n=clinicalChoiceState(nails);n.confirmed=true;n.options.g1='o1';assert.match(text(nails),/250 mg[\s\S]*6 javë/);assert.doesNotMatch(text(nails),/12 javë/);n.options.g1='o2';assert.match(text(nails),/12 javë/);
const nappy=get('16.28');assert.doesNotMatch(text(nappy),/^\d+\. (Diflucortolone|Hydrocortisone|Clotrimazole)/m);assert.match(text(nappy),/barrierë/);
const fissure=get('17.7');assert.equal(sourceDraftText(fissure),'');clinicalChoiceState(fissure).confirmed=true;assert.match(text(fissure),/4 mg\/g \(0,4%\)[\s\S]*2,5 cm[\s\S]*1,5 mg GTN[\s\S]*12 orë[\s\S]*8 javë/);assert.doesNotMatch(text(fissure),/pomadë.*2%/);
const eye=get('18.4');clinicalChoiceState(eye).confirmed=true;assert.match(text(eye),/Moxifloxacin[\s\S]*0,5%[\s\S]*1 pikë[\s\S]*3 herë[\s\S]*2–3 ditë/);assert.doesNotMatch(text(eye),/Tobramycin|Dexamethasone/);
const allergy=get('18.6');assert.match(text(allergy),/1 mg\/mL \(0,1%\)[\s\S]*2 herë[\s\S]*8 orë/);
const gas=get('19.1'),g=clinicalChoiceState(gas);g.confirmed=true;g.options.g1='o1';assert.match(text(gas),/Penicillin V[\s\S]*500 mg[\s\S]*2 herë[\s\S]*10 ditë/);assert.doesNotMatch(text(gas),/Amoxicillin/);g.options.g1='o2';assert.match(text(gas),/Amoxicillin/);assert.doesNotMatch(text(gas),/Phenoxymethylpenicillin/);
const sinus=get('19.3'),s=clinicalChoiceState(sinus);s.confirmed=true;s.options.g1='o3';assert.match(text(sinus),/Doxycycline[\s\S]*200 mg ditën 1; pastaj 100 mg[\s\S]*5 ditë gjithsej/);assert.doesNotMatch(text(sinus),/Amoxicillin|Phenoxymethylpenicillin|Moxifloxacin/);
assert.match(text(get('19.8')),/50 mikrogramë\/spërkatje[\s\S]*ÇDO vrimë[\s\S]*200 mikrogramë\/ditë[\s\S]*1 herë në ditë/);
const ear=get('19.18');clinicalChoiceState(ear).confirmed=true;assert.match(text(ear),/3 mg\/mL[\s\S]*1 mg\/mL[\s\S]*4 pika[\s\S]*Në vesh[\s\S]*2 herë[\s\S]*7 ditë/);
assert.match(text(ear),/5 minuta pas pikave/);
assert.doesNotMatch(text(get('19.26')), /^\d+\. (Diazepam|Betahistine|Cinnarizine)/m);
for(const key of ['20.1','20.3','20.4','20.5','20.6','20.7','20.8']){const d=text(get(key));assert.match(d,/aktivitet/i);assert.doesNotMatch(d,/^\d+\. (Pregabalin|Gabapentin|Lacosamide|Prednisolone|Methylprednisolone|Diazepam)/m);}
for(const key of ['17.1','17.12','18.15','20.10','20.12','20.13','20.14','20.16','20.17'])assert.equal(sourceDraftText(get(key)),'');
const notes=key=>get(key).clinicalPlan.notes.join(' ');assert.match(notes('17.12'),/mos jep metoclopramide/i);assert.match(notes('18.8'),/3 ditë PAS shërimit/);assert.match(notes('19.25'),/48 mg\/DITË/);assert.match(notes('20.12'),/60 mg çdo 4 orë, 21 ditë/);assert.match(notes('20.13'),/EDHE metronidazole/);assert.match(notes('20.17'),/nuk kërkojnë antibiotik profilaktik rutinë/);
// Exercise the actual API enrichment with an exactly bound synthetic source too.
const moduleSource=fs.readFileSync(path.join(__dirname,'../lib/prescription-clinical-plan.js'),'utf8');
for(const key of ['16.3','16.4','17.7','18.4','19.18','20.7']){
 const {clinicalPlan:p,...raw}=get(key),bound={guides:{[raw._id]:{...p,sourceFingerprint:sourceFingerprint(raw)}}};
 const module={exports:{}};vm.runInNewContext(moduleSource,{module,require(name){return name.startsWith('../data/')?(name.endsWith('16-20.json')?bound:{guides:{}}):require(name);}});
 assert.equal(module.exports.withPrescriptionClinicalPlan(raw).clinicalPlan.status,p.status);
 raw.logicBlocks[0].items[0].sig+=' changed';assert.equal(module.exports.withPrescriptionClinicalPlan(raw).clinicalPlan.status,'source-changed');
}
console.log('Chapters 16–20: 116 coverage records, 113 bound plans, 50 structured / 63 individual, 3 pending unchanged; exact concentrations, phases, routes, OR/AND, confirmation and source-change gates passed.');
