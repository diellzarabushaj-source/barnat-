'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const sandbox = { window:{} };
new Function('window', read('antibiotiket-hospital-data.js'))(sandbox.window); // eslint-disable-line no-new-func
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
assert.ok(hospital, 'Phase 5 hospital dataset must load');
assert.match(hospital.version, /phase5-hospital/);
assert.equal(hospital.scope, 'paediatric-hospital-parenteral');
assert.equal(hospital.regimens.length, 16);

const byId = id => hospital.regimens.find(item => item.id === id);
for (const regimen of hospital.regimens) {
  assert.match(regimen.id, /^H\d{3}$/);
  assert.ok(['IV','IM'].includes(regimen.route));
  assert.ok(regimen.drug && regimen.scenario);
  assert.ok(regimen.source && hospital.sources[regimen.source]);
  assert.ok(Array.isArray(regimen.prepIds) && regimen.prepIds.length > 0);
}

assert.deepEqual(hospital.linkedByIndication.aom, ['H001']);
assert.deepEqual(hospital.linkedByIndication.gas, ['H002','H003']);
assert.deepEqual(hospital.linkedByIndication.pneumonia, ['H004','H005','H006']);
assert.deepEqual(hospital.linkedByIndication['uti-pyelo'], ['H008','H009']);
assert.equal(hospital.linkedByIndication['uti-cystitis'], undefined, 'Simple cystitis must not expose parenteral alternatives');
assert.equal(hospital.linkedByIndication.impetigo, undefined, 'Simple impetigo must not silently gain IV/IM therapy');

assert.equal(byId('H001').drug, 'Ceftriaxone');
assert.equal(byId('H001').route, 'IM');
assert.equal(byId('H001').dose.value, 50);
assert.equal(byId('H001').dose.maxDose, 1000);
assert.deepEqual(byId('H001').blockedAllergy, ['a3','a4']);
assert.equal(byId('H002').dose.type, 'weight-threshold');
assert.equal(byId('H002').dose.thresholdKg, 27);
assert.equal(byId('H002').dose.units, 600000);
assert.equal(byId('H003').dose.units, 1200000);
assert.deepEqual(byId('H002').allowedAllergy, ['none','a0','a4']);
assert.match(byId('H003').safety, /IM ONLY/i);
assert.equal(byId('H004').drug, 'Ampicillin');
assert.equal(byId('H005').drug, 'Ceftriaxone');
assert.equal(byId('H006').dose.component, 'ampicillin');
assert.equal(byId('H008').dose.maxDose, 2000);
assert.equal(byId('H009').drug, 'Ciprofloxacin');
assert.match(byId('H009').safety, /Jo first-line/i);
assert.equal(byId('H010').drug, 'Cefazolin');
assert.equal(byId('H011').drug, 'Clindamycin');
assert.match(byId('H012').safety, /source control/i);
assert.equal(byId('H013').dose.component, 'ampicillin');
assert.equal(byId('H014').dose.type, 'combo');
assert.deepEqual(byId('H014').allowedAllergy, ['a2']);
assert.equal(byId('H015').drug, 'Ampicillin/sulbactam');
assert.equal(byId('H016').autoVisible, false);
assert.equal(hospital.linkedByIndication.GENERAL, undefined);

const runtime = read('antibiotiket-hospital.js');
assert.match(runtime, /Hospital \/ IV \/ IM/);
assert.match(runtime, /Jo alternativë ambulatore/);
assert.match(runtime, /Pesha referuese nuk përdoret për finalizim spitalor/);
assert.match(runtime, /antibiotiket-hospital-prep-note|re-konstituimi/);
assert.doesNotMatch(runtime, /mgPerMl|mgPerML|finalConcentration|reconstitutionMl\s*\//);
assert.match(runtime, /allergyAllowed/);
assert.match(runtime, /thresholdMatches/);
assert.match(runtime, /orbitalRedFlags/);

const shell = read('antibiotiket-shell.js');
assert.match(shell, /antibiotiket-hospital-data\.js\?v=antibiotiket-phase5-v1/);
assert.match(shell, /antibiotiket-hospital\.js\?v=antibiotiket-phase5-v1/);
assert.match(shell, /antibiotiket-hospital\.css\?v=antibiotiket-phase5-v1/);
const css = read('antibiotiket-hospital.css');
assert.match(css, /\.abx-hospital\{/);
assert.match(css, /\.abx-hosp-route\.is-im/);
assert.match(css, /@media\(max-width:520px\)/);

console.log(`Antibiotics Phase 5 gate passed: ${hospital.regimens.length} hospital/parenteral regimens, separated from outpatient UI.`);