'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../antibiotiket-catalog-core.js');
require('../antibiotiket-catalog-data.js');
const data = globalThis.DRX_ANTIBIOTIC_CATALOG;

test('catalog preserves every audited Mayo regimen and unique AKPPM example', () => {
  assert.equal(data.antibiotics.length, 38);
  assert.equal(data.antibiotics.reduce((n, a) => n + a.regimens.length, 0), 290);
  assert.equal(data.antibiotics.reduce((n, a) => n + a.products.length, 0), 265);
  assert.equal(new Set(data.antibiotics.map(a => a.atc)).size, 38);
  assert.equal(new Set(data.antibiotics.flatMap(a => a.products.map(p => p.registration))).size, 265);
  assert.equal(data.antibiotics.every(a => a.group && a.subgroup && a.indications.length > 0), true);
});

test('all sourced dosages remain unapproved for calculation', () => {
  assert.equal(data.clinicalApprovedCount, 0);
  for (const drug of data.antibiotics) {
    for (const regimen of drug.regimens) {
      assert.equal(core.isCalculatorApproved(regimen), false, regimen.id);
      assert.equal(regimen.calculatorApproved, false, regimen.id);
      assert.match(regimen.qaStatus, /^(BLLOKUAR \/ VERIFIKO|RISHIKIM KLINIK)$/);
    }
  }
});

test('beta-lactam classes, searching and indication filters work', () => {
  const amox = data.antibiotics.find(a => a.name === 'Amoxicillin');
  const ceph = data.antibiotics.find(a => a.name === 'Ceftriaxone');
  assert.equal(amox.group, 'Beta-laktamë');
  assert.equal(amox.subgroup, 'Aminopenicilina');
  assert.equal(ceph.subgroup, 'Cefalosporina III');
  assert.equal(core.filterAntibiotics(data.antibiotics, {search:'amoxicillin'}).some(a => a.atc === 'J01CA04'), true);
  assert.equal(core.filterAntibiotics(data.antibiotics, {group:'Beta-laktamë'}).every(a => a.group === 'Beta-laktamë'), true);
  assert.equal(core.filterAntibiotics(data.antibiotics, {indication:amox.indications[0]}).some(a => a.atc === amox.atc), true);
  assert.equal(core.filterAntibiotics(data.antibiotics, {route:'TOP'}).some(a => a.name === 'Mupirocin'), true);
});

test('user selection is just a personal filter, invalid storage is discarded', () => {
  const allowed = data.antibiotics.map(a => a.atc);
  assert.deepEqual(core.readSelected(JSON.stringify(['J01CA04', 'J01CA04', 'INVALID']), allowed), ['J01CA04']);
  assert.deepEqual(core.readSelected('not json', allowed), []);
  const selected = core.filterAntibiotics(data.antibiotics, {selectedOnly:true}, ['J01CA04']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].name, 'Amoxicillin');
});

test('critical dose conflicts from Mayo remain explicitly blocked', () => {
  const cefuroxime = data.antibiotics.find(a => a.name === 'Cefuroxime');
  for (const id of ['M065','M066']) {
    const regimen = cefuroxime.regimens.find(r => r.id === id);
    assert.equal(regimen.qaStatus, 'BLLOKUAR / VERIFIKO');
    assert.match(regimen.qaReason, /FDA/);
    assert.equal(regimen.calculatorApproved, false);
  }
});
