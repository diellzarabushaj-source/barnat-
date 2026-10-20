'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {sourceFingerprint,withPrescriptionClinicalPlan,forPrescriptionReader} = require('../lib/prescription-clinical-plan.js');
const revisions = require('../data/recetat-clinical-revisions-1-5.json');
const {prescriptionSearchDocument} = require('../api/medical-hub.js')._test;
const source = fs.readFileSync(path.join(__dirname,'../recetat-v2.js'),'utf8');
const start=source.lastIndexOf('(() => {',source.indexOf("const API = '/api/medical-hub?_route=prescription-library'"));
const end=source.indexOf('  if (document.readyState',start);
const context={window:{},document:{querySelector(){return null;}},URL,console,setTimeout,clearTimeout};
vm.runInNewContext(source.slice(start,end)+'this.qa={state,renderGuide,clinicalChoiceState,sourceDraftText,sourceClinicalIssues};})();',context);
const {renderGuide,clinicalChoiceState,sourceDraftText,sourceClinicalIssues}=context.qa;
function guide(key){const [id,plan]=Object.entries(revisions.guides).find(([,p])=>p.key===key);return {_id:id,title:'QA',chapterNumber:Number(key.split('.')[0]),reviewStatus:'verified',logicBlocks:[],clinicalPlan:{...structuredClone(plan),version:revisions.version,checkedAt:revisions.checkedAt}};}
function choose(doc,group,option){clinicalChoiceState(doc).options[`g${group}`]=`o${option}`;}
assert.equal(Object.keys(revisions.guides).length,40);
assert.equal(Object.values(revisions.guides).filter(p=>p.status==='reference').length,3);
for (const plan of Object.values(revisions.guides)) {
  assert.match(plan.sourceFingerprint,/^[a-f0-9]{64}$/);
  assert.equal(plan.reviewState,'evidence-reconciled');
  assert.ok(plan.references.length>0,plan.key+' references');
  for(const group of plan.groups){assert.ok(group.options.length);for(const option of group.options){assert.ok(option.items.length);for(const item of option.items){
    if(item.kind==='active-substance' && plan.status==='ready')for(const field of ['genericName','dose','route','frequency','duration'])assert.ok(item[field],`${plan.key}: ${item.title} ${field}`);
  }}}
}
const gono=guide('5.45');
assert.equal(sourceDraftText(gono),'','No default antibiotic choice');
choose(gono,1,2);
let draft=sourceDraftText(gono);
assert.match(draft,/Gentamicin[\s\S]*240 mg[\s\S]*EDHE[\s\S]*Azithromycin[\s\S]*2 g/);
assert.doesNotMatch(draft,/Ceftriaxone|Doxycycline/);
choose(gono,1,1);
draft=sourceDraftText(gono);
assert.match(draft,/Ceftriaxone/);assert.doesNotMatch(draft,/Doxycycline|Gentamicin|Azithromycin/);
clinicalChoiceState(gono).items['g1:o1:i2']=true;
assert.match(sourceDraftText(gono),/Chlamydia nuk është përjashtuar[\s\S]*Doxycycline/);
const neuro=guide('5.50');choose(neuro,1,1);
assert.match(sourceDraftText(neuro),/18–24 milion njësi GJITHSEJ në 24 orë/);
choose(neuro,1,2);
assert.match(sourceDraftText(neuro),/Procaine penicillin G[\s\S]*EDHE[\s\S]*Probenecid/);
assert.doesNotMatch(sourceDraftText(neuro),/Aqueous|Ceftriaxone/);
const malaria=guide('5.8');choose(malaria,1,2);choose(malaria,2,2);
assert.equal(sourceDraftText(malaria),'','Tafenoquine cannot combine with hydroxychloroquine');
choose(malaria,1,1);assert.match(sourceDraftText(malaria),/Tafenoquine/);
choose(malaria,2,1);assert.match(sourceDraftText(malaria),/30 mg BAZË[\s\S]*14 ditë/);
const sepsis=guide('5.2');
assert.doesNotMatch(sourceDraftText(sepsis),/Noradrenaline|Dobutamine/);
clinicalChoiceState(sepsis).groups.g2=true;
assert.match(sourceDraftText(sepsis),/Noradrenaline/);assert.doesNotMatch(sourceDraftText(sepsis),/Dobutamine/);
clinicalChoiceState(sepsis).groups.g3=true;assert.match(sourceDraftText(sepsis),/Dobutamine/);
for(const key of ['5.1','5.7','5.56']){assert.equal(sourceDraftText(guide(key)),'');assert.equal(sourceClinicalIssues(guide(key)).length,1);}
const ff=guide('3.4');assert.match(sourceDraftText(ff),/10–15 mL\/kg/);assert.doesNotMatch(sourceDraftText(ff),/1.0 g\/dL/);
const sch=guide('5.18');choose(sch,1,1);assert.match(sourceDraftText(sch),/40 mg\/kg\/ditë[\s\S]*2 doza/);choose(sch,1,2);assert.match(sourceDraftText(sch),/60 mg\/kg\/ditë[\s\S]*3 doza/);
const search=prescriptionSearchDocument(guide('5.57'));assert.match(search.substances,/baricitinib/);assert.equal(search.item.facets.medication,true);
const html=renderGuide(gono);assert.match(html,/<summary aria-label="Informacion për skemën"[^>]*>\?<\/summary>/);assert.doesNotMatch(html,/<details class="rx-source-information" open/);assert.match(html,/Doza<\/dt>/);assert.match(html,/Kohëzgjatja<\/dt>/);assert.doesNotMatch(html,/E verifikuar/);
const original={_id:'stable',title:'Original',reviewStatus:'verified',logicBlocks:[{relation:'start',items:[{title:'Original drug',sig:'Original dose'}]}]};
assert.equal(withPrescriptionClinicalPlan(original),original);
assert.equal(sourceFingerprint(original),sourceFingerprint({...original,_rev:'changed',logicBlocks:[{items:[{sig:'Original dose',title:'Original drug'}],relation:'start'}]}),'Object key ordering and metadata are irrelevant');
assert.notEqual(sourceFingerprint(original),sourceFingerprint({...original,title:'Changed'}));
const stale={_id:gono._id,title:'Changed after audit',reviewStatus:'verified',logicBlocks:[]};
const guarded=withPrescriptionClinicalPlan(stale);assert.equal(guarded.clinicalPlan.status,'source-changed');assert.equal(sourceDraftText(guarded),'');assert.deepEqual(stale.logicBlocks,[]);
assert.equal(withPrescriptionClinicalPlan({...stale,reviewStatus:'source-imported'}).clinicalPlan,undefined);
for(const snapshot of require('./fixtures/prescription-clinical-source.json')){
  const before=JSON.stringify(snapshot);
  const enriched=withPrescriptionClinicalPlan(snapshot);
  assert.equal(enriched.clinicalPlan.status,'ready','Real source matches the audited fingerprint');
  assert.equal(enriched.logicBlocks,snapshot.logicBlocks,'Original source object is preserved');
  const legacy=forPrescriptionReader(snapshot,'');
  assert.equal(legacy.reviewStatus,'source-imported','Cached v32 cannot copy a nested clinical regimen using its flat draft algorithm');
  assert.equal(legacy.authoringReviewStatus,snapshot.reviewStatus,'Authoring status remains unchanged');
  assert.equal(forPrescriptionReader(snapshot,'clinical-v1').reviewStatus,snapshot.reviewStatus,'Current reader retains original authoring status');
  assert.equal(JSON.stringify(snapshot),before,'Input is never mutated');
  const projection=JSON.parse(JSON.stringify(snapshot));
  projection.logicBlocks.forEach(block=>{delete block._key;block.items.forEach(item=>{delete item._key;delete item.sourceNumber;});});
  assert.equal(withPrescriptionClinicalPlan(projection).clinicalPlan.status,'ready','API search projection matches');
  projection.logicBlocks[0].items[0].sig+=' changed';
  assert.equal(withPrescriptionClinicalPlan(projection).clinicalPlan.status,'source-changed','A later source edit invalidates a previous plan');
}
console.log('Clinical revisions: 40 plans, source integrity, dose fields, AND/OR selection, conditional items, incompatible regimens, reference gating and search passed.');
