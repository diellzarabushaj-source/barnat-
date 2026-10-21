'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const datasets=['1-5','6-10','11-15','16-22'].map(n=>require('../data/recetat-clinical-revisions-'+n+'.json'));
const {forPrescriptionReader}=require('../lib/prescription-clinical-plan');
const s=fs.readFileSync(require('node:path').join(__dirname,'../recetat-v2.js'),'utf8');
const start=s.lastIndexOf('(() => {',s.indexOf("const API = '/api/medical-hub?_route=prescription-library'")),end=s.indexOf('  if (document.readyState',start);
let payload;const c={window:{MedIndexRecetaWorkspace:{beginSourceGuideDraft(p){payload=p;return {ok:false};}}},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(s.slice(start,end)+'this.qa={clinicalChoiceState,clinicalPlanDraft,renderGuide,beginGuide};})();',c);
const {clinicalChoiceState,clinicalPlanDraft,renderGuide,beginGuide}=c.qa;
const data=datasets[1];
function guide(key){const [id,p]=Object.entries(data.guides).find(([,p])=>p.key===key);return{_id:id,title:'QA '+key,chapterNumber:10,orderInChapter:+key.split('.')[1],reviewStatus:'verified',logicBlocks:[],clinicalPlan:{...p,version:data.version}};}
const mdi=guide('10.2'),state=clinicalChoiceState(mdi);state.confirmed=true;
assert.equal(clinicalPlanDraft(mdi),'');state.doses={basal:'16',breakfast:'5',lunch:'4',dinner:'6'};
const draft=clinicalPlanDraft(mdi);assert.match(draft,/16 NJËSI[\s\S]*EDHE[\s\S]*5 NJËSI · para mëngjesit; 4 NJËSI · para drekës; 6 NJËSI · para darkës/);
assert.doesNotMatch(draft,/Doza: Plotëso|Doza:.*mg/);
for(const value of ['', '0','-1','5,5','NaN','Infinity','1e2','5 mg','61','<script>']){state.doses.breakfast=value;assert.equal(clinicalPlanDraft(mdi),'',value);}
state.doses.breakfast='5';for(const value of ['81','0','16.5']){state.doses.basal=value;assert.equal(clinicalPlanDraft(mdi),'',value);}state.doses.basal='16';
state.confirmed=false;assert.equal(clinicalPlanDraft(mdi),'');state.confirmed=true;assert.ok(clinicalPlanDraft(mdi));
const html=renderGuide(mdi);assert.match(html,/data-rx-clinical-dose="basal"/);assert.match(html,/value="16"/);assert.match(html,/aria-label="Para drekës · NJËSI"/);
const mix=guide('10.3'),m=clinicalChoiceState(mix);m.confirmed=true;m.doses={mixMorning:'14',mixEvening:'10'};assert.match(clinicalPlanDraft(mix),/14 NJËSI[\s\S]*10 NJËSI/);assert.doesNotMatch(clinicalPlanDraft(mix).split('\nKujdes:')[0],/Insulin glargine|Insulin aspart|Insulin regular/);
// Exercise the real API reader implementation with a fingerprint-bound synthetic
// source shell; private original paragraphs are not needed in the repository.
const sourceModule=fs.readFileSync(require('node:path').join(__dirname,'../lib/prescription-clinical-plan.js'),'utf8');
const {sourceFingerprint}=require('../lib/prescription-clinical-plan');
for(const key of ['10.1','10.2','10.3']){
 const g=guide(key),raw={...g};delete raw.clinicalPlan;
 const dataset={guides:{[raw._id]:{...g.clinicalPlan,sourceFingerprint:sourceFingerprint(raw)}}};
 const module={exports:{}},context={module,require(name){return name.startsWith('../data/')?(name.includes('6-10')?dataset:{guides:{}}):require(name);}};
 vm.runInNewContext(sourceModule,context);
 for(const reader of ['', 'clinical-v1','clinical-v2']){const r=module.exports.forPrescriptionReader(raw,reader);assert.equal(r.clinicalPlan,undefined);assert.equal(r.reviewStatus,'source-imported');}
 assert.ok(module.exports.forPrescriptionReader(raw,'clinical-v3').clinicalPlan.doseInputs.length);
}
const t2=guide('10.5'),t=clinicalChoiceState(t2);t.confirmed=true;t.options.g1='o3';assert.match(clinicalPlanDraft(t2),/Sitagliptin[\s\S]*Doza: 50 mg/);assert.doesNotMatch(clinicalPlanDraft(t2).split('\nKujdes:')[0],/Glimepiride|Empagliflozin/);
let count=0;
for(const data of datasets)for(const [id,p]of Object.entries(data.guides))if(p.status==='reference'){
 const g={_id:id,title:'QA individual',reviewStatus:'verified',chapterNumber:+p.key.split('.')[0],orderInChapter:+p.key.split('.')[1],logicBlocks:[],clinicalPlan:{...p,version:data.version}};
 const h=renderGuide(g);assert.match(h,/data-rx-source-custom=/);assert.match(h,/rx-individual-step/);assert.doesNotMatch(h,/Vetëm referencë|Kjo skemë nuk kalohet automatikisht/);assert.equal(clinicalPlanDraft(g),'');
 payload=undefined;beginGuide(g,true);assert.equal(payload.sourceText,'');assert.equal(payload.individual,true);count++;
}
payload=undefined;beginGuide(mdi,true);assert.equal(payload,undefined,'manual action cannot bypass the structured dose gate');
const clarified=datasets[3];
assert.equal(clarified.coverage.length,58);
assert.equal(Object.keys(clarified.guides).length,58);
for(const [id,p]of Object.entries(clarified.guides)){
 assert.equal(p.status,'reference');assert.equal(p.groups.length,0);assert.ok(p.notes.length);
 assert.match(p.sourceFingerprint,/^[a-f0-9]{64}$/);
 assert.equal(forPrescriptionReader({_id:id,chapterNumber:22,orderInChapter:1,title:'changed QA',logicBlocks:[],reviewStatus:'verified'},'clinical-v3').clinicalPlan.status,'source-changed');
 assert.equal(forPrescriptionReader({_id:id,reviewStatus:'source-imported'},'clinical-v3').clinicalPlan,undefined);
 for(const ref of p.references){assert.equal(new URL(ref.url).protocol,'https:');assert.doesNotMatch(ref.url,/docs\.google\.com/);}
}
const note=key=>Object.values(clarified.guides).find(p=>p.key===key).notes.join(' ');
assert.match(note('16.40'),/100 IU\/kg = 1 mg\/kg/);
assert.match(note('17.13'),/nuk injektohet IM/);
assert.match(note('18.15'),/10 mg\/mL = 1%/);
assert.match(note('21.17'),/ceftriaxone 500 mg IM[\s\S]*EDHE doxycycline 100 mg[\s\S]*14 ditë EDHE metronidazole 500 mg/);
assert.match(note('22.24'),/20 mg\/kg\/DITË/);
assert.match(note('22.73'),/125 mg\/5 mL = 25 mg\/mL/);
assert.match(note('22.90'),/500 IU IM/);
console.log('Patient-specific insulin: distinct meal doses, deletion, limits, unit steps, invalid text, confirmation, premix separation and legacy readers passed; '+count+' individualized plans open empty therapy only.');
