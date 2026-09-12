'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox={window:{addEventListener(){}}};
const load=f=>new Function('window',read(f))(sandbox.window); // eslint-disable-line no-new-func
[
  'antibiotiket-data.js',
  'antibiotiket-formulations-data.js',
  'antibiotiket-solids-data.js',
  'antibiotiket-hospital-data.js',
  'antibiotiket-parenteral-prep-data.js',
  'antibiotiket-clinical-completeness-v2.js',
].forEach(load);
new Function('window','document','MutationObserver',read('antibiotiket-clinical-hardening.js'))(sandbox.window,undefined,undefined); // eslint-disable-line no-new-func

const guide=sandbox.window.DRX_ANTIBIOTIC_GUIDE;
const liquids=sandbox.window.DRX_ANTIBIOTIC_FORMULATIONS;
const solids=sandbox.window.DRX_ANTIBIOTIC_SOLIDS;
const hospital=sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
const id=id=>guide.indications.find(x=>x.id===id);

assert.equal(guide.indications.length,12);
assert.deepEqual(new Set(guide.indications.map(x=>x.id)),new Set(['aom','gas','pneumonia','sinusitis','uti-cystitis','uti-pyelo','impetigo','cellulitis','abscess','preseptal','bite','lymphadenitis']));

for(const indication of guide.indications){
  assert.ok(indication.options.length>0,`${indication.id}: must have at least one action/regimen`);
  for(const option of indication.options){
    assert.ok(option.source,`${indication.id}/${option.id}: source missing`);
    assert.ok(option.duration?.type,`${indication.id}/${option.id}: duration missing`);
  }
}

// No severe delayed allergy branch may expose a beta-lactam.
const beta=/(amoxicillin|penicillin|cephalexin|cefdinir|cefpodoxime|cefixime|cefuroxime|cefadroxil|ceftriaxone|cefazolin|ampicillin)/i;
for(const indication of guide.indications){
  for(const option of indication.options){
    if((option.allergy||[]).includes('a3')) assert.doesNotMatch(option.drug,beta,`${indication.id}/${option.id}: beta-lactam leaked into A3`);
  }
}

// Combination-dose bases must remain explicit.
for(const indication of guide.indications){
  for(const option of indication.options){
    if(/Amoxicillin \/ clavulanate/i.test(option.drug)) assert.equal(option.dose.component,'amoxicillin');
    if(/Trimethoprim \/ sulfamethoxazole/i.test(option.drug)) assert.equal(option.dose.component,'trimethoprim');
    if(option.dose?.type==='combo'){
      for(const part of option.dose.parts){
        if(/Trimethoprim/i.test(part.drug)) assert.equal(part.dose.component,'trimethoprim');
      }
    }
  }
}

// Product-sensitive drugs may not use free custom concentration.
for(const drug of ['Amoxicillin / clavulanate','Trimethoprim / sulfamethoxazole','Ciprofloxacin','Levofloxacin']){
  assert.equal(liquids.drugs[drug]?.customAllowed,false,`${drug}: custom strength must be blocked`);
}

// The newly-added exact formulations must exist.
assert.deepEqual(liquids.drugs.Cefadroxil.forms.map(x=>x.mgPer5mL).sort((a,b)=>a-b),[250,500]);
assert.ok(solids.drugs.Cefuroxime.forms.some(x=>x.componentMg===250));
assert.ok(solids.drugs.Cefuroxime.forms.some(x=>x.componentMg===500));
assert.ok(solids.drugs.Cefadroxil.forms.some(x=>x.componentMg===500));

// Hospital linked IDs must resolve and preparation IDs must resolve.
const prepIds=new Set(sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP.preparations.map(x=>x.id));
const regimenIds=new Set(hospital.regimens.map(x=>x.id));
for(const [indication,ids] of Object.entries(hospital.linkedByIndication)){
  for(const regimenId of ids) assert.ok(regimenIds.has(regimenId),`${indication}: missing ${regimenId}`);
}
for(const regimen of hospital.regimens){
  for(const prepId of regimen.prepIds||[]) assert.ok(prepIds.has(prepId),`${regimen.id}: missing preparation ${prepId}`);
}

// No duplicate IDs anywhere in the clinical engines.
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,`${label}: duplicate ID detected`);
unique(guide.indications.flatMap(x=>x.options.map(o=>o.id)),'outpatient regimen');
unique(hospital.regimens.map(x=>x.id),'hospital regimen');
unique(sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP.preparations.map(x=>x.id),'prep');

// Hard safety contracts in the runtime.
const hard=read('antibiotiket-clinical-hardening.js');
assert.match(hard,/reconcileAgeFromWeight/);
assert.match(hard,/Funksioni renal para dozës IV\/IM/);
assert.match(hard,/STOP — alergjia ndaj cefalosporinës duhet specifikuar/);
assert.match(hard,/STOP — dyshim për sinusit të komplikuar/);
assert.match(hard,/restrictedCustomDrugs/);
assert.match(read('antibiotiket-shell.js'),/modalitet i degraduar/);

console.log('Antibiotics clinical hardening contract audit passed.');