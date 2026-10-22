'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const data=require('../data/recetat-clinical-revisions-21-22.json'),fixtures=require('./fixtures/prescription-clinical-plan-21-22');
const {sourceFingerprint,withPrescriptionClinicalPlan,forPrescriptionReader}=require('../lib/prescription-clinical-plan');
const source=fs.readFileSync(path.join(__dirname,'../recetat-v2.js'),'utf8');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'")),end=source.indexOf('  if (document.readyState',start);
let payload;const c={window:{MedIndexRecetaWorkspace:{beginSourceGuideDraft(p){payload=p;return {ok:false};}}},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.qa={clinicalChoiceState,sourceDraftText,renderGuide,beginGuide,reset(){state.clinicalChoices=Object.create(null);}};})();',c);
const {clinicalChoiceState,sourceDraftText,renderGuide,beginGuide}=c.qa;
const get=key=>structuredClone(fixtures.find(g=>g.chapterNumber+'.'+g.orderInChapter===key));
assert.equal(data.coverage.length,131);assert.equal(fixtures.length,131);assert.equal(Object.keys(data.guides).length,131);
assert.equal(data.coverage.filter(p=>p.key.startsWith('21.')).length,40);assert.equal(data.coverage.filter(p=>p.key.startsWith('22.')).length,91);
assert.equal(Object.values(data.guides).filter(p=>p.status==='ready').length,31);
for(const fixture of fixtures){
 const {clinicalPlan:p,...raw}=fixture,before=JSON.stringify(raw);
 assert.equal(p.reviewState,'evidence-reconciled');assert.match(p.sourceFingerprint,/^[a-f0-9]{64}$/);
 assert.equal(withPrescriptionClinicalPlan(raw).clinicalPlan.status,'source-changed');assert.equal(JSON.stringify(raw),before);
 assert.equal(withPrescriptionClinicalPlan({...raw,reviewStatus:'source-imported'}).clinicalPlan,undefined);
 const legacy=forPrescriptionReader(raw,'');assert.equal(legacy.clinicalPlan,undefined);assert.equal(legacy.reviewStatus,'source-imported');
 const html=renderGuide(fixture);assert.match(html,/aria-label="Informacion për skemën"/);assert.doesNotMatch(html,/<details class="rx-source-information" open/);
 for(const ref of p.references){assert.match(ref.url,/^https:\/\//);assert.doesNotMatch(ref.url,/docs\.google\.com|emc\/product\/(?:8840|1578|6254|5220|8374|2798)\/|dailymed\/search/);}
 if(p.status==='reference'){
  assert.equal(sourceDraftText(fixture),'');assert.match(html,/data-rx-source-custom=/);assert.doesNotMatch(html,/Vetëm referencë|Kjo skemë nuk kalohet automatikisht/);
  payload=undefined;beginGuide(fixture,true);assert.equal(payload.sourceText,'');assert.equal(payload.individual,true);continue;
 }
 const choices=clinicalChoiceState(fixture);
 for(const group of p.groups){
  if(!group.condition&&group.options.length>1){assert.equal(sourceDraftText(fixture),'');choices.options[group.id]=group.options[0].id;}
  for(const option of group.options)for(const item of option.items)if(item.kind==='active-substance')for(const key of ['genericName','dose','frequency','duration','route'])assert.ok(item[key],p.key+' '+key);
 }
 if(p.confirmation){assert.equal(sourceDraftText(fixture),'');choices.confirmed=true;}
 assert.ok(sourceDraftText(fixture).startsWith('Rp:'),p.key);
}
c.qa.reset();
const therapy=g=>sourceDraftText(g).split('\nKujdes:')[0];
const choose=(g,id)=>{const s=clinicalChoiceState(g);s.confirmed=true;s.options.g1=id;};
const uti=get('21.7');choose(uti,'o1');assert.match(therapy(uti),/Nitrofurantoin[\s\S]*100 mg[\s\S]*2 herë[\s\S]*7 ditë/);assert.doesNotMatch(therapy(uti),/Amoxicillin|Cefalexin/);choose(uti,'o2');assert.match(therapy(uti),/Cefalexin/);assert.doesNotMatch(therapy(uti),/Nitrofurantoin/);
const candida=get('21.14');choose(candida,'o1');assert.match(therapy(candida),/Clotrimazole[\s\S]*1%[\s\S]*5 g[\s\S]*Intravaginal[\s\S]*7 ditë/);assert.doesNotMatch(therapy(candida),/Fluconazole|Metronidazole|Miconazole/);
const chlam=get('21.15');choose(chlam,'o2');assert.match(therapy(chlam),/Azithromycin[\s\S]*1 g[\s\S]*Dozë e vetme/);assert.doesNotMatch(therapy(chlam),/Doxycycline|Amoxicillin/);
for(const key of ['21.17','21.18']){const g=get(key);assert.equal(sourceDraftText(g),'');clinicalChoiceState(g).confirmed=true;assert.match(therapy(g),/Ceftriaxone[\s\S]*500 mg[\s\S]*Intramuskular[\s\S]*EDHE[\s\S]*Doxycycline[\s\S]*100 mg[\s\S]*14 ditë[\s\S]*EDHE[\s\S]*Metronidazole[\s\S]*500 mg[\s\S]*14 ditë/);assert.doesNotMatch(therapy(g),/Ciprofloxacin|Clindamycin/);}
const bv=get('21.22');choose(bv,'o3');assert.match(therapy(bv),/Clindamycin[\s\S]*2%[\s\S]*5 g[\s\S]*7 ditë/);assert.doesNotMatch(therapy(bv),/Metronidazole/);
const txa=get('21.31');clinicalChoiceState(txa).confirmed=true;assert.match(therapy(txa),/Tranexamic acid[\s\S]*1 g[\s\S]*3 herë[\s\S]*4 ditë/);
for(const key of ['21.39','21.40'])assert.doesNotMatch(therapy(get(key)),/^\d+\. (Ciprofloxacin|Cefixime|Azithromycin|Ethinyl)/m);
for(const key of ['22.20','22.30','22.69','22.71','22.72'])assert.doesNotMatch(therapy(get(key)),/^\d+\. (Loratadine|Desloratadine|Diazepam|Valproate|Phenobarbit)/m);
const note=key=>get(key).clinicalPlan.notes.join(' ');
assert.match(note('22.1'),/0,01–0,03 mg\/kg[\s\S]*0,05–0,1 mg\/kg/);
assert.match(note('22.8'),/mg\/kg\/min[\s\S]*100 mg\/mL/);
assert.match(note('22.31'),/0,5 mg\/mL[\s\S]*1,25 mg[\s\S]*2,5 mg[\s\S]*5 mg/);
assert.match(note('22.39'),/≤10 kg[\s\S]*7,5 mg\/kg[\s\S]*30 mg\/kg/);
assert.match(note('22.43'),/5–<15 kg[\s\S]*15–<25 kg[\s\S]*6 gjithsej/);
assert.match(note('22.45'),/800 mg PËR DOZË/);assert.match(note('22.53'),/3–6 mg\/kg\/DITË HEKUR ELEMENTAR/);
assert.match(note('22.61'),/5 mg\/ditë[\s\S]*14 ditë[\s\S]*10\/20 mg/);
assert.match(note('22.73'),/125 mg\/5 mL =25 mg\/mL/);assert.match(note('22.76'),/ethosuximide është zgjedhja e parë/);
assert.match(note('22.78'),/0,15 mg\/kg PËR DOZË[\s\S]*0,6 mg\/kg\/DITË/);
assert.match(note('22.86'),/0,5–1 mg\/kg PËR DOZË[\s\S]*40 mg/);
assert.match(note('22.89'),/1 mL IM ditët 0, 3, 7, 14[\s\S]*20 IU\/kg/);
assert.match(note('22.90'),/500 IU IM/);assert.match(note('22.91'),/TIG nuk indikohet për plagë të pastër[\s\S]*250 IU IM/);
const scabies=get('22.87');clinicalChoiceState(scabies).confirmed=true;assert.match(therapy(scabies),/Permethrin[\s\S]*5%[\s\S]*8–14 orësh[\s\S]*ditës 7/);
console.log('Chapters 21–22: 131 bound plans; OR/AND, pregnancy branches, confirmation, unit/route limits, source changes, unchanged pending status and empty individual therapy passed.');
