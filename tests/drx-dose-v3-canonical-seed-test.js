'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'data', 'drx-dose-v3', 'seeds', 'user-emergency-list-canonical-substances.v1.json');
const seed = JSON.parse(fs.readFileSync(file, 'utf8'));

assert.equal(seed.schemaVersion, 'drx-dose-v3-canonical-substance-seed-v1');
assert.equal(seed.status, 'canonical_names_only_doses_not_imported');
assert.equal(seed.rules.userDoseTextIsEvidence, false);
assert.equal(seed.rules.brandNameMayMapWithoutJurisdictionVerification, false);
assert.equal(seed.rules.doseRulesMayPublishFromThisFile, false);

const byId = new Map(seed.canonicalSubstances.map(x => [x.id, x]));
for (const id of [
  'amoxicillin', 'amoxicillin-clavulanic-acid', 'ceftriaxone', 'trimethoprim-sulfamethoxazole',
  'adrenaline', 'atropine', 'verapamil', 'propranolol', 'amiodarone', 'dopamine',
  'labetalol', 'metoprolol', 'etamsylate', 'chloropyramine', 'dexamethasone',
  'methylprednisolone', 'diclofenac', 'ketoprofen', 'tramadol', 'metoclopramide',
  'ondansetron', 'morphine', 'paracetamol', 'ibuprofen', 'diazepam', 'biperiden',
  'hyoscine-butylbromide', 'furosemide', 'sodium-bicarbonate', 'sodium-chloride',
  'glucose', 'mannitol', 'ampicillin', 'azithromycin', 'metronidazole', 'meropenem',
  'cefuroxime', 'aciclovir', 'miconazole', 'dequalinium-chloride',
  'dexamethasone-neomycin', 'chloramphenicol', 'ascorbic-acid', 'pyridoxine'
]) assert.ok(byId.has(id), `missing canonical substance: ${id}`);

const labetalol = byId.get('labetalol');
assert.ok(!JSON.stringify(labetalol).toLowerCase().includes('"presolol"'), 'regional Presolol must not be a labetalol alias');

const metoprolol = byId.get('metoprolol');
assert.ok(metoprolol.verifiedRegionalBrands.some(x => x.brand === 'Presolol' && /Hemofarm/i.test(x.manufacturer)));

const bicarbonate = byId.get('sodium-bicarbonate');
assert.ok(bicarbonate.forbiddenAliases.includes('Lemod-Solu'));
const methylpred = byId.get('methylprednisolone');
assert.ok(methylpred.seedAliases.includes('Lemod-Solu'));

const cotrim = byId.get('trimethoprim-sulfamethoxazole');
assert.equal(cotrim.combination, true);
assert.ok(cotrim.seedAliases.includes('Bactrim'));

const coamox = byId.get('amoxicillin-clavulanic-acid');
assert.equal(coamox.combination, true);

for (const item of seed.variableCompositionProducts) {
  assert.notEqual(item.status, 'canonical_single_active');
}

const forbiddenClinicalClaims = [
  'mild infection -> amoxicillin',
  'medium -> co-amoxiclav',
  'severe -> ceftriaxone',
  'glucose 5% should be used as a diuretic for hypertension',
  'pyridoxine/bedoxin is a routine method to take patients off diazepam',
];
const exclusions = seed.notImportedAsClinicalRules.join('\n').toLowerCase();
for (const claim of forbiddenClinicalClaims) assert.ok(exclusions.includes(claim.toLowerCase()));

console.log('DRx Dose V3 canonical substance seed gate passed.');
