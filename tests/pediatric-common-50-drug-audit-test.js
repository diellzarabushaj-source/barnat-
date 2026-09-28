'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../pediatric-common-liquid-core.js');

const ROOT = path.resolve(__dirname, '..');
const reference = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-common-drugs-reference.json'), 'utf8'));

const expectedNames = [
  'Amoxicillin','Amoxicillin + Clavulanic','Ampicillin','Cloxacillin','Penicillin G',
  'Piperacillin + Tazobactam','Meropenem','Cotrimoxazole (TMP + SMZ)','Azithromycin','Clarithromycin',
  'Levofloxacin','Amikacin','Gentamicin','Cefixime','Cefpodoxime','Cefoperazone','Cefotaxime',
  'Ceftazidime','Ceftriaxone','Cefuroxime','Cephalexin','Colistin','Doxycycline','Linezolid','Vancomycin',
  'Albendazole','DEC','Ivermectin','Diclofenac','Ibuprofen','Mefenamic acid','Paracetamol','Domperidone',
  'Ondansetron','Cetirizine','CPM','Fexofenadine','Levocetirizine','Hydroxyzine','Acyclovir','Oseltamivir',
  'Salbutamol','Levo salbutamol','Montelukast','Prednisolone','Pantoprazole','Lansoprazole','Ranitidine',
  'Iron','Calcium',
];

const drugs = reference.sections.flatMap(section => section.drugs);
assert.equal(drugs.length, 50, 'Reference must stay at exactly 50 drugs');
assert.deepStrictEqual(drugs.map(drug => drug.name), expectedNames, 'The audited 50-drug set changed');

const allowedModes = new Set(['weight','ageBands','ageWeight','ageFixed','oseltamivirBands','fixed']);
const allowedStatuses = new Set([
  'auto-ml','vial-equivalent','needs-product','route-mismatch','solid','device','manual-combination',
]);

for (const [sectionIndex, section] of reference.sections.entries()) {
  assert.notEqual(Core.sectionTitleSq(section.title), section.title, `Section ${section.roman} must have an Albanian display label`);
  assert.ok(Core.sectionTitleSq(section.title).trim(), `Section ${section.roman} Albanian title is empty`);

  for (const drug of section.drugs) {
    assert.ok(Array.isArray(drug.dose) && drug.dose.length, `${drug.name}: source dose is missing`);
    assert.ok(Array.isArray(drug.formulations) && drug.formulations.length, `${drug.name}: source formulations are missing`);
    assert.ok(Array.isArray(drug.calc) && drug.calc.length, `${drug.name}: calculator options are missing`);

    drug.calc.forEach((option, optionIndex) => {
      assert.ok(allowedModes.has(option.mode), `${drug.name} option ${optionIndex + 1}: unsupported mode ${option.mode}`);
      const states = Core.formulationAudit(drug, option);
      assert.equal(states.length, drug.formulations.length, `${drug.name}: every source formulation line must have one audit state`);
      states.forEach(state => {
        assert.ok(allowedStatuses.has(state.status), `${drug.name}: unclassified formulation ${state.source}`);
        assert.ok(state.display && state.display.trim(), `${drug.name}: translated formulation text is empty`);
      });
    });

    drug.dose.forEach(line => {
      const sq = Core.doseTextSq(line);
      assert.ok(sq.trim(), `${drug.name}: translated dose is empty`);
      assert.doesNotMatch(sq, /Same as|Pneumonia|Meningitis|Prophylaxis|Can give upto|Half dose of|Nebulisation|\bOral\b|single dose|next 4 days/i,
        `${drug.name}: English clinical wording leaked into the Albanian dose display: ${sq}`);
    });

    drug.formulations.forEach(line => {
      const sq = Core.formulationTextSq(line);
      assert.ok(sq.trim(), `${drug.name}: translated formulation is empty`);
      assert.doesNotMatch(sq, /\b(?:Syp|Cap|Dps|Respules?|Injection|Ampoule)\b/i,
        `${drug.name}: source shorthand leaked into the Albanian formulation display: ${sq}`);
    });

    process.stdout.write(`PASS pediatric drug ${String(sectionIndex + 1).padStart(2, '0')}.${String(drug.no).padStart(2, '0')} — ${drug.name}\n`);
  }
}

function findDrug(name) {
  const found = drugs.find(drug => drug.name === name);
  assert.ok(found, `Missing ${name}`);
  return found;
}

// Exact screenshot regression: co-amoxiclav vial must be visible, but the
// pneumonia formula does not specify IV/IM and the source gives no
// reconstitution volume, so an automatic mL must be blocked rather than guessed.
{
  const drug = findDrug('Amoxicillin + Clavulanic');
  const option = drug.calc[1];
  const items = Core.vialConversions({
    doseMin:800,doseMax:900,doseUnit:'mg',dosePeriod:'day',frequency:'',
  }, drug, option);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'Vial – 1.2g (1000 Amox + 200 Clav)');
  assert.equal(items[0].amount, 1000);
  assert.equal(items[0].componentBasis, 'amoxicillin');
  assert.equal(items[0].convertible, false);
  assert.match(items[0].reason, /nuk e specifikon rrugën IV\/IM/);
}

// Dry vials with an unambiguous active strength get a vial-equivalent, never
// an invented post-reconstitution mL.
{
  const meropenem = findDrug('Meropenem');
  const item = Core.vialConversions({
    doseMin:400,doseMax:400,doseUnit:'mg',dosePeriod:'dose',perDoseMin:400,perDoseMax:400,frequency:'q8h',
  }, meropenem, meropenem.calc[0])[0];
  assert.equal(item.convertible, true);
  assert.equal(item.vialMin, 0.4);
  assert.equal(item.vialMax, 0.4);

  const penicillin = findDrug('Penicillin G');
  const unitItem = Core.vialConversions({
    doseMin:50000,doseMax:50000,doseUnit:'U',dosePeriod:'dose',perDoseMin:50000,perDoseMax:50000,frequency:'q6h',
  }, penicillin, penicillin.calc[0])[0];
  assert.equal(unitItem.convertible, true);
  assert.equal(unitItem.vialMin, 0.1);
}

// Component-explicit combination vials are tied to the named component.
{
  const cefoperazone = findDrug('Cefoperazone');
  const item = Core.vialConversions({
    doseMin:500,doseMax:500,doseUnit:'mg',dosePeriod:'dose',perDoseMin:500,perDoseMax:500,frequency:'BD',
  }, cefoperazone, cefoperazone.calc[0])[0];
  assert.equal(item.amount, 1000);
  assert.equal(item.componentBasis, 'cefoperazone');
  assert.equal(item.vialMin, 0.5);
}

// Total-only combination strength is deliberately fail-closed.
{
  const pipTazo = findDrug('Piperacillin + Tazobactam');
  const item = Core.vialConversions({
    doseMin:1000,doseMax:1000,doseUnit:'mg',dosePeriod:'dose',perDoseMin:1000,perDoseMax:1000,frequency:'q8h',
  }, pipTazo, pipTazo.calc[0])[0];
  assert.equal(item.convertible, false);
  assert.match(item.reason, /4,5 g total|ndarjen piperacilinë\/tazobaktam/);
}

// Route-specific source gaps are explicit. Linezolid says infusion but the
// supplied formulation list contains only syrup/tablet.
{
  const linezolid = findDrug('Linezolid');
  const route = Core.optionAudit(linezolid, linezolid.calc[0]);
  assert.equal(route.ok, false);
  assert.equal(route.wanted, 'injectable');
  assert.match(route.message, /nuk jep një formulim të përputhshëm/);
}

// Known injectable concentrations remain true mL conversions.
{
  const amikacin = findDrug('Amikacin');
  const presentations = Core.presentationsFor(amikacin, amikacin.calc[0]);
  assert.deepStrictEqual(presentations.map(item => [item.form,item.mg,item.mL]), [['Vial',125,1]]);

  const ranitidine = findDrug('Ranitidine');
  const iv = Core.presentationsFor(ranitidine, ranitidine.calc[1]);
  assert.deepStrictEqual(iv.map(item => [item.form,item.mg,item.mL]), [['Injeksion',25,1]]);
}

console.log('PASS: all 50 pediatric drugs are individually classified, translated and formulation-audited');
