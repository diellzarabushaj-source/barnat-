'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const audit = JSON.parse(read('data/pediatric-clinical-audit-v1.json'));
const sourceTable = JSON.parse(read('data/pediatric-common-drugs-reference.json'));

assert.equal(audit.schemaVersion, 'pediatric-clinical-audit-v1');
assert.equal(audit.auditedAt, '2026-09-28');
assert.equal(audit.defaultStatus, 'source-table');
assert.equal(Object.keys(audit.drugs).length, 11, 'Wave 1 must contain exactly 11 independently verified drugs');

for (const [name, item] of Object.entries(audit.drugs)) {
  assert.ok(sourceTable.sections.some(section => section.drugs.some(drug => drug.name === name)), `${name}: audit target is not in the 50-drug source table`);
  assert.match(item.status, /^verified-/);
  assert.ok(item.badgeSq && item.summarySq);
  assert.ok(Array.isArray(item.sources) && item.sources.length, `${name}: authoritative source missing`);
  item.sources.forEach(source => {
    assert.ok(source.authority && source.title);
    assert.match(source.url, /^https:\/\//, `${name}: source URL must be HTTPS`);
  });
  assert.equal(item.calculator?.replace, true, `${name}: verified calculator must explicitly replace the source-table calculation`);
  assert.ok(Array.isArray(item.calculator?.options) && item.calculator.options.length, `${name}: verified calculator options missing`);
  item.calculator.options.forEach(option => {
    assert.equal(option.mode, 'clinicalRules', `${name}: verified options must use clinicalRules`);
    assert.ok(Array.isArray(option.rules) && option.rules.length, `${name}: verified rule set empty`);
    option.rules.forEach(rule => {
      assert.ok(['weight','fixed'].includes(rule.doseType), `${name}: bad doseType`);
      assert.ok(Number.isFinite(rule.min) && Number.isFinite(rule.max));
      assert.ok(rule.unit && rule.period && rule.frequency && rule.source);
    });
  });
  assert.ok(item.kosovoMarket?.checkedAt === '2026-09-28', `${name}: Kosovo market check date missing`);
  assert.ok(item.kosovoMarket?.summarySq, `${name}: Kosovo market note missing`);
}

const D = audit.drugs;

assert.deepStrictEqual(
  D.Amoxicillin.calculator.options.map(option => [option.rules[0].min, option.rules[0].frequency, option.rules[0].maxPerDose]),
  [[25,'2 herë/ditë',1000],[30,'3 herë/ditë',1000]]
);

for (const option of D['Amoxicillin + Clavulanic'].calculator.options) {
  assert.equal(option.componentBasis, 'amoxicillin');
  assert.equal(option.route, 'oral');
}
assert.deepStrictEqual(D['Amoxicillin + Clavulanic'].calculator.options.map(option => option.rules[0].min), [25,50]);

const cephalexin = D.Cephalexin.calculator.options[0].rules;
assert.deepStrictEqual(cephalexin.map(rule => [rule.minMonths ?? null, rule.maxMonths ?? null, rule.min, rule.max, rule.frequency]), [
  [0,0.23,25,25,'2 herë/ditë'],
  [0.23,1,25,25,'3 herë/ditë'],
  [1,144,12.5,25,'2 herë/ditë'],
  [144,null,1000,1000,'2 herë/ditë'],
]);
assert.deepStrictEqual(D.Cephalexin.practicalFormulations, ['Syp – 250/5']);

const ceftriaxone = D.Ceftriaxone.calculator.options;
assert.equal(ceftriaxone.length, 3);
ceftriaxone.forEach(option => option.rules.forEach(rule => assert.equal(rule.minMonths, 1, 'Ceftriaxone must fail closed below 1 month')));
assert.deepStrictEqual(
  [ceftriaxone[0].rules[0].min,ceftriaxone[0].rules[0].max,ceftriaxone[0].rules[0].maxPerDose,ceftriaxone[0].rules[0].maxPerDay],
  [25,37.5,1000,2000]
);
assert.deepStrictEqual(
  [ceftriaxone[1].rules[0].min,ceftriaxone[1].rules[0].maxPerDose,ceftriaxone[1].rules[0].maxPerDay],
  [50,2000,4000]
);
assert.deepStrictEqual(
  [ceftriaxone[2].rules[0].min,ceftriaxone[2].rules[0].frequency,ceftriaxone[2].rules[0].maxPerDose],
  [50,'dozë e vetme IM',1000]
);

const oseltamivir = D.Oseltamivir.calculator.options[0].rules;
assert.deepStrictEqual(oseltamivir.map(rule => rule.min), [3,30,45,60,75]);
assert.equal(oseltamivir[0].maxMonths, 12);
assert.equal(oseltamivir[0].frequency, '2 herë/ditë · 5 ditë');
assert.deepStrictEqual(D.Oseltamivir.practicalFormulations, [], 'No Kosovo oseltamivir product was confirmed in the current registry query');

const linezolid = D.Linezolid.calculator.options[0].rules;
assert.equal(linezolid[0].minMonths, 0.23, 'First 7 days must fail closed without neonatal gestational-age context');
assert.deepStrictEqual([linezolid[0].min,linezolid[0].frequency,linezolid[0].maxPerDose], [10,'çdo 8 orë',600]);
assert.deepStrictEqual([linezolid[1].minMonths,linezolid[1].min,linezolid[1].frequency], [144,600,'çdo 12 orë']);
assert.deepStrictEqual(D.Linezolid.practicalFormulations, ['Infusion – 2mg/1ml']);

const pantoprazole = D.Pantoprazole.calculator.options[0].rules;
assert.deepStrictEqual(pantoprazole.map(rule => rule.min), [0.8,10,10,20,40]);
pantoprazole.filter(rule => rule.maxMonths === 216).forEach(rule => assert.equal(rule.maxInclusive, false));

const domperidone = D.Domperidone.calculator.options[0].rules[0];
assert.deepStrictEqual([domperidone.min,domperidone.maxDailyPerKg,domperidone.maxKg], [0.25,0.75,35]);
assert.deepStrictEqual(D.Domperidone.practicalFormulations, []);

const montelukast = D.Montelukast.calculator.options[0].rules;
assert.deepStrictEqual(montelukast.map(rule => rule.min), [4,4,5,10]);
assert.ok(D.Montelukast.warningsSq.some(text => /neuropsikiatrike/i.test(text)));
assert.deepStrictEqual(D.Montelukast.practicalFormulations, []);

const paracetamol = D.Paracetamol.calculator.options[0].rules;
assert.deepStrictEqual([paracetamol[0].min,paracetamol[0].maxDailyPerKg], [10,40]);
assert.deepStrictEqual([paracetamol[1].min,paracetamol[1].maxDailyPerKg,paracetamol[1].maxPerDose], [15,60,1000]);
assert.deepStrictEqual(D.Paracetamol.practicalFormulations, ['Syp – 120/5, 250/5']);

const ibuprofen = D.Ibuprofen.calculator.options[0].rules[0];
assert.deepStrictEqual([ibuprofen.minMonths,ibuprofen.minInclusive,ibuprofen.min,ibuprofen.max,ibuprofen.maxDailyPerKg], [3,false,5,10,30]);

console.log('PASS: pediatric clinical audit v1 pins authoritative regimens, safety boundaries and Kosovo-market practical forms');
