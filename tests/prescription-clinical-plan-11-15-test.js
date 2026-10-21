'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {sourceFingerprint,withPrescriptionClinicalPlan,forPrescriptionReader}=require('../lib/prescription-clinical-plan');
const revisions=require('../data/recetat-clinical-revisions-11-15.json');
const fixtures=require('./fixtures/prescription-clinical-plan-11-15');
const {prescriptionSearchDocument}=require('../api/medical-hub')._test;
const source=fs.readFileSync(require('node:path').join(__dirname,'../recetat-v2.js'),'utf8');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end=source.indexOf('  if (document.readyState',start);
const ctx={window:{},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.qa={clinicalChoiceState,sourceDraftText,renderGuide,reset(){state.clinicalChoices=Object.create(null);}};})();',ctx);
const {clinicalChoiceState,sourceDraftText,renderGuide}=ctx.qa;
const get=key=>structuredClone(fixtures.find(g=>g.chapterNumber+'.'+g.orderInChapter===key));
const choose=(g,n,o)=>clinicalChoiceState(g).options['g'+n]='o'+o;
const confirm=g=>clinicalChoiceState(g).confirmed=true;
assert.equal(fixtures.length,117);assert.equal(revisions.coverage.length,117);
assert.equal(Object.keys(revisions.guides).length,117);
assert.equal(Object.values(revisions.guides).filter(r=>r.status==='ready').length,40);
assert.equal(Object.values(revisions.guides).filter(r=>r.status==='reference').length,77);
for(const raw of fixtures){
 const g=raw,p=g.clinicalPlan;const {clinicalPlan,...sourceGuide}=raw;const before=JSON.stringify(sourceGuide);
 assert.ok(p,raw._id);assert.equal(revisions.coverage.find(c=>c.id===raw._id).sourceFingerprint,p.sourceFingerprint);
 // This synthetic source deliberately differs: a stale or changed real source must fail closed.
 assert.notEqual(sourceFingerprint(sourceGuide),p.sourceFingerprint);
 assert.equal(withPrescriptionClinicalPlan(sourceGuide).clinicalPlan.status,'source-changed');
 assert.equal(JSON.stringify(sourceGuide),before);assert.equal(p.reviewState,'evidence-reconciled');
 assert.ok(p.references.length);for(const ref of p.references)assert.match(ref.url,/^https:\/\//);
 const html=renderGuide(g);assert.match(html,/<summary aria-label="Informacion për skemën"[^>]*>\?<\/summary>/);
 assert.doesNotMatch(html,/<details class="rx-source-information" open/);
 const old=forPrescriptionReader(sourceGuide,'');assert.equal(old.clinicalPlan,undefined);assert.equal(old.reviewStatus,'source-imported');
 assert.equal(forPrescriptionReader(sourceGuide,'clinical-v2').clinicalPlan.status,'source-changed');
 const changed=structuredClone(sourceGuide);changed.title+=' EDIT';assert.equal(withPrescriptionClinicalPlan(changed).clinicalPlan.status,'source-changed');
 const unverified={...sourceGuide,reviewStatus:'source-imported'};assert.equal(withPrescriptionClinicalPlan(unverified),unverified);
 if(p.status==='reference'){assert.equal(sourceDraftText(g),'');assert.match(html,/data-rx-source-custom=/);assert.doesNotMatch(html,/Vetëm referencë|Kjo skemë nuk kalohet automatikisht/);continue;}
 for(const gr of p.groups){assert.ok(gr.id&&gr.options.length);for(const op of gr.options)for(const it of op.items)if(it.kind==='active-substance')for(const f of ['genericName','dose','frequency','duration','route'])assert.ok(it[f],p.key+' '+f);if(!gr.condition&&gr.options.length>1)clinicalChoiceState(g).options[gr.id]=gr.options[0].id;}
 if(p.confirmation){assert.equal(sourceDraftText(g),'');confirm(g);}
 assert.ok(sourceDraftText(g).startsWith('Rp:'),p.key);
}
ctx.qa.reset();
const activeDraft=g=>sourceDraftText(g).split('\nKujdes:')[0];
const uti=get('11.1');choose(uti,1,1);assert.equal(sourceDraftText(uti),'');confirm(uti);
assert.match(sourceDraftText(uti),/Nitrofurantoin[\s\S]*100 mg[\s\S]*5 ditë/);assert.doesNotMatch(activeDraft(uti),/Fosfomycin|Cranberry|Sodium acid citrate|Diclofenac/);
choose(uti,1,2);assert.match(sourceDraftText(uti),/Fosfomycin trometamol[\s\S]*3 g/);assert.doesNotMatch(activeDraft(uti),/Nitrofurantoin/);
const bph=get('11.7');choose(bph,1,1);assert.doesNotMatch(activeDraft(bph),/Tamsulosin/);choose(bph,1,2);
assert.equal((sourceDraftText(bph).match(/^\d+\. Dutasteride$/gm)||[]).length,1);assert.match(sourceDraftText(bph),/Dutasteride[\s\S]*EDHE[\s\S]*Tamsulosin/);
const folate=get('12.4');assert.equal(sourceDraftText(folate),'');confirm(folate);assert.match(sourceDraftText(folate),/5 mg[\s\S]*4 muaj/);
const bone=get('13.3');assert.match(sourceDraftText(bone),/150 mg[\s\S]*MUAJ/);assert.doesNotMatch(activeDraft(bone),/Një herë në JAVË/);
const arthritis=get('13.5');assert.doesNotMatch(activeDraft(arthritis),/Meloxicam|Naproxen/);clinicalChoiceState(arthritis).groups.g2=true;assert.equal(sourceDraftText(arthritis),'');choose(arthritis,2,1);assert.match(sourceDraftText(arthritis),/1 herë në ditë[\s\S]*15 mg\/DITË/);assert.doesNotMatch(activeDraft(arthritis),/Piroxicam/);
const mtx=get('13.11');assert.equal(sourceDraftText(mtx),'');confirm(mtx);assert.match(sourceDraftText(mtx),/Methotrexate[\s\S]*JAVË[\s\S]*EDHE[\s\S]*Folic acid[\s\S]*ditë tjetër/);assert.doesNotMatch(activeDraft(mtx),/Prednisolone|Diclofenac|Pantoprazole/);
const gout=get('13.13');choose(gout,2,1);confirm(gout);let text=sourceDraftText(gout);
assert.match(text,/0,5 mg pas 1 ore[\s\S]*12 orë[\s\S]*6 mg[\s\S]*72 orëve/);assert.doesNotMatch(activeDraft(gout),/çdo 2–3 orë|Prednisolone|Naproxen/);
choose(gout,2,2);assert.match(sourceDraftText(gout),/Prednisolone[\s\S]*3–5 ditë/);assert.doesNotMatch(activeDraft(gout),/Colchicine/);
const migraine=get('14.1');choose(migraine,1,1);assert.match(sourceDraftText(migraine),/Sumatriptan[\s\S]*EDHE[\s\S]*Naproxen/);choose(migraine,1,3);assert.match(sourceDraftText(migraine),/Intranazalisht[\s\S]*2 orëve/);assert.doesNotMatch(activeDraft(migraine),/Sumatriptan|Ketorolac/);
const cluster=get('14.7');assert.doesNotMatch(activeDraft(cluster),/Sumatriptan/);clinicalChoiceState(cluster).groups.g2=true;assert.match(sourceDraftText(cluster),/Oksigjen[\s\S]*EDHE[\s\S]*Sumatriptan[\s\S]*Nënlëkurë/);assert.doesNotMatch(activeDraft(cluster),/Lidocaine/);
const gbs=get('14.29');choose(gbs,1,1);assert.equal(sourceDraftText(gbs),'');confirm(gbs);assert.match(sourceDraftText(gbs),/0,4 g\/kg\/ditë[\s\S]*5 ditë/);assert.doesNotMatch(activeDraft(gbs),/Hydrocortisone|Ceftriaxone|Enoxaparin/);
clinicalChoiceState(gbs).groups.g3=true;assert.match(sourceDraftText(gbs),/40 mg = 4000 IU/);assert.doesNotMatch(activeDraft(gbs),/1,5 mg\/kg/);
const ms=get('14.30');choose(ms,1,1);confirm(ms);assert.match(sourceDraftText(ms),/500 mg[\s\S]*Nga goja[\s\S]*5 ditë/);assert.doesNotMatch(activeDraft(ms),/1000 mg|Prednisolone/);choose(ms,1,2);assert.match(sourceDraftText(ms),/1000 mg[\s\S]*IV[\s\S]*3–5 ditë/);
const panic=get('15.4');assert.match(sourceDraftText(panic),/Mos përdor qese letre/);assert.doesNotMatch(activeDraft(panic),/Alprazolam|Bromazepam/);
const mdd=get('15.9');choose(mdd,1,2);assert.equal(sourceDraftText(mdd),'');confirm(mdd);text=sourceDraftText(mdd);assert.match(text,/Sertraline[\s\S]*50 mg[\s\S]*6 muaj/);assert.doesNotMatch(text,/Escitalopram|Fluoxetine|Clonazepam/);
choose(mdd,1,6);assert.match(sourceDraftText(mdd),/mbi 150 mg\/ditë ndahet në 2–3 marrje/);
for(const key of ['13.12','13.22','14.35','15.2','15.13','15.18','15.20','15.22'])assert.equal(sourceDraftText(get(key)),'',key);
assert.match(prescriptionSearchDocument(bone).item.title,/Ibandronate mujore/);
assert.match(prescriptionSearchDocument(mtx).substances,/methotrexate.*folic/);
console.log('Chapters 11–15: 117 recorded coverage fingerprints, source-change and editorial-status gates, 40 structured plans, 77 individual references, complete AND/OR regimens, dose phases, routes and confirmations passed.');
