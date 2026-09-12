'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const sandbox = { window:{} };
// eslint-disable-next-line no-new-func
new Function('window', read('antibiotiket-hospital-data.js'))(sandbox.window);
const hospital = sandbox.window.DRX_ANTIBIOTIC_HOSPITAL;
assert.ok(hospital, 'Phase 5 hospital dataset must load');
assert.match(hospital.version, /phase5-hospital/, 'Phase 5 version must be explicit');
assert.equal(hospital.scope, 'paediatric-hospital-parenteral');
assert.equal(hospital.regimens.length, 16, 'Master data freeze contains 16 hospital/parenteral regimens');

const byId = id => hospital.regimens.find(item => item.id === id);
for (const regimen of hospital.regimens) {
  assert.match(regimen.id, /^H\d{3}$/, `${regimen.id}: Hosp_ID required`);
  assert.ok(['IV','IM'].includes(regimen.route), `${regimen.id}: route must be IV or IM`);
  assert.ok(regimen.drug, `${regimen.id}: drug required`);
  assert.ok(regimen.scenario, `${regimen.id}: scenario required`);
  assert.ok(regimen.source && hospital.sources[regimen.source], `${regimen.id}: source must resolve`);
  assert.ok(Array.isArray(regimen.prepIds) && regimen.prepIds.length > 0, `${regimen.id}: Prep_ID link required for Phase 6`);
}

assert.deepEqual(hospital.linkedByIndication.aom, ['H001']);
assert.deepEqual(hospital.linkedByIndication.gas, ['H002','H003']);
assert.deepEqual(hospital.linkedByIndication.pneumonia, ['H004','H005','H006']);
assert.deepEqual(hospital.linkedByIndication['uti-pyelo'], ['H008','H009']);
assert.ok(!hospital.linkedByIndication['uti-cystitis'], 'Simple cystitis must not expose parenteral alternatives');
assert.ok(!hospital.linkedByIndication.impatigo, 'Impetigo must not silently gain a hospital antibiotic regimen');

assert.equal(byId('H001').drug, 'Ceftriaxone');
assert.equal(byId('H001').route, 'IM', 'AOM ceftriaxone must remain supervised IM, not outpatient PO alternative');
assert.equal(byId('H001').dose.value, 50);
assert.equal(byId('H001').dose.maxDose, 1000);
assert.deepEqual(byId('H001').blockedAllergy, ['a3','a4']);

assert.equal(byId('H002').dose.type, 'weight-threshold');
assert.equal(byId('H002').dose.thresholdKg, 27);
assert.equal(byId('H002').dose.units, 600000);
assert.equal(byId('H003').dose.units, 1200000);
assert.deepEqual(byId('H002').allowedAllergy, ['none','a0','a4']);
assert.match(byId('H003').safety, /IM ONLY/i, 'Benzathine penicillin G route safety must be explicit');

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
assert.deepEqual(byId('H014').allowedAllergy, ['a2'], 'Ceftriaxone + clindamycin bite pathway must not auto-publish for SCAR/ceph allergy');
assert.equal(byId('H015').drug, 'Ampicillin/sulbactam');
assert.equal(byId('H016').autoVisible, false, 'Vancomycin/TDM must not appear as a simple automatic alternative');
assert.equal(hospital.linkedByIndication.GENERAL, undefined, 'General vancomycin/TDM row must not be linked into indication UI');

const runtime = read('antibiotiket-hospital.js');
assert.match(runtime, /Hospital \/ IV \/ IM/, 'Collapsed hospital section title required');
assert.match(runtime, /Jo alternativë ambulatore/, 'Hospital module must explicitly separate itself from outpatient therapy');
assert.match(runtime, /Pesha referuese nuk përdoret për finalizim spitalor/, 'Hospital numeric dosing must require real weight');
assert.match(runtime, /antibiotiket-hospital-prep-note|re-konstituimi/, 'Phase 5 must state that IV/IM preparation belongs to Phase 6');
assert.doesNotMatch(runtime, /mgPerMl|mgPerML|finalConcentration|reconstitutionMl\s*\//, 'Phase 5 must not invent preparation-volume calculations');
assert.match(runtime, /allergyAllowed/, 'Hospital display must respect allergy gates');
assert.match(runtime, /thresholdMatches/, 'Weight-threshold IM regimens must be gated by real weight');
assert.match(runtime, /orbitalRedFlags/, 'Preseptal orbital red flags must surface escalation without inventing a regimen');

const shell = read('antibiotiket-shell.js');
assert.match(shell, /antibiotiket-hospital-data\.js\?v=antibiotiket-phase5-v1/);
assert.match(shell, /antibiotiket-hospital\.js\?v=antibiotiket-phase5-v1/);
assert.match(shell, /antibiotiket-hospital\.css\?v=antibiotiket-phase5-v1/);

const css = read('antibiotiket-hospital.css');
assert.match(css, /\.abx-hospital\{/);
assert.match(css, /\.abx-hosp-route\.is-im/);
assert.match(css, /@media\(max-width:520px\)/, 'Hospital module must remain mobile-friendly');

console.log(`Antibiotics Phase 5 gate passed: ${hospital.regimens.length} hospital/parenteral regimens, separated from outpatient UI.`);