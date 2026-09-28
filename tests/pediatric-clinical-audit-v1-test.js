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
assert.equal(Object.keys(audit.drugs).length, 50, 'Current audit must contain exactly all 50 independently audited source drugs');
assert.equal(audit.wave2?.auditedDrugCount, 20);
assert.equal(audit.wave2?.addedDrugs?.length, 9);
assert.equal(audit.wave3?.auditedDrugCount, 29);
assert.equal(audit.wave3?.addedDrugs?.length, 9);
assert.equal(audit.wave4?.auditedDrugCount, 34);
assert.equal(audit.wave4?.addedDrugs?.length, 5);
assert.equal(audit.wave5?.auditedDrugCount, 50);
assert.equal(audit.wave5?.addedDrugs?.length, 16);
assert.equal(audit.wave6?.auditedDrugCount, 50);
assert.equal(audit.wave6?.kind, 'post-audit-clinical-hardening');

for (const [name, item] of Object.entries(audit.drugs)) {
  assert.ok(sourceTable.sections.some(section => section.drugs.some(drug => drug.name === name)), `${name}: audit target is not in the 50-drug source table`);
  assert.match(item.status, /^verified-/);
  assert.ok(item.badgeSq && item.summarySq);
  assert.ok(Array.isArray(item.sources) && item.sources.length, `${name}: authoritative source missing`);
  item.sources.forEach(source => {
    assert.ok(source.authority && source.title);
    assert.match(source.url, /^https:\/\//, `${name}: source URL must be HTTPS`);
  });
  assert.equal(item.calculator?.replace, true, `${name}: audited calculator must explicitly replace the source-table calculation`);
  if (item.calculator?.disabled) {
    assert.ok(item.calculator.reasonSq, `${name}: disabled calculator must explain why`);
  } else {
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
  }
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


// Wave 2 — high-use/high-risk additions.
const pipTazo = D['Piperacillin + Tazobactam'].calculator.options;
assert.equal(pipTazo.length, 2);
pipTazo.forEach(option => {
  assert.equal(option.route, 'injectable');
  assert.equal(option.componentBasis, 'piperacillin');
  assert.equal(option.rules[0].minMonths, 24);
  assert.equal(option.rules[0].maxMonths, 144);
  assert.equal(option.rules[0].maxInclusive, false);
  assert.equal(option.rules[0].maxPerDose, 4000);
});
assert.deepStrictEqual(pipTazo.map(option => option.rules[0].min), [100,80]);
assert.deepStrictEqual(D['Piperacillin + Tazobactam'].practicalFormulations, ['Vial – 4g piperacillin + 0.5g tazobactam']);

const meropenem = D.Meropenem.calculator.options;
assert.deepStrictEqual(meropenem.map(option => option.rules[0].min), [10,20,20,40]);
assert.deepStrictEqual(meropenem.map(option => option.rules[0].maxPerDose), [500,1000,1000,2000]);
meropenem.forEach(option => assert.equal(option.rules[0].minMonths, 3));
assert.deepStrictEqual(D.Meropenem.practicalFormulations, ['Vial – 500mg','Vial – 1g']);

const cotrimoxazole = D['Cotrimoxazole (TMP + SMZ)'].calculator.options;
cotrimoxazole.forEach(option => {
  assert.equal(option.componentBasis, 'TMP');
  assert.equal(option.rules[0].minMonths, 2);
});
assert.deepStrictEqual(cotrimoxazole.map(option => [option.rules[0].min,option.rules[0].max]), [[4,4],[4,4],[3.75,5]]);
assert.ok(D['Cotrimoxazole (TMP + SMZ)'].warningsSq.some(text => /BSA|mg\/m²/i.test(text)));
assert.deepStrictEqual(D['Cotrimoxazole (TMP + SMZ)'].practicalFormulations, ['Syp – 40/5']);

const azithromycin = D.Azithromycin.calculator.options;
assert.deepStrictEqual(azithromycin.map(option => option.rules[0].min), [10,5,10,12]);
assert.deepStrictEqual(azithromycin.map(option => option.rules[0].minMonths), [6,6,6,24]);
assert.deepStrictEqual(D.Azithromycin.practicalFormulations, ['Syp – 100/5','Syp – 200/5']);

const cefixime = D.Cefixime.calculator.options;
assert.deepStrictEqual(cefixime.map(option => option.rules[0].min), [8,4]);
assert.deepStrictEqual(cefixime.map(option => option.rules[0].maxPerDose), [400,200]);
cefixime.forEach(option => assert.equal(option.rules[0].minMonths, 6));
assert.deepStrictEqual(D.Cefixime.practicalFormulations, ['Syp – 100/5']);

const cefuroxime = D.Cefuroxime.calculator.options;
assert.deepStrictEqual(cefuroxime.map(option => option.rules[0].min), [10,15]);
assert.deepStrictEqual(cefuroxime.map(option => option.rules[0].maxPerDose), [125,250]);
cefuroxime.forEach(option => {
  assert.equal(option.route, 'oral');
  assert.equal(option.rules[0].minMonths, 3);
});
assert.deepStrictEqual(D.Cefuroxime.practicalFormulations, ['Syp – 125/5']);

const vancomycin = D.Vancomycin.calculator.options[0].rules;
assert.deepStrictEqual(
  vancomycin.map(rule => [rule.minMonths,rule.maxMonths ?? null,rule.min,rule.max,rule.frequency]),
  [
    [1,144,10,15,'çdo 6 orë · TDM'],
    [144,null,15,20,'çdo 8–12 orë · TDM'],
  ]
);
assert.equal(vancomycin[1].maxPerDose, 2000);
assert.ok(D.Vancomycin.warningsSq.some(text => /TDM/i.test(text)));
assert.deepStrictEqual(D.Vancomycin.practicalFormulations, ['Vial – 500mg','Vial – 1g']);

const acyclovir = D.Acyclovir.calculator.options[0].rules[0];
assert.deepStrictEqual(
  [acyclovir.minMonths,acyclovir.min,acyclovir.maxPerDose,acyclovir.frequency],
  [24,20,800,'4 herë/ditë · 5 ditë']
);
assert.equal(D.Acyclovir.calculator.options[0].route, 'oral');
assert.deepStrictEqual(D.Acyclovir.practicalFormulations, ['Tab – 200mg, 400mg, 800mg']);

const cetirizine = D.Cetirizine.calculator.options;
assert.deepStrictEqual(cetirizine.map(option => option.rules[0].min), [2.5,2.5,2.5,5,5]);
assert.deepStrictEqual(cetirizine.map(option => option.rules[0].max), [2.5,2.5,2.5,5,10]);
assert.deepStrictEqual(cetirizine.map(option => option.rules[0].minMonths), [6,12,24,24,72]);
assert.deepStrictEqual(D.Cetirizine.practicalFormulations, ['Syp – 5/5']);

const wave2Names = new Set(audit.wave2.addedDrugs);
[
  'Piperacillin + Tazobactam','Meropenem','Cotrimoxazole (TMP + SMZ)','Azithromycin',
  'Cefixime','Cefuroxime','Vancomycin','Acyclovir','Cetirizine'
].forEach(name => assert.ok(wave2Names.has(name), `Wave 2 manifest missing ${name}`));


// Wave 3 — additional common agents plus one explicit safety block.
const clarithromycin = D.Clarithromycin.calculator.options[0].rules[0];
assert.deepStrictEqual(
  [clarithromycin.minMonths,clarithromycin.min,clarithromycin.frequency,clarithromycin.maxPerDose],
  [6,7.5,'çdo 12 orë · 10 ditë',500]
);
assert.deepStrictEqual(D.Clarithromycin.practicalFormulations, ['Syp – 250/5']);

const cefpodoxime = D.Cefpodoxime.calculator.options;
assert.equal(cefpodoxime.length, 3);
assert.deepStrictEqual(
  cefpodoxime[0].rules.map(rule => [rule.minMonths,rule.min,rule.maxPerDose,rule.frequency]),
  [[2,5,200,'çdo 12 orë · 5 ditë']]
);
assert.deepStrictEqual(D.Cefpodoxime.practicalFormulations, ['Syp – 40/5']);

const ceftazidime = D.Ceftazidime.calculator.options;
assert.deepStrictEqual(ceftazidime.map(option => option.rules[0].min), [30,30,50]);
assert.deepStrictEqual(ceftazidime.map(option => option.rules[0].frequency), ['çdo 12 orë · IV','çdo 8 orë · IV','çdo 8 orë · IV']);
assert.equal(ceftazidime[1].rules[0].maxPerDay, 6000);
assert.deepStrictEqual(D.Ceftazidime.practicalFormulations, ['Vial – 1g']);

const albendazole = D.Albendazole.calculator.options;
assert.deepStrictEqual(albendazole.map(option => option.rules[0].min), [200,400]);
assert.deepStrictEqual(albendazole.map(option => option.rules[0].minMonths), [12,24]);
assert.deepStrictEqual(D.Albendazole.practicalFormulations, ['Syp – 400/10','Tab – 400mg']);

const ivermectin = D.Ivermectin.calculator.options[0].rules[0];
assert.deepStrictEqual([ivermectin.minKg,ivermectin.min,ivermectin.frequency], [15,0.2,'dozë e vetme · esëll me ujë']);
assert.deepStrictEqual(D.Ivermectin.practicalFormulations, []);

const levocetirizine = D.Levocetirizine.calculator.options[0].rules;
assert.deepStrictEqual(levocetirizine.map(rule => rule.min), [1.25,2.5,5]);
assert.deepStrictEqual(levocetirizine.map(rule => rule.minMonths), [6,72,144]);
assert.deepStrictEqual(D.Levocetirizine.practicalFormulations, ['Tab – 5mg']);

const hydroxyzine = D.Hydroxyzine.calculator.options;
assert.deepStrictEqual(hydroxyzine.map(option => [option.rules[0].min,option.rules[0].max]), [[5,15],[15,25]]);
hydroxyzine.forEach(option => {
  assert.equal(option.rules[0].maxDailyPerKg, 2);
  assert.equal(option.rules[0].maxPerDay, 100);
});
assert.ok(D.Hydroxyzine.warningsSq.some(text => /QT/i.test(text)));
assert.deepStrictEqual(D.Hydroxyzine.practicalFormulations, ['Tab – 25mg']);

const lansoprazole = D.Lansoprazole.calculator.options;
assert.equal(lansoprazole.length, 3);
assert.deepStrictEqual(
  lansoprazole[0].rules.map(rule => [rule.minMonths,rule.maxMonths,rule.minKg ?? null,rule.maxKg ?? null,rule.min]),
  [[12,144,null,30,15],[12,144,30,null,30]]
);
assert.deepStrictEqual(D.Lansoprazole.practicalFormulations, ['Cap – 15mg','Cap – 30mg']);

assert.equal(D.Ranitidine.status, 'verified-blocked');
assert.equal(D.Ranitidine.calculator.disabled, true);
assert.match(D.Ranitidine.calculator.reasonSq, /pezulluar/i);
assert.deepStrictEqual(D.Ranitidine.practicalFormulations, []);

const wave3Names = new Set(audit.wave3.addedDrugs);
[
  'Clarithromycin','Cefpodoxime','Ceftazidime','Albendazole','Ivermectin',
  'Levocetirizine','Hydroxyzine','Lansoprazole','Ranitidine'
].forEach(name => assert.ok(wave3Names.has(name), `Wave 3 manifest missing ${name}`));


// Wave 4 — common ED/primary-care symptomatic medicines and iron.
const ondansetron = D.Ondansetron.calculator.options[0].rules[0];
assert.deepStrictEqual([ondansetron.minMonths,ondansetron.min,ondansetron.maxPerDose], [6,0.15,8]);
assert.match(ondansetron.frequency, /dozë e vetme/);
assert.deepStrictEqual(D.Ondansetron.practicalFormulations, ['Syp – 4/5']);

const fexofenadine = D.Fexofenadine.calculator.options;
assert.deepStrictEqual(fexofenadine.map(option => option.rules[0].min), [30,60,180]);
assert.deepStrictEqual(D.Fexofenadine.practicalFormulations, []);

const salbutamol = D.Salbutamol.calculator.options;
assert.deepStrictEqual([salbutamol[0].rules[0].min,salbutamol[0].rules[0].max,salbutamol[0].rules[0].maxPerDose], [0.1,0.15,2.5]);
assert.equal(salbutamol[0].route, 'nebulized');
assert.deepStrictEqual(D.Salbutamol.practicalFormulations, ['Respiratory solution – 5mg/1ml','Respules – 2.5mg/2.5ml']);

const prednisolone = D.Prednisolone.calculator.options;
assert.deepStrictEqual(prednisolone[0].rules.map(rule => [rule.minMonths,rule.maxMonths,rule.min,rule.max]), [
  [0,24,10,10],[24,72,20,20],[72,216,30,40]
]);
assert.equal(prednisolone[1].rules[0].maxPerDose, 60);
assert.deepStrictEqual(D.Prednisolone.practicalFormulations, ['Syp – 5/5']);

const iron = D.Iron.calculator.options;
assert.deepStrictEqual(iron.map(option => option.rules[0].min), [3,6]);
assert.ok(iron.every(option => option.componentBasis === 'elemental iron'));
assert.deepStrictEqual(D.Iron.practicalFormulations, ['Dps – 20/1']);

const wave4Names = new Set(audit.wave4.addedDrugs);
['Ondansetron','Fexofenadine','Salbutamol','Prednisolone','Iron']
  .forEach(name => assert.ok(wave4Names.has(name), `Wave 4 manifest missing ${name}`));


// Wave 5 — complete the independent audit of every source-table medicine.
const ampicillin = D.Ampicillin.calculator.options;
assert.deepStrictEqual(ampicillin.map(option => [option.rules[0].minMonths,option.rules[0].maxMonths,option.rules[0].min,option.rules[0].frequency]), [
  [0,0.23,50,'çdo 12 orë · IM/IV'],
  [0.23,2,50,'çdo 8 orë · IM/IV'],
  [2,60,50,'çdo 6 orë · IM/IV'],
]);
assert.deepStrictEqual(D.Ampicillin.practicalFormulations, ['Vial – 500mg','Vial – 1g']);

const cloxacillin = D.Cloxacillin.calculator.options[0].rules[0];
assert.deepStrictEqual([cloxacillin.minMonths,cloxacillin.min,cloxacillin.max,cloxacillin.maxPerDose], [1,25,50,2000]);
assert.deepStrictEqual(D.Cloxacillin.practicalFormulations, []);

const penicillinG = D['Penicillin G'].calculator.options;
assert.deepStrictEqual(penicillinG.map(option => option.rules[0].min), [50000,100000]);
assert.ok(penicillinG.every(option => option.rules[0].unit === 'U'));
assert.deepStrictEqual(D['Penicillin G'].practicalFormulations, ['Vial – 1 million U']);

const levofloxacin = D.Levofloxacin.calculator.options;
assert.equal(levofloxacin.length, 2);
levofloxacin.forEach(option => {
  assert.equal(option.route, 'oral_or_injectable');
  assert.deepStrictEqual(option.rules.map(rule => rule.min), [8,500]);
  assert.equal(option.rules[0].maxPerDose, 250);
});
assert.deepStrictEqual(D.Levofloxacin.practicalFormulations, ['Infusion – 5mg/1ml']);

const amikacin = D.Amikacin.calculator.options;
assert.deepStrictEqual(amikacin.map(option => option.rules[0].min), [10,7.5,7.5,5]);
assert.equal(amikacin[1].rules[0].maxDailyPerKg, 15);
assert.equal(amikacin[2].rules[0].maxDailyPerKg, 15);
assert.equal(amikacin[2].rules[0].maxPerDay, 1500);
assert.ok(D.Amikacin.warningsSq.some(text => /peak|trough|TDM/i.test(text)));
assert.deepStrictEqual(D.Amikacin.practicalFormulations, ['Vial – 500mg/2ml']);

const gentamicin = D.Gentamicin.calculator.options;
assert.deepStrictEqual(gentamicin.map(option => [option.rules[0].minMonths,option.rules[0].maxMonths,option.rules[0].min,option.rules[0].max]), [
  [0,0.23,2.5,2.5],
  [0.23,1,2.5,2.5],
  [1,216,2,2.5],
]);
assert.ok(gentamicin.every(option => /TDM/.test(option.rules[0].frequency)));
assert.deepStrictEqual(D.Gentamicin.practicalFormulations, ['Vial – 40mg/1ml']);

assert.equal(D.Cefoperazone.status, 'verified-blocked');
assert.equal(D.Cefoperazone.calculator.disabled, true);
assert.match(D.Cefoperazone.calculator.reasonSq, /raporti|2:1|1:1/i);
assert.deepStrictEqual(D.Cefoperazone.practicalFormulations, []);

const cefotaxime = D.Cefotaxime.calculator.options[0].rules[0];
assert.deepStrictEqual([cefotaxime.minMonths,cefotaxime.min,cefotaxime.frequency], [1,50,'çdo 6 orë · IV']);
assert.deepStrictEqual(D.Cefotaxime.practicalFormulations, ['Vial – 1g']);

const colistin = D.Colistin.calculator.options;
assert.deepStrictEqual(
  [colistin[0].rules[0].min,colistin[0].rules[0].max,colistin[0].rules[0].unit,colistin[0].rules[0].period,colistin[0].rules[0].split],
  [75000,150000,'U','day',3]
);
assert.deepStrictEqual(
  [colistin[1].rules[0].min,colistin[1].rules[0].unit,colistin[1].rules[0].period,colistin[1].rules[0].split],
  [9000000,'U','day',3]
);
assert.deepStrictEqual(D.Colistin.practicalFormulations, ['Vial – 1 million U']);
assert.ok(D.Colistin.warningsSq.some(text => /IU|CBA|CMS/i.test(text)));

const doxycycline = D.Doxycycline.calculator.options;
assert.deepStrictEqual(doxycycline.map(option => option.rules[0].min), [2.2,100]);
assert.equal(doxycycline[0].rules[0].maxPerDose, 100);
assert.deepStrictEqual(D.Doxycycline.practicalFormulations, ['Tab – 100mg']);

const dec = D.DEC.calculator.options[0].rules[0];
assert.deepStrictEqual([dec.minMonths,dec.minInclusive,dec.min,dec.period], [18,false,6,'day']);
assert.deepStrictEqual(D.DEC.practicalFormulations, []);

const diclofenac = D.Diclofenac.calculator.options;
assert.deepStrictEqual(diclofenac.map(option => [option.rules[0].min,option.rules[0].max]), [[1,3],[1,2]]);
assert.ok(diclofenac.every(option => option.rules[0].period === 'day'));
assert.ok(diclofenac.every(option => option.route === 'rectal'));
assert.deepStrictEqual(D.Diclofenac.practicalFormulations, ['Supp – 12.5mg','Supp – 25mg']);

const mefenamic = D['Mefenamic acid'].calculator.options[0].rules[0];
assert.deepStrictEqual([mefenamic.minMonths,mefenamic.minInclusive,mefenamic.min,mefenamic.period,mefenamic.split], [6,false,25,'day',3]);
assert.match(mefenamic.frequency, /doza të ndara/);
assert.match(mefenamic.noteSq, /÷3|TID/);
assert.deepStrictEqual(D['Mefenamic acid'].practicalFormulations, ['Syp – 250/5']);

const cpm = D.CPM.calculator.options[0].rules;
assert.deepStrictEqual(cpm.map(rule => [rule.minMonths,rule.maxMonths,rule.min,rule.maxPerDay]), [
  [12,24,1,2],[24,72,1,6],[72,144,2,12],[144,216,4,24]
]);
assert.deepStrictEqual(D.CPM.practicalFormulations, ['Syp – 2/5']);

const levoSalbutamol = D['Levo salbutamol'].calculator.options;
assert.deepStrictEqual(levoSalbutamol.map(option => option.rules[0].min), [0.31,0.63,0.63,1.25]);
assert.ok(levoSalbutamol.every(option => option.route === 'nebulized'));
assert.deepStrictEqual(D['Levo salbutamol'].practicalFormulations, []);

assert.equal(D.Calcium.status, 'verified-blocked');
assert.equal(D.Calcium.calculator.disabled, true);
assert.match(D.Calcium.calculator.reasonSq, /indikacionin|kripën|elementar/i);
assert.deepStrictEqual(D.Calcium.practicalFormulations, []);

const wave5Names = new Set(audit.wave5.addedDrugs);
[
  'Ampicillin','Cloxacillin','Penicillin G','Levofloxacin','Amikacin','Gentamicin',
  'Cefoperazone','Cefotaxime','Colistin','Doxycycline','DEC','Diclofenac',
  'Mefenamic acid','CPM','Levo salbutamol','Calcium'
].forEach(name => assert.ok(wave5Names.has(name), `Wave 5 manifest missing ${name}`));

assert.equal(new Set([
  ...Object.keys(audit.drugs)
]).size, 50, 'Every source-table medicine must have exactly one audit record');
sourceTable.sections.flatMap(section => section.drugs)
  .forEach(drug => assert.ok(D[drug.name], `Missing independent audit: ${drug.name}`));

console.log('PASS: pediatric clinical audit v1-wave6 independently audits all 50 source drugs with hardened route, dose and blocked-AUTO semantics');
