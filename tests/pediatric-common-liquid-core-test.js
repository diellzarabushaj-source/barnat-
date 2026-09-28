'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Liquid = require('../pediatric-common-liquid-core.js');

const ROOT = path.resolve(__dirname, '..');
const reference = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pediatric-common-drugs-reference.json'), 'utf8'));

function drug(name) {
  for (const section of reference.sections) {
    const found = section.drugs.find(item => item.name === name);
    if (found) return found;
  }
  throw new Error(`Drug not found: ${name}`);
}
function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

const amoxicillin = drug('Amoxicillin');
const amoxPresentations = Liquid.presentationsFor(amoxicillin, amoxicillin.calc[0]);
assert.deepStrictEqual(
  amoxPresentations.map(item => [item.form, item.mg, item.mL]),
  [['Shurup',125,5],['Shurup',250,5],['Pika',100,1]]
);
const amoxVolumes = Liquid.volumeConversions({
  doseMin:180, doseMax:180, doseUnit:'mg', dosePeriod:'dose',
  perDoseMin:180, perDoseMax:180, frequency:'q8h',
}, amoxPresentations);
close(amoxVolumes[0].volumeMin, 7.2);
close(amoxVolumes[1].volumeMin, 3.6);
close(amoxVolumes[2].volumeMin, 1.8);

const coAmox = drug('Amoxicillin + Clavulanic');
const coAmoxPresentations = Liquid.presentationsFor(coAmox, coAmox.calc[0]);
assert.deepStrictEqual(
  coAmoxPresentations.map(item => [item.form, item.mg, item.mL, item.componentBasis]),
  [
    ['Shurup',200,5,'amoxicillin'],
    ['Shurup',400,5,'amoxicillin'],
    ['Pika',80,1,'amoxicillin'],
  ]
);
const coAmoxVolumes = Liquid.volumeConversions({
  doseMin:180, doseMax:180, doseUnit:'mg', dosePeriod:'dose',
  perDoseMin:180, perDoseMax:180, frequency:'q8h',
}, coAmoxPresentations);
close(coAmoxVolumes[0].volumeMin, 4.5);
close(coAmoxVolumes[1].volumeMin, 2.25);
close(coAmoxVolumes[2].volumeMin, 2.25);

const cotrim = drug('Cotrimoxazole (TMP + SMZ)');
const cotrimPresentations = Liquid.presentationsFor(cotrim, cotrim.calc[0]);
assert.deepStrictEqual(
  cotrimPresentations.map(item => [item.mg, item.mL, item.componentBasis]),
  [[40,5,'TMP']]
);

const paracetamol = drug('Paracetamol');
const paraPresentations = Liquid.presentationsFor(paracetamol, paracetamol.calc[0]);
assert.equal(paraPresentations.some(item => item.kind === 'injectable'), false);
assert.deepStrictEqual(
  paraPresentations.map(item => [item.form, item.mg, item.mL]),
  [['Shurup',125,5],['Shurup',250,5],['Pika',100,1]]
);

const salbutamol = drug('Salbutamol');
const nebPresentations = Liquid.presentationsFor(salbutamol, salbutamol.calc[1]);
assert.equal(nebPresentations.some(item => item.kind === 'oral'), false);
assert.deepStrictEqual(
  nebPresentations.map(item => [item.form, item.mg, item.mL]),
  [['Solucion respirator',5,1],['Respule',2.5,2.5]]
);

const levo = drug('Levo salbutamol');
const levoNeb = Liquid.presentationsFor(levo, levo.calc[1]);
assert.deepStrictEqual(
  levoNeb.map(item => [item.form, item.mg, item.mL]),
  [['Respule',0.63,2.5]]
);
assert.equal(levoNeb.some(item => Math.abs(item.mg - 0.5) < 1e-9), false, 'Duolin ipratropium component must never be parsed as levo-salbutamol');

const amikacin = drug('Amikacin');
const amikacinPresentations = Liquid.presentationsFor(amikacin, amikacin.calc[0]);
assert.deepStrictEqual(amikacinPresentations.map(item => [item.form,item.mg,item.mL]), [['Vial',125,1]]);

const daily = Liquid.volumeConversions({
  doseMin:600, doseMax:600, doseUnit:'mg', dosePeriod:'day',
  perDoseMin:200, perDoseMax:200, frequency:'q8h',
}, [{kind:'oral',form:'Shurup',mg:100,mL:5,source:'Syp – 100/5'}]);
assert.equal(daily[0].basis, 'dose');
close(daily[0].volumeMin, 10);

const dailyUnsplit = Liquid.volumeConversions({
  doseMin:600, doseMax:600, doseUnit:'mg', dosePeriod:'day', frequency:'q6-8hr',
}, [{kind:'oral',form:'Shurup',mg:100,mL:5,source:'Syp – 100/5'}]);
assert.equal(dailyUnsplit[0].basis, 'day');
close(dailyUnsplit[0].volumeMin, 30);

const units = Liquid.volumeConversions({
  doseMin:50000, doseMax:50000, doseUnit:'U', dosePeriod:'dose',
  perDoseMin:50000, perDoseMax:50000,
}, [{kind:'injectable',form:'Vial',mg:100,mL:1,source:'x'}]);
assert.deepStrictEqual(units, []);


// Audited piperacillin/tazobactam component strength may be converted only when
// the piperacillin component is explicit.
{
  const audited = {
    ...drug('Piperacillin + Tazobactam'),
    formulations:['Vial – 4g piperacillin + 0.5g tazobactam'],
  };
  const option = { route:'injectable', componentBasis:'piperacillin', label:'cIAI' };
  const items = Liquid.vialConversions({
    doseMin:1200,doseMax:1200,doseUnit:'mg',dosePeriod:'dose',
    perDoseMin:1200,perDoseMax:1200,frequency:'q8h',
  }, audited, option);
  assert.equal(items.length, 1);
  assert.equal(items[0].componentBasis, 'piperacillin');
  assert.equal(items[0].amount, 4000);
  assert.equal(items[0].convertible, true);
  close(items[0].vialMin, 0.3);
}

// The legacy total-only 4.5 g notation remains fail-closed.
{
  const legacy = drug('Piperacillin + Tazobactam');
  const item = Liquid.vialConversions({
    doseMin:1200,doseMax:1200,doseUnit:'mg',dosePeriod:'dose',
    perDoseMin:1200,perDoseMax:1200,frequency:'q8h',
  }, legacy, { route:'injectable', label:'cIAI' })[0];
  assert.equal(item.convertible, false);
  assert.match(item.reason, /4,5 g total|ndarjen piperacilinë\/tazobaktam/i);
}

// Infusion is an injectable formulation and oral_or_injectable accepts it.
{
  const linezolid = {
    ...drug('Linezolid'),
    formulations:['Infusion – 2mg/1ml'],
  };
  const option = { route:'oral_or_injectable', label:'Serious infection' };
  const route = Liquid.optionAudit(linezolid, option);
  assert.equal(route.ok, true);
  const presentations = Liquid.presentationsFor(linezolid, option);
  assert.deepStrictEqual(
    presentations.map(item => [item.kind,item.form,item.mg,item.mL]),
    [['injectable','Infuzion',2,1]]
  );
  const volumes = Liquid.volumeConversions({
    doseMin:120,doseMax:120,doseUnit:'mg',dosePeriod:'dose',
    perDoseMin:120,perDoseMax:120,frequency:'q8h',
  }, presentations);
  close(volumes[0].volumeMin, 60);
}

console.log('PASS: pediatric liquid conversion safely derives practical mL outputs from source formulations');
