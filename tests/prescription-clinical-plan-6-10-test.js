'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {sourceFingerprint,withPrescriptionClinicalPlan,forPrescriptionReader}=require('../lib/prescription-clinical-plan');
const revisions=require('../data/recetat-clinical-revisions-6-10.json');
const fixtures=require('./fixtures/prescription-clinical-source-6-10.json');
const {prescriptionSearchDocument}=require('../api/medical-hub')._test;
const source=fs.readFileSync(require('node:path').join(__dirname,'../recetat-v2.js'),'utf8');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end=source.indexOf('  if (document.readyState',start);
const context={window:{},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.qa={state,clinicalChoiceState,sourceDraftText,renderGuide,sourceClinicalIssues};})();',context);
const {clinicalChoiceState,sourceDraftText,renderGuide,sourceClinicalIssues}=context.qa;
function guide(key){
 const [id,p]=Object.entries(revisions.guides).find(([,p])=>p.key===key);
 return {_id:id,title:'QA '+key,chapterNumber:Number(key.split('.')[0]),orderInChapter:Number(key.split('.')[1]),reviewStatus:'verified',logicBlocks:[],clinicalPlan:{...structuredClone(p),version:revisions.version}};
}
const choose=(g,n,o)=>clinicalChoiceState(g).options['g'+n]='o'+o;
assert.equal(revisions.coverage.length,136);
assert.equal(Object.keys(revisions.guides).length,115);
assert.equal(new Set(revisions.coverage.map(x=>x.id)).size,136);
assert.equal(Object.values(revisions.guides).filter(x=>x.status==='ready').length,56);
assert.equal(Object.values(revisions.guides).filter(x=>x.status==='reference').length,59);
for(const p of Object.values(revisions.guides)){
 assert.match(p.sourceFingerprint,/^[a-f0-9]{64}$/);assert.ok(p.references.length);
 assert.equal(p.reviewState,'evidence-reconciled');
 for(const g of p.groups)for(const o of g.options)for(const i of o.items){
  if(i.kind==='active-substance'&&p.status==='ready')for(const f of ['genericName','dose','route','frequency','duration'])assert.ok(i[f],p.key+' '+f);
 }
 if(p.status!=='ready')assert.equal(sourceDraftText(guide(p.key)),'',p.key+' reference is not a prescription');
}
for(const raw of fixtures){
 const before=JSON.stringify(raw);const g=withPrescriptionClinicalPlan(raw);
 assert.notEqual(g,raw);assert.equal(g.clinicalPlan.status,revisions.guides[raw._id].status);
 assert.equal(g.logicBlocks,raw.logicBlocks);
 assert.equal(sourceFingerprint(raw),g.clinicalPlan.sourceFingerprint);
 assert.equal(JSON.stringify(raw),before);
 assert.equal(forPrescriptionReader(raw,'clinical-v3').reviewStatus,raw.reviewStatus);
 if(g.clinicalPlan.doseInputs?.length){assert.equal(forPrescriptionReader(raw,'clinical-v2').clinicalPlan,undefined);}
 const legacy=forPrescriptionReader(raw,'');
 assert.equal(legacy.reviewStatus,'source-imported');assert.equal(legacy.clinicalPlan,undefined);
 if(g.clinicalPlan.confirmation){
  const v33=forPrescriptionReader(raw,'clinical-v1');
  assert.equal(v33.reviewStatus,'source-imported');assert.equal(v33.clinicalPlan,undefined,'v33 must not bypass a new confirmation');
 }
 const changed=structuredClone(raw);changed.logicBlocks[0].items[0].sig+=' EDIT';
 assert.equal(withPrescriptionClinicalPlan(changed).clinicalPlan.status,'source-changed');
}
const cap=guide('6.5');assert.equal(sourceDraftText(cap),'');
choose(cap,1,1);let draft=sourceDraftText(cap);
assert.match(draft,/Amoxicillin \+ Clavulanic acid[\s\S]*875 mg \+ 125 mg[\s\S]*EDHE[\s\S]*Doxycycline/);
assert.doesNotMatch(draft,/Levofloxacin|Azithromycin|Cefuroxime/);
choose(cap,1,10);draft=sourceDraftText(cap);assert.match(draft,/Levofloxacin[\s\S]*750 mg/);assert.doesNotMatch(draft,/Doxycycline|Clavulanic/);
const low=guide('6.3');choose(low,1,2);assert.match(sourceDraftText(low),/200 mg ditën 1; pastaj 100 mg/);assert.doesNotMatch(sourceDraftText(low),/200 mg[\s\S]*2 herë në ditë/);
const inpatient=guide('6.6');choose(inpatient,1,1);assert.doesNotMatch(sourceDraftText(inpatient),/Enoxaparin|Fondaparinux/);
clinicalChoiceState(inpatient).groups.g2=true;assert.equal(sourceDraftText(inpatient),'');
choose(inpatient,2,1);draft=sourceDraftText(inpatient);assert.match(draft,/40 mg = 4000 IU/);assert.doesNotMatch(draft,/1,5 mg\/kg|5–10 mg/);
const hf=guide('7.12');choose(hf,1,1);choose(hf,2,1);choose(hf,4,1);
assert.doesNotMatch(sourceDraftText(hf),/Ivabradine|Enalapril|Candesartan/);
clinicalChoiceState(hf).groups.g5=true;assert.match(sourceDraftText(hf),/Ivabradine[\s\S]*2 herë në ditë/);
const hp=guide('8.10');choose(hp,1,1);draft=sourceDraftText(hp);
for(const drug of ['Omeprazole','Bismuth subsalicylate','Tetracycline','Metronidazole'])assert.match(draft,new RegExp(drug));
assert.equal((draft.match(/\nEDHE\n/g)||[]).length,3);
const fulminant=guide('8.20');assert.equal(sourceDraftText(fulminant),'');
clinicalChoiceState(fulminant).confirmed=true;draft=sourceDraftText(fulminant);
assert.match(draft,/Vancomycin[\s\S]*500 mg[\s\S]*Nga goja ose tub nazogastrik[\s\S]*EDHE[\s\S]*Metronidazole[\s\S]*IV/);
assert.doesNotMatch(draft,/klizmë mbajtëse/);
clinicalChoiceState(fulminant).groups.g3=true;assert.match(sourceDraftText(fulminant),/Rektalisht, klizmë mbajtëse/);
clinicalChoiceState(fulminant).confirmed=false;assert.equal(sourceDraftText(fulminant),'');
const hcv=guide('9.6');choose(hcv,1,1);assert.equal(sourceDraftText(hcv),'');clinicalChoiceState(hcv).confirmed=true;
assert.match(sourceDraftText(hcv),/300 mg \+ 120 mg = 3 tableta nga 100\/40 mg/);assert.doesNotMatch(sourceDraftText(hcv),/Sofosbuvir/);
assert.match(prescriptionSearchDocument(hcv).substances,/glecaprevir.*pibrentasvir/);
const hav=guide('9.1');choose(hav,1,2);assert.match(sourceDraftText(hav),/Vaksinë[\s\S]*EDHE[\s\S]*0,1 mL\/kg/);
choose(hav,1,3);assert.doesNotMatch(sourceDraftText(hav),/Vaksinë monovalente/);
for(const key of ['10.23','10.25']){
 const g=guide(key);choose(g,1,1);if(key==='10.25')choose(g,3,1);
 assert.equal(sourceDraftText(g),'');clinicalChoiceState(g).confirmed=true;draft=sourceDraftText(g);
 assert.match(draft,/NJËSI\/kg\/orë/);assert.doesNotMatch(draft,/0\.1 mg\/kg|0\.14 mg\/kg|microdrops|K⁺ <3\.3/);
 const html=renderGuide(g);assert.match(html,/data-rx-clinical-confirmation="true"/);
 assert.match(html,/<summary aria-label="Informacion për skemën"[^>]*>\?<\/summary>/);
 assert.doesNotMatch(html,/<details class="rx-source-information" open/);
}
const dka=guide('10.23');choose(dka,1,1);clinicalChoiceState(dka).confirmed=true;assert.match(sourceDraftText(dka),/0,1 NJËSI\/kg\/orë/);
const hhs=guide('10.25');choose(hhs,1,2);choose(hhs,3,1);clinicalChoiceState(hhs).confirmed=true;assert.match(sourceDraftText(hhs),/0,05 NJËSI\/kg\/orë/);
choose(hhs,3,2);assert.match(sourceDraftText(hhs),/0,1 NJËSI\/kg\/orë/);assert.doesNotMatch(sourceDraftText(hhs),/0,05 NJËSI\/kg\/orë/);
const cort=guide('10.32');clinicalChoiceState(cort).confirmed=true;assert.match(sourceDraftText(cort),/15–25 mg\/ditë GJITHSEJ/);assert.doesNotMatch(sourceDraftText(cort),/mg\/kg/);
console.log('Chapters 6–10: 136-source ledger, 115 corrections, source integrity, complete regimens, renal limits, routes, confirmations, legacy gating and dose units passed.');
