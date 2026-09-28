'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../pediatric-common-liquid-core.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const audit = JSON.parse(read('data/pediatric-clinical-audit-v1.json'));
const source = JSON.parse(read('data/pediatric-common-drugs-reference.json'));
const sourceMap = new Map(source.sections.flatMap(section => section.drugs).map(drug => [drug.name, drug]));

const allowedStatuses = new Set(['auto-ml','vial-equivalent','solid','route-mismatch']);
const expectedRouteMismatchDrugs = new Set(['Amoxicillin + Clavulanic','Pantoprazole']);

let active = 0;
let blocked = 0;
let auditedOptions = 0;
let auditedFormulationRows = 0;
const routeMismatchDrugs = new Set();
const statusCounts = {};

for (const [name, item] of Object.entries(audit.drugs)) {
  const base = sourceMap.get(name);
  assert.ok(base, `${name}: missing source-table row`);

  if (item.calculator?.disabled) {
    blocked += 1;
    assert.deepStrictEqual(item.practicalFormulations || [], [], `${name}: blocked calculators may not expose practical AUTO formulations`);
    continue;
  }

  active += 1;
  assert.ok(Array.isArray(item.calculator?.options) && item.calculator.options.length, `${name}: active audit has no calculator options`);

  const practical = Object.prototype.hasOwnProperty.call(item, 'practicalFormulations')
    ? item.practicalFormulations
    : base.formulations;
  assert.ok(Array.isArray(practical), `${name}: practical formulations must be an array`);

  const drug = { ...base, formulations: practical };

  for (const [optionIndex, option] of item.calculator.options.entries()) {
    auditedOptions += 1;
    const states = Core.formulationAudit(drug, option);
    assert.equal(states.length, practical.length, `${name} option ${optionIndex + 1}: every practical formulation must have exactly one audit state`);

    states.forEach(state => {
      auditedFormulationRows += 1;
      statusCounts[state.status] = (statusCounts[state.status] || 0) + 1;
      assert.ok(allowedStatuses.has(state.status), `${name} option ${optionIndex + 1}: unsafe/unclassified formulation state "${state.status}" for ${state.source}`);
      assert.notEqual(state.status, 'unknown', `${name}: unknown practical formulation`);
      assert.notEqual(state.status, 'needs-product', `${name}: an audited practical formulation still needs unidentified product data`);
      assert.notEqual(state.status, 'manual-combination', `${name}: audited practical combination lacks component-safe binding`);
      if (state.status === 'route-mismatch') routeMismatchDrugs.add(name);
    });
  }
}

assert.equal(active, 47);
assert.equal(blocked, 3);
assert.deepStrictEqual([...routeMismatchDrugs].sort(), [...expectedRouteMismatchDrugs].sort(),
  'Only deliberate oral-vs-injectable alternatives may remain as route-mismatch rows');

assert.ok((statusCounts['auto-ml'] || 0) > 0, 'No automatic mL formulation survived audit');
assert.ok((statusCounts['vial-equivalent'] || 0) > 0, 'No component-safe vial formulation survived audit');
assert.ok((statusCounts['solid'] || 0) > 0, 'No solid practical formulation is represented');
assert.ok(auditedOptions >= 47, 'Every active medicine must contribute at least one audited option');
assert.ok(auditedFormulationRows > 0);

console.log(
  `PASS: practical formulation matrix is fully classified — ${active} AUTO drugs, ${blocked} blocked, ${auditedOptions} options, ${auditedFormulationRows} option×formulation checks`
);
