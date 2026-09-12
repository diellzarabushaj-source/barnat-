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
load('antibiotiket-hospital-data.js');
load('antibiotiket-parenteral-prep-data.js');

const fakeDocument = {
  getElementById(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return {}; }
};
// eslint-disable-next-line no-new-func
new Function('window','document','MutationObserver', read('antibiotiket-parenteral-prep.js'))(sandbox.window, fakeDocument, function(){});

const prepData = sandbox.window.DRX_ANTIBIOTIC_PARENTERAL_PREP;
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
const engine = sandbox.window.DRX_ANTIBIOTIC_PREP_ENGINE;
assert.ok(prepData && engine, 'Phase 6 data and preparation engine must load');
assert.match(prepData.version, /phase6-preparation/);
assert.equal(prepData.preparations.length, 20, 'Master data freeze contains IV001–IV020');

const prep = id => prepData.preparations.find(item => item.id === id);
const regimen = id => hospital.regimens.find(item => item.id === id);
for (let i = 1; i <= 20; i += 1) {
  const id = `IV${String(i).padStart(3,'0')}`;
  const item = prep(id);
  assert.ok(item, `${id} missing`);
  assert.ok(['IV','IM'].includes(item.route), `${id}: normalized route must be IV or IM`);
  assert.equal(item.exactProduct, true, `${id}: exact product match must be required`);
  assert.match(item.sourceUrl || '', /^https:\/\//, `${id}: product label source required`);
}

assert.equal(prep('IV007').publishable, false, 'Pediatric amp/sulb IM default must remain hidden');
assert.equal(prep('IV014').publishable, false, 'Vancomycin prep must not surface in simple calculator');
assert.equal(prep('IV015').publishable, false, 'Vancomycin prep must not surface in simple calculator');
assert.equal(prep('IV018').publishable, false, 'Metronidazole prep has no linked pediatric regimen and remains hidden');

// T005: ceftriaxone IV exact product — max before volume, then 100 mg/mL stock.
const h005Dose = engine.doseForRegimen(regimen('H005'), 20, 'Ceftriaxone', 12);
assert.deepEqual(h005Dose, { kind:'mg', drug:'Ceftriaxone', value:1000, component:'Ceftriaxone' });
let result = engine.calculatePreparation({ prep:prep('IV001'), regimenRoute:'IV', dose:h005Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'ALLOW');
assert.equal(result.rawStockMl, 10);
assert.equal(result.targetRequired, true, 'Final bag concentration must not be guessed');
result = engine.calculatePreparation({ prep:prep('IV001'), regimenRoute:'IV', dose:h005Dose, exactProductConfirmed:true, targetConcentration:20 });
assert.equal(result.rawFinalVolumeMl, 50, '1000 mg at selected 20 mg/mL target = 50 mL final mathematical volume');

// Exact product confirmation is mandatory before any mL.
result = engine.calculatePreparation({ prep:prep('IV001'), regimenRoute:'IV', dose:h005Dose, exactProductConfirmed:false });
assert.equal(result.gate, 'VERIFY_EXACT_PRODUCT');
assert.equal(result.rawStockMl, undefined);

// T006: IV regimen must never use the IM/lidocaine path.
result = engine.calculatePreparation({ prep:prep('IV002'), regimenRoute:'IV', dose:h005Dose, exactProductConfirmed:true, stockChoiceMgPerMl:250 });
assert.equal(result.gate, 'HARD_BLOCK_ROUTE');
assert.match(prep('IV002').safety, /NEVER IV/i);

// Ceftriaxone IM path requires explicit 250 vs 350 mg/mL selection.
const h001Dose = engine.doseForRegimen(regimen('H001'), 20, 'Ceftriaxone', 12);
result = engine.calculatePreparation({ prep:prep('IV002'), regimenRoute:'IM', dose:h001Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'SELECT_STOCK_PATH');
result = engine.calculatePreparation({ prep:prep('IV002'), regimenRoute:'IM', dose:h001Dose, exactProductConfirmed:true, stockChoiceMgPerMl:250 });
assert.equal(result.gate, 'ALLOW');
assert.equal(result.rawStockMl, 4);

// T007: benzathine penicillin G is IM ONLY and wrong route hard-blocks.
const h002Dose = engine.doseForRegimen(regimen('H002'), 20, 'Benzathine penicillin G', null);
assert.equal(h002Dose.value, 600000);
result = engine.calculatePreparation({ prep:prep('IV019'), regimenRoute:'IV', dose:h002Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'HARD_BLOCK_ROUTE');
result = engine.calculatePreparation({ prep:prep('IV019'), regimenRoute:'IM', dose:h002Dose, exactProductConfirmed:true });
assert.equal(result.rawVolumeMl, 1);
const h003Dose = engine.doseForRegimen(regimen('H003'), 30, 'Benzathine penicillin G', null);
result = engine.calculatePreparation({ prep:prep('IV020'), regimenRoute:'IM', dose:h003Dose, exactProductConfirmed:true });
assert.equal(result.rawVolumeMl, 2);

// Ampicillin: preparation instructions may show, but product-specific stock prevents automatic draw mL.
const h004Dose = engine.doseForRegimen(regimen('H004'), 20, 'Ampicillin', 12);
result = engine.calculatePreparation({ prep:prep('IV003'), regimenRoute:'IV', dose:h004Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'MANUAL_STOCK_VERIFY');
assert.equal(result.rawStockMl, undefined);

// Ampicillin/sulbactam doses on ampicillin; total-dose target uses the verified 2:1 ratio.
const h006Dose = engine.doseForRegimen(regimen('H006'), 20, 'Ampicillin/sulbactam', 12);
assert.equal(h006Dose.value, 1000);
assert.equal(h006Dose.component, 'ampicillin');
result = engine.calculatePreparation({ prep:prep('IV005'), regimenRoute:'IV', dose:h006Dose, exactProductConfirmed:true, targetConcentration:15 });
assert.equal(result.rawStockMl, 4, '1000 mg ampicillin / 250 mg/mL = 4 mL stock');
assert.equal(result.totalDrugMg, 1500, '1 g ampicillin + 0.5 g sulbactam = 1.5 g total');
assert.equal(result.rawFinalVolumeMl, 100, '1500 mg total / 15 mg/mL = 100 mL final mathematical volume');

// Cefazolin stock draw is exact-product bound; IM prep cannot flow into IV H010.
const h010Dose = engine.doseForRegimen(regimen('H010'), 20, 'Cefazolin', null);
result = engine.calculatePreparation({ prep:prep('IV008'), regimenRoute:'IV', dose:h010Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'ALLOW');
assert.ok(Math.abs(result.rawStockMl - (500/330)) < 1e-12);
result = engine.calculatePreparation({ prep:prep('IV010'), regimenRoute:'IV', dose:h010Dose, exactProductConfirmed:true });
assert.equal(result.gate, 'HARD_BLOCK_ROUTE');

// Clindamycin IV uses stock concentration, max final concentration and max infusion rate.
const h011Dose = engine.doseForRegimen(regimen('H011'), 20, 'Clindamycin', null);
result = engine.calculatePreparation({ prep:prep('IV011'), regimenRoute:'IV', dose:h011Dose, exactProductConfirmed:true });
assert.ok(Math.abs(result.rawStockMl - (200/150)) < 1e-12);
assert.ok(Math.abs(result.rawMinimumFinalVolumeMl - (200/18)) < 1e-12);
assert.ok(Math.abs(result.rawMinimumInfusionMinutes - (200/30)) < 1e-12);

// Ciprofloxacin exact 2 mg/mL premix.
const h009Dose = engine.doseForRegimen(regimen('H009'), 20, 'Ciprofloxacin', 12);
result = engine.calculatePreparation({ prep:prep('IV013'), regimenRoute:'IV', dose:h009Dose, exactProductConfirmed:true });
assert.equal(result.rawStockMl, 100);
assert.equal(prep('IV013').time, '60 min');

// T014: vancomycin/TDM remains hard-blocked from one-click prep.
assert.equal(regimen('H016').autoVisible, false);
result = engine.calculatePreparation({ prep:prep('IV014'), regimenRoute:'IV', dose:{kind:'mg',value:500}, exactProductConfirmed:true });
assert.equal(result.gate, 'HARD_BLOCK_PREP');

const runtime = read('antibiotiket-parenteral-prep.js');
assert.match(runtime, /Si përgatitet/);
assert.match(runtime, /Kam verifikuar që produkti\/presentation dhe route përputhen saktë/);
assert.match(runtime, /Vlerat e mL ruhen matematikisht pa rounding klinik/);
assert.match(runtime, /targetConcentration/);
assert.match(runtime, /routeCompatible/);

const shell = read('antibiotiket-shell.js');
assert.match(shell, /antibiotiket-parenteral-prep-data\.js\?v=antibiotiket-phase6-v1/);
assert.match(shell, /antibiotiket-parenteral-prep\.js\?v=antibiotiket-phase6-v1/);
assert.match(shell, /antibiotiket-parenteral-prep\.css\?v=antibiotiket-phase6-v1/);

console.log('Antibiotics Phase 6 gate passed: IV001–IV020 exact-product preparation data and route-safe calculation engine.');