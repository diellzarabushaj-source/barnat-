'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox = { window:{ addEventListener(){} } };
const load = f => { new Function('window', read(f))(sandbox.window); }; // eslint-disable-line no-new-func
load('antibiotiket-data.js');
load('antibiotiket-formulations-data.js');
load('antibiotiket-solids-data.js');
load('antibiotiket-hospital-data.js');
load('antibiotiket-parenteral-prep-data.js');
new Function('window','document','MutationObserver', read('antibiotiket-parenteral-prep.js'))( // eslint-disable-line no-new-func
  sandbox.window,
  { getElementById(){return null;}, querySelectorAll(){return [];}, createElement(){return {};} },
  function(){}
);
load('antibiotiket-clinical-completeness-v2.js');
// Hardening patches canonical nested data before touching the DOM.
new Function('window','document','MutationObserver', read('antibiotiket-clinical-hardening.js'))(sandbox.window, undefined, undefined); // eslint-disable-line no-new-func

const guide = sandbox.window.DRX_ANTIBIOTIC_GUIDE;
const liquids = sandbox.window.DRX_ANTIBIOTIC_FORMULATIONS;
const solids = sandbox.window.DRX_ANTIBIOTIC_SOLIDS;
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
const prepData = sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
const prepEngine = sandbox.window.DRX_ANTIBIOTIC_PREP_ENGINE;
const dx = id => guide.indications.find(x => x.id === id);
const hosp = id => hospital.regimens.find(x => x.id === id);
const prep = id => prepData.preparations.find(x => x.id === id);
const form = (drug,id) => liquids.drugs[drug].forms.find(x => x.id === id);
const ml = (mg,f) => mg * 5 / f.mgPer5mL;
const cap = (kg,mgKg,max) => Math.min(kg*mgKg,max);
let passed = 0;
const tc = (id,fn) => { fn(); passed += 1; console.log(`${id}: PASS`); };

tc('T001',()=>{ const mg=cap(12,50,1000); assert.equal(mg,600); assert.equal(ml(mg,form('Amoxicillin','amox-250-5')),12); });
tc('T002',()=>{ const mg=cap(55,50,1000); assert.equal(mg,1000); assert.equal(ml(mg,form('Amoxicillin','amox-400-5')),12.5); });
tc('T003',()=>{ assert.equal(liquids.drugs['Trimethoprim / sulfamethoxazole'].basis,'trimethoprim'); assert.equal(ml(80,form('Trimethoprim / sulfamethoxazole','tmpsmx-40-200-5')),10); });
tc('T004',()=>{ const pen=dx('gas').options.find(x=>x.id==='penicillin-gas'); assert.equal(pen.dose.type,'fixed'); assert.equal(pen.dose.text,'250 mg/dozë'); assert.equal(ml(250,form('Penicillin V','penv-250-5')),5); });
tc('T005',()=>{ const d=prepEngine.doseForRegimen(hosp('H005'),20,'Ceftriaxone',12); const r=prepEngine.calculatePreparation({prep:prep('IV001'),regimenRoute:'IV',dose:d,exactProductConfirmed:true}); assert.equal(d.value,1000); assert.equal(r.rawStockMl,10); assert.equal(r.gate,'ALLOW'); });
tc('T006',()=>{ const r=prepEngine.calculatePreparation({prep:prep('IV002'),regimenRoute:'IV',dose:{kind:'mg',value:1000},exactProductConfirmed:true,stockChoiceMgPerMl:250}); assert.equal(r.gate,'HARD_BLOCK_ROUTE'); assert.match(prep('IV002').safety,/NEVER IV/i); });
tc('T007',()=>{ const r=prepEngine.calculatePreparation({prep:prep('IV019'),regimenRoute:'IV',dose:{kind:'units',value:600000},exactProductConfirmed:true}); assert.equal(r.gate,'HARD_BLOCK_ROUTE'); assert.match(prep('IV019').routeLabel,/IM ONLY/); });
tc('T008',()=>{ const cefuroxime=solids.drugs.Cefuroxime?.forms?.find(x=>x.id==='cefuroxime-tab-250'); assert.ok(cefuroxime); assert.equal(cefuroxime.componentMg,250); assert.match(read('antibiotiket-prescription.js'),/përputhje të saktë|njësi të plota/i); });
tc('T009',()=>{ const beta=new Set(['Amoxicillin','Amoxicillin / clavulanate','Cephalexin','Cefpodoxime','Cefdinir','Cefixime','Cefuroxime','Penicillin V','Cefadroxil','Ceftriaxone','Cefazolin','Ampicillin','Ampicillin/sulbactam']); const bad=[]; guide.indications.forEach(i=>(i.options||[]).forEach(o=>{if((o.allergy||[]).includes('a3')&&beta.has(o.drug))bad.push(`${i.id}:${o.drug}`);})); assert.deepEqual(bad,[]); });
tc('T010',()=>{ assert.equal(dx('uti-pyelo').options.some(x=>x.drug==='Nitrofurantoin'),false); assert.ok(form('Nitrofurantoin','nitro-25-5')); assert.equal(dx('uti-cystitis').options.find(x=>x.id==='nitro-cystitis').duration.text,'5 ditë'); });
tc('T011',()=>{ assert.equal(dx('aom').minAgeMonths,6); const hard=read('antibiotiket-clinical-hardening.js'); assert.match(hard,/reconcileAgeFromWeight/); assert.match(hard,/Pesha nuk përdoret si zëvendësim i moshës/); });
tc('T012',()=>{ const capsule=solids.drugs.Amoxicillin.forms.find(x=>x.id==='amox-cap-500'); assert.ok(capsule); assert.equal(capsule.componentMg,500); assert.match(capsule.form,/kapsul/i); assert.equal(500/capsule.componentMg,1); });
tc('T013',()=>{ assert.equal(solids.drugs.Amoxicillin.forms.some(x=>x.componentMg===600),false); assert.match(read('antibiotiket-prescription.js'),/Nuk ka përputhje të saktë me njësi të plota/); });
tc('T014',()=>{ assert.equal(hosp('H016').autoVisible,false); assert.equal(hosp('H016').dose.type,'tdm'); const r=prepEngine.calculatePreparation({prep:prep('IV014'),regimenRoute:'IV',dose:{kind:'mg',value:500},exactProductConfirmed:true}); assert.equal(r.gate,'HARD_BLOCK_PREP'); });
tc('T015',()=>{ const f=form('Ciprofloxacin','cipro-500-5'); assert.equal(f.minWeightKg,13); assert.ok(12<f.minWeightKg); assert.equal(liquids.drugs.Ciprofloxacin.customAllowed,false); assert.match(read('antibiotiket-clinical-hardening.js'),/restrictedCustomDrugs/); });

assert.equal(passed,15);

// --- Post-audit clinical regressions ---------------------------------------
assert.equal(dx('sinusitis').minAgeMonths,12, 'ABRS must be restricted to the 1–18 year pathway population');
assert.equal(dx('uti-cystitis').minAgeMonths,1, 'CPS 2026 UTI scope starts at 1 month');
assert.equal(dx('uti-pyelo').minAgeMonths,1, 'CPS 2026 UTI scope starts at 1 month');

const biteTreat=dx('bite').options.find(x=>x.id==='combo-bite-treat');
const biteClinda=biteTreat.dose.parts.find(x=>x.drug==='Clindamycin');
assert.equal(biteClinda.dose.maxDose,450, 'Oral bite clindamycin must cap at 450 mg/dose');

const levo=dx('sinusitis').options.find(x=>x.id==='levo-sinusitis');
assert.equal(levo.dose.type,'fixed', 'Age-dependent levofloxacin must not be auto-finalized by a generic weight calculator');
assert.match(levo.dose.text,/10 mg\/kg\/dozë/);
assert.match(levo.dose.text,/500 mg\/ditë/);
assert.ok(dx('sinusitis').options.some(x=>x.id==='cefuroxime-sinusitis'));
assert.ok(dx('sinusitis').options.some(x=>x.id==='cefixime-clinda-sinusitis'));

assert.deepEqual(liquids.indicationOverrides['uti-cystitis|Amoxicillin / clavulanate'].allow,['amoxclav-400-57-5']);
assert.deepEqual(liquids.indicationOverrides['uti-pyelo|Amoxicillin / clavulanate'].allow,['amoxclav-400-57-5']);
assert.equal(liquids.drugs['Amoxicillin / clavulanate'].customAllowed,false);
assert.equal(liquids.drugs['Trimethoprim / sulfamethoxazole'].customAllowed,false);
assert.equal(liquids.drugs.Levofloxacin.customAllowed,false);

// --- Current AOM pathway completeness --------------------------------------
const aom=dx('aom');
assert.ok(aom.options.some(x=>x.id==='cefuroxime-aom' && x.dose.text==='250 mg/dozë'));
assert.ok(hosp('H017') && hosp('H017').route==='IV' && hosp('H017').transition==='1 dozë');
assert.ok(hosp('H018') && hosp('H018').route==='IM' && hosp('H018').transition==='3 ditë');
assert.ok(hosp('H019') && hosp('H019').route==='IV' && hosp('H019').transition==='3 ditë');
assert.deepEqual([hosp('H018').dose.value,hosp('H018').dose.maxDose],[50,1000]);
assert.ok(hospital.linkedByIndication.aom.includes('H018') && hospital.linkedByIndication.aom.includes('H019'));

// --- Current CAP pathway completeness --------------------------------------
const pneumonia=dx('pneumonia');
const capClinda=pneumonia.options.find(x=>x.id==='clinda-pna');
assert.deepEqual([capClinda.dose.min,capClinda.dose.max,capClinda.dose.maxDose],[10,13,600]);
const capCefuroxime=pneumonia.options.find(x=>x.id==='cefuroxime-pna');
assert.ok(capCefuroxime);
assert.equal(capCefuroxime.dose.type,'fixed');
assert.equal(capCefuroxime.dose.text,'250–500 mg/dozë');
assert.ok(solids.drugs.Cefuroxime.forms.some(x=>x.componentMg===500));

// --- CDC GAS completeness ---------------------------------------------------
const gas=dx('gas');
const cefadroxil=gas.options.find(x=>x.id==='cefadroxil-gas');
assert.ok(cefadroxil);
assert.deepEqual([cefadroxil.dose.value,cefadroxil.dose.maxDose],[30,1000]);
assert.equal(cefadroxil.frequency,'1 herë/ditë');
assert.equal(cefadroxil.duration.text,'10 ditë');
assert.deepEqual(cefadroxil.allergy,['a1']);
assert.ok(form('Cefadroxil','cefadroxil-250-5'));
assert.ok(form('Cefadroxil','cefadroxil-500-5'));
assert.ok(solids.drugs.Cefadroxil.forms.some(x=>x.componentMg===500));

// --- Frontend hard stops / fail-closed runtime -----------------------------
assert.match(read('antibiotiket-clinical-hardening.js'),/Funksioni renal para dozës IV\/IM/);
assert.match(read('antibiotiket-clinical-hardening.js'),/STOP — dyshim për sinusit të komplikuar/);
assert.match(read('antibiotiket-clinical-hardening.js'),/Shfaq vetëm skemën për patogjen atipik/);
assert.match(read('antibiotiket-clinical-hardening.js'),/A4 nuk mund të trajtohet si një kategori e vetme/);
assert.match(read('antibiotiket-shell.js'),/Moduli klinik nuk u ngarkua plotësisht/);
assert.match(read('antibiotiket-shell.js'),/clinical-completeness-v2/);
assert.match(read('antibiotiket-shell.js'),/clinical-hardening-v1/);
assert.doesNotMatch(read('antibiotiket-clinical-hardening.js'),/DRX_ANTIBIOTIC_CLINICAL_AUDIT\.refresh\s*=/, 'Do not mutate a frozen audit object at runtime');

assert.match(read('antibiotiket-hospital.css'),/@media\(max-width:520px\)/);
assert.match(read('antibiotiket-parenteral-prep.css'),/@media\(max-width:520px\)/);
assert.match(read('antibiotiket-prescription.css'),/@media\(max-width:560px\)/);
assert.match(read('antibiotiket-clinical-hardening.css'),/@media\(max-width:560px\)/);
console.log('Antibiotics Phase 7 master gate passed: 15/15 original calculator cases + post-audit disease/antibiotic completeness + safety hardening + mobile CSS contracts.');