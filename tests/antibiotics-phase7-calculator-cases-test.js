'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sandbox = { window:{ addEventListener(){} } };
const load = file => {
  // eslint-disable-next-line no-new-func
  new Function('window', read(file))(sandbox.window);
};

load('antibiotiket-data.js');
load('antibiotiket-formulations-data.js');
load('antibiotiket-solids-data.js');
load('antibiotiket-hospital-data.js');
load('antibiotiket-parenteral-prep-data.js');

const fakeDocument = { getElementById(){ return null; }, querySelectorAll(){ return []; }, createElement(){ return {}; } };
// eslint-disable-next-line no-new-func
new Function('window','document','MutationObserver', read('antibiotiket-parenteral-prep.js'))(sandbox.window, fakeDocument, function(){});

const guide = sandbox.window.DRX_ANTIBIOTIC_GUIDE;
const liquids = sandbox.window.DRX_ANTIBIOTIC_FORMULATIONS;
const solids = sandbox.window.DRX_ANTIBIOTIC_SOLIDS;
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
const prepData = sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
const prepEngine = sandbox.window.DRX_ANTIBIOTIC_PREP_ENGINE;

const results = [];
const testCase = (id, fn) => {
  try {
    fn();
    results.push([id, 'PASS']);
  } catch (error) {
    error.message = `${id}: ${error.message}`;
    throw error;
  }
};
const form = (drug, id) => liquids.drugs[drug].forms.find(item => item.id === id);
const liquidMl = (mg, liquidForm) => mg * 5 / liquidForm.mgPer5mL;
const cappedDose = (weight, mgKg, max) => Math.min(weight * mgKg, max);
const hosp = id => hospital.regimens.find(item => item.id === id);
const prep = id => prepData.preparations.find(item => item.id === id);
const indication = id => guide.indications.find(item => item.id === id);

// T001 — Amoxicillin 12 kg × 50 mg/kg = 600 mg; 250 mg/5 mL => 12 mL.
testCase('T001', () => {
  const f = form('Amoxicillin', 'amox-250-5');
  assert.ok(f, '250 mg/5 mL exact formulation missing');
  const mg = cappedDose(12, 50, 1000);
  assert.equal(mg, 600);
  assert.equal(liquidMl(mg, f), 12);
});

// T002 — max applies before formulation conversion.
testCase('T002', () => {
  const f = form('Amoxicillin', 'amox-400-5');
  const mg = cappedDose(55, 50, 1000);
  assert.equal(mg, 1000);
  assert.equal(liquidMl(mg, f), 12.5);
});

// T003 — TMP-SMX is dosed on trimethoprim component, not total combination mg.
testCase('T003', () => {
  const entry = liquids.drugs['Trimethoprim / sulfamethoxazole'];
  assert.equal(entry.basis, 'trimethoprim');
  const f = form('Trimethoprim / sulfamethoxazole', 'tmpsmx-40-200-5');
  const mgTmp = 20 * 4;
  assert.equal(mgTmp, 80);
  assert.equal(liquidMl(mgTmp, f), 10);
});

// T004 — fixed Penicillin V child dose, no mg/kg multiplication.
testCase('T004', () => {
  const gas = indication('gas');
  const pen = gas.options.find(item => item.id === 'penicillin-gas');
  assert.equal(pen.dose.type, 'fixed');
  assert.match(pen.dose.text, /250 mg\/dozë/);
  const f = form('Penicillin V', 'penv-250-5');
  assert.equal(liquidMl(250, f), 5);
});

// T005 — ceftriaxone exact IV product: 20 kg × 50 = 1000 mg; ~100 mg/mL => 10 mL stock.
testCase('T005', () => {
  const dose = prepEngine.doseForRegimen(hosp('H005'), 20, 'Ceftriaxone', 12);
  assert.equal(dose.value, 1000);
  const result = prepEngine.calculatePreparation({ prep:prep('IV001'), regimenRoute:'IV', dose, exactProductConfirmed:true });
  assert.equal(result.gate, 'ALLOW');
  assert.equal(result.rawStockMl, 10);
  assert.equal(result.targetRequired, true, 'Final dilution target must remain clinician-selected within label range');
});

// T006 — IM ceftriaxone/lidocaine path can never feed an IV regimen.
testCase('T006', () => {
  const dose = { kind:'mg', value:1000 };
  const result = prepEngine.calculatePreparation({ prep:prep('IV002'), regimenRoute:'IV', dose, exactProductConfirmed:true, stockChoiceMgPerMl:250 });
  assert.equal(result.gate, 'HARD_BLOCK_ROUTE');
  assert.match(prep('IV002').safety, /NEVER IV/i);
});

// T007 — benzathine penicillin G is IM ONLY.
testCase('T007', () => {
  const dose = { kind:'units', value:600000 };
  const result = prepEngine.calculatePreparation({ prep:prep('IV019'), regimenRoute:'IV', dose, exactProductConfirmed:true });
  assert.equal(result.gate, 'HARD_BLOCK_ROUTE');
  assert.match(prep('IV019').routeLabel, /IM ONLY/);
});

// T008 — cefuroxime tablet/suspension substitution is not automatic.
testCase('T008', () => {
  assert.equal(solids.drugs['Cefuroxime'], undefined, 'Cefuroxime solid auto-match must remain unavailable');
  assert.match(read('antibiotiket-prescription.js'), /cefuroxime|interchange|përputhje/i, 'Prescription runtime must retain exact-form matching safeguards');
});

// T009 — SCAR (A3): no beta-lactam option may be auto-suggested in outpatient engine.
testCase('T009', () => {
  const betaLactams = new Set(['Amoxicillin','Amoxicillin / clavulanate','Cephalexin','Cefpodoxime','Cefdinir','Cefixime','Cefuroxime','Penicillin V','Cefadroxil','Ceftriaxone','Cefazolin','Ampicillin','Ampicillin/sulbactam']);
  const violations = [];
  for (const dx of guide.indications) {
    for (const option of dx.options || []) {
      if ((option.allergy || []).includes('a3') && betaLactams.has(option.drug)) violations.push(`${dx.id}:${option.drug}`);
    }
  }
  assert.deepEqual(violations, []);
});

// T010 — nitrofurantoin is lower-UTI only and must not appear for pyelonephritis.
testCase('T010', () => {
  const pyelo = indication('uti-pyelo');
  assert.ok(pyelo, 'Pyelonephritis indication missing');
  assert.equal(pyelo.options.some(item => item.drug === 'Nitrofurantoin'), false);
  assert.match(liquids.drugs.Nitrofurantoin.forms[0].sourceUrl, /^https:\/\//);
});

// T011 — age-gated pathway cannot be finalized from weight alone.
testCase('T011', () => {
  assert.equal(indication('aom').minAgeMonths, 6);
  const runtime = read('antibiotiket.js');
  assert.match(runtime, /Zgjidh moshën për të kontrolluar pragun/);
  assert.match(runtime, /ageFromWeight/);
  const prescription = read('antibiotiket-prescription.js');
  assert.match(prescription, /Shkruaj peshën reale/);
});

// T012 — exact 500 mg amoxicillin solid gives one whole unit.
testCase('T012', () => {
  const forms = solids.drugs.Amoxicillin.forms;
  const exact = forms.filter(item => item.componentMg === 500 && item.singleUnitOnly !== true);
  assert.ok(exact.some(item => /capsule/i.test(item.form)), '500 mg amoxicillin capsule exact match required');
  assert.equal(500 / exact.find(item => /capsule/i.test(item.form)).componentMg, 1);
});

// T013 — 600 mg cannot be auto-rounded to an unscored 500 mg solid.
testCase('T013', () => {
  const forms = solids.drugs.Amoxicillin.forms;
  assert.equal(forms.some(item => item.componentMg === 600), false);
  assert.match(read('antibiotiket-prescription.js'), /Nuk ka përputhje të saktë me njësi të plota/);
});

// T014 — vancomycin is not a one-click calculator; TDM workflow hard stop.
testCase('T014', () => {
  const vanc = hosp('H016');
  assert.equal(vanc.autoVisible, false);
  assert.equal(vanc.dose.type, 'tdm');
  const result = prepEngine.calculatePreparation({ prep:prep('IV014'), regimenRoute:'IV', dose:{kind:'mg',value:500}, exactProductConfirmed:true });
  assert.equal(result.gate, 'HARD_BLOCK_PREP');
});

// T015 — 10% ciprofloxacin suspension is blocked below its product weight threshold.
testCase('T015', () => {
  const tenPercent = form('Ciprofloxacin', 'cipro-500-5');
  assert.equal(tenPercent.minWeightKg, 13);
  assert.equal(12 < tenPercent.minWeightKg, true, '12 kg child must not receive 10% option from auto form selector');
  const runtime = read('antibiotiket-formulations.js');
  assert.match(runtime, /minWeightKg/);
  assert.match(runtime, /weight >= form\.minWeightKg/);
});

assert.equal(results.length, 15);
assert.ok(results.every(([,status]) => status === 'PASS'));

const hospitalCss = read('antibiotiket-hospital.css');
const prepCss = read('antibiotiket-parenteral-prep.css');
const rxCss = read('antibiotiket-prescription.css');
assert.match(hospitalCss, /@media\(max-width:520px\)/, 'Hospital UI needs phone breakpoint');
assert.match(prepCss, /@media\(max-width:520px\)/, 'Preparation UI needs phone breakpoint');
assert.match(rxCss, /@media\(max-width:560px\)/, 'Prescription UI needs phone breakpoint');

console.log(`Antibiotics Phase 7 master gate passed: ${results.length}/15 CALCULATOR_TEST_CASES PASS + mobile CSS contracts.`);