const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../dosage-engine.js');

const drug = {
  atc:'J01CR02',
  substance:'Clavulanic acid / Amoxicillin',
  form:'Tab.',
  strength:'875 mg / 125 mg',
};
const baseRegimen = {
  regimenId:'adult-1',
  atc:'J01CR02',
  substance:'Amoxicillin + Clavulanic acid',
  form:'Tableta',
  referenceStrength:'875mg/125mg',
  indication:'Infeksion respirator',
  sourceUrl:'https://example.org/source',
  status:'VERIFIKUAR',
};

assert.equal(Engine.buildMatchKey(drug), Engine.buildMatchKey(baseRegimen), 'normalization should produce an exact deterministic match key');
assert.equal(Engine.decideMatch(drug, [baseRegimen]).status, 'auto', 'one exact regimen must auto-apply');
assert.equal(Engine.decideMatch(drug, [baseRegimen, { ...baseRegimen, regimenId:'adult-2', indication:'ITU' }]).status, 'choose-indication', 'multiple exact regimens must require an indication choice');
assert.equal(Engine.decideMatch({ ...drug, strength:'500 mg / 125 mg' }, [baseRegimen]).status, 'manual', 'non-exact strength must fall back to manual dosing');
assert.equal(Engine.decideMatch({ ...drug, form:'Sirup' }, [baseRegimen]).status, 'manual', 'non-exact form must fall back to manual dosing');

const pediatric = {
  regimenId:'ped-1',
  atc:'J01CR02',
  substance:'Amoxicillin / Clavulanic acid',
  form:'Suspension',
  concentration:'400 mg / 57 mg',
  mgPerKg:45,
  minAgeMonths:3,
  maxAgeMonths:144,
  minWeightKg:5,
  sourceUrl:'https://example.org/source',
};
const pediatricDrug = { atc:pediatric.atc, substance:pediatric.substance, form:pediatric.form, strength:pediatric.concentration };
const missingPatient = Engine.decideMatch(pediatricDrug, [pediatric], { population:'pediatric', patient:{} });
assert.equal(missingPatient.status, 'needs-patient-data');
assert.deepEqual(missingPatient.missing.sort(), ['ageMonths', 'weightKg']);
assert.equal(Engine.decideMatch(pediatricDrug, [pediatric], { population:'pediatric', patient:{ ageMonths:48, weightKg:18 } }).status, 'auto');
assert.equal(Engine.decideMatch(pediatricDrug, [pediatric], { population:'pediatric', patient:{ ageMonths:180, weightKg:45 } }).status, 'review');

const transfer = Engine.prescriptionTransfer(drug, baseRegimen, 'adult');
assert.equal(transfer.regimenId, 'adult-1');
assert.equal(transfer.dosageStatus, 'auto-filled');
assert.equal(transfer.tradeName, '', 'trade name must never be introduced by dosage transfer');

const dosageSource = fs.readFileSync(path.join(__dirname, '..', 'dosage-engine.js'), 'utf8');
assert.doesNotMatch(dosageSource, /Gemini/i, 'Gemini must not be used by the dosage engine');
console.log('Dosage matching tests passed.');
