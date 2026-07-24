const assert = require('node:assert/strict');
const Notation = require('../prescription-notation.js');
const Dosage = require('../dosage-engine.js');

const paracetamol = Notation.build({
  'Substanca aktive':'Paracetamol',
  'Fortësia':'500mg',
  'Forma farmaceutike':'Tablet',
  'Madhësia e paketimit':'20 pcs ; blister 2 x 10',
});
assert.equal(paracetamol.line, 'Tab. Paracetamol 500 mg');
assert.equal(paracetamol.packaging, '1 kuti = 20 tableta (2 blistera × 10)');
assert.equal(paracetamol.dispense, 'Scat. No I (Një kuti = 20 tableta (2 blistera × 10))');

const capsule = Notation.build({
  'Substanca aktive':'Omeprazole',
  'Fortësia':'20 mg',
  'Forma farmaceutike':'Gastro-resistant capsule, hard',
  'Madhësia e paketimit':'Cardboard box, 2x10 hard capsules',
});
assert.match(capsule.line, /^Caps\. Omeprazole 20 mg$/);
assert.match(capsule.packaging, /^1 kuti = 20 kapsula/);

const genericInjection = Notation.build({
  'Emri tregtar':'Ceftriaxone',
  'Substanca aktive':'ceftriaxone',
  'Fortësia':'1g/3.5ml',
  'Forma farmaceutike':'Powder and solvent for solution for injection',
  'Madhësia e paketimit':'Box containing 1 vial with powder + 1 vial with solvent',
});
assert.equal(genericInjection.line, 'Amp. ceftriaxone 1 g/3.5 mL');
assert.equal(genericInjection.route, '', 'Generic injection wording must not invent IV or IM');

const imInjection = Notation.build({
  'Emri tregtar':'Example 1 g IM',
  'Substanca aktive':'Example substance',
  'Fortësia':'1 g',
  'Forma farmaceutike':'Solution for injection',
  'Madhësia e paketimit':'5 ampoules of 2 ml',
});
assert.equal(imInjection.route, 'IM');
assert.equal(imInjection.line, 'Amp. Example substance 1 g (IM)');
assert.equal(imInjection.packaging, '1 kuti = 5 ampula × 2 mL');

const bothRoutes = Notation.build({
  'Emri tregtar':'Example IM/IV',
  'Substanca aktive':'Example substance',
  'Fortësia':'100mg/2ml',
  'Forma farmaceutike':'Solution for injection',
  'Madhësia e paketimit':'10 ampoules',
});
assert.ok(['IM/IV', 'IV/IM'].includes(bothRoutes.route));
assert.match(bothRoutes.line, /^Amp\. Example substance 100 mg\/2 mL \((?:IM\/IV|IV\/IM)\)$/);

const infusion = Notation.build({
  'Emri tregtar':'Sodium Chloride IV infusion',
  'Substanca aktive':'Sodium Chloride',
  'Fortësia':'0.9%',
  'Forma farmaceutike':'Solution for infusion',
  'Madhësia e paketimit':'10 x 250 ml',
});
assert.equal(infusion.line, 'Inf. Sodium Chloride 0.9 % (IV)');
assert.equal(infusion.packaging, '1 kuti = 10 flakona infuzioni × 250 mL');

const transferred = Dosage.prescriptionTransfer({
  key:'1', substance:'Paracetamol', strength:'500 mg', form:'Tablet', atc:'N02BE01',
  packaging:'20 tablets', packagingSummary:paracetamol.packaging,
  prescriptionLine:paracetamol.line, prescriptionNotation:paracetamol.full,
  dispense:paracetamol.dispense,
}, {
  regimenId:'PAR-1', indication:'Dhimbje', route:'PO', frequency:'Çdo 8 orë',
  duration:'3 ditë', dispense:'', signatura:'Nga 1 tabletë.', warnings:'', sourceUrl:'https://example.test', status:'VERIFIKUAR',
});
assert.equal(transferred.prescriptionLine, paracetamol.line);
assert.equal(transferred.packagingSummary, paracetamol.packaging);
assert.equal(transferred.dispense, paracetamol.dispense, 'Registry package must survive dosage auto-fill when regimen dispense is blank');

const registrySource = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'registry.js'), 'utf8');
assert.match(registrySource, /1gGQjnJboj8W7txs0fhG15PXO06rdB9aetLQgFmmPHz8/);
assert.match(registrySource, /export\?format=csv/);
assert.match(registrySource, /Si të shënohet në recetë/);

const drugSearch = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'drug-search.js'), 'utf8');
assert.match(drugSearch, /packagingSummary/);
assert.match(drugSearch, /prescriptionLine/);
assert.match(drugSearch, /dispense/);

console.log('Prescription notation tests passed.');
