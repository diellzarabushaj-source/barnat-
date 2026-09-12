'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

const sandbox={window:{addEventListener(){}}};
const load=f=>new Function('window',read(f))(sandbox.window); // eslint-disable-line no-new-func
['antibiotiket-data.js','antibiotiket-formulations-data.js','antibiotiket-solids-data.js','antibiotiket-hospital-data.js','antibiotiket-parenteral-prep-data.js','antibiotiket-clinical-completeness-v2.js'].forEach(load);
new Function('window','document','MutationObserver',read('antibiotiket-clinical-hardening.js'))(sandbox.window,undefined,undefined); // eslint-disable-line no-new-func
const guide=sandbox.window.DRX_ANTIBIOTIC_GUIDE;
const liquids=sandbox.window.DRX_ANTIBIOTIC_FORMULATIONS;
const dx=id=>guide.indications.find(x=>x.id===id);

// CDC GAS 2025 current values.
const gas=dx('gas');
const cefadroxil=gas.options.find(x=>x.id==='cefadroxil-gas');
assert.equal(cefadroxil.source,'cdc-gas');
assert.equal(cefadroxil.dose.value,30);
assert.equal(cefadroxil.dose.maxDose,1000);
assert.equal(cefadroxil.frequency,'1 herë/ditë');
assert.equal(cefadroxil.duration.text,'10 ditë');
assert.deepEqual(cefadroxil.allergy,['a1']);

// CPS 2026 UTI source pins.
const cystitis=dx('uti-cystitis');
const pyelo=dx('uti-pyelo');
assert.equal(cystitis.source,'cps-uti-2026');
assert.equal(pyelo.source,'cps-uti-2026');
assert.equal(cystitis.minAgeMonths,1);
assert.equal(pyelo.minAgeMonths,1);
assert.equal(cystitis.options.find(x=>x.id==='nitro-cystitis').duration.text,'5 ditë');
assert.deepEqual(liquids.indicationOverrides['uti-cystitis|Amoxicillin / clavulanate'].allow,['amoxclav-400-57-5']);
assert.match(liquids.indicationOverrides['uti-cystitis|Amoxicillin / clavulanate'].note,/7:1/);

// Children’s Mercy current CAP values.
const pneumonia=dx('pneumonia');
const clinda=pneumonia.options.find(x=>x.id==='clinda-pna');
assert.deepEqual([clinda.dose.min,clinda.dose.max,clinda.dose.maxDose],[10,13,600]);
assert.equal(clinda.frequency,'3 herë/ditë');
assert.ok(pneumonia.options.some(x=>x.id==='cefuroxime-pna' && x.dose.text==='250–500 mg/dozë'));
assert.ok(!pneumonia.options.some(x=>/cefdinir/i.test(x.drug)));

// Children’s Mercy current ABRS values.
const sinus=dx('sinusitis');
assert.equal(sinus.minAgeMonths,12);
assert.ok(sinus.options.some(x=>x.id==='cefuroxime-sinusitis' && x.dose.text==='250 mg/dozë'));
const combo=sinus.options.find(x=>x.id==='cefixime-clinda-sinusitis');
assert.ok(combo && combo.dose.type==='combo');
assert.deepEqual(combo.dose.parts.map(x=>[x.drug,x.dose.value,x.dose.maxDose]),[
  ['Cefixime',4,200],
  ['Clindamycin',10,600],
]);
const levo=sinus.options.find(x=>x.id==='levo-sinusitis');
assert.match(levo.dose.text,/10 mg\/kg\/dozë/);
assert.match(levo.dose.text,/500 mg\/ditë/);

// Product labels: exact formulation strength records only.
assert.deepEqual(liquids.drugs.Cefadroxil.forms.map(x=>x.mgPer5mL).sort((a,b)=>a-b),[250,500]);
assert.deepEqual(liquids.drugs['Amoxicillin / clavulanate'].forms.find(x=>x.id==='amoxclav-400-57-5').composition,'400 mg amoxicillin + 57 mg clavulanate / 5 mL');

console.log('Antibiotics audited clinical source pins passed.');