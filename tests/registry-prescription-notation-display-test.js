'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const api = read('api/drug-search.js');
const desktop = read('registry-desktop-lite.js');
const columns = read('registry-desktop-column-lite.js');
const unified = read('registry-unified-table.js');
const PrescriptionNotation = require('../prescription-notation.js');

assert.match(api, /prescriptionNotation:registryPrescriptionNotation\(row\)/,
  'Registry API must expose computed prescription notation on every lightweight/personal row.');
assert.match(desktop, /'Si të shënohet në recetë':clean\(row\.prescriptionNotation\)/,
  'Canonical desktop rows must preserve prescriptionNotation for the visible table.');
assert.match(columns, /if \(column\.key === 'prescription-label'\) return text;/,
  'Prescription notation must render blank, not a dash, only when the value is genuinely absent.');
assert.match(columns, /!existed \|\| column\.remote \|\| column\.key === 'prescription-label'/,
  'An existing unified prescription cell must always be rehydrated from canonical row data.');

const makeCellStart = unified.indexOf('function makeCell(key, row, synthetic = true)');
const makeCellEnd = unified.indexOf('function stampHeader(header)', makeCellStart);
assert.ok(makeCellStart >= 0 && makeCellEnd > makeCellStart, 'Unified table makeCell contract is missing.');
const makeCell = unified.slice(makeCellStart, makeCellEnd);
const branchStart = makeCell.indexOf("} else if (key === 'prescription-label') {");
const branchEnd = makeCell.indexOf('    } else {', branchStart);
assert.ok(branchStart >= 0 && branchEnd > branchStart, 'Unified table needs a dedicated prescription-label branch.');
const prescriptionBranch = makeCell.slice(branchStart, branchEnd);
assert.match(prescriptionBranch, /cell\.textContent = value;/,
  'Unified table must display the actual prescription notation value.');
assert.doesNotMatch(prescriptionBranch, /value \|\| '—'/,
  'Unified table must never turn missing prescription notation into a visible dash.');

const sample = PrescriptionNotation.build({
  'Substanca aktive':'Amlodipine',
  'Fortësia':'10 mg',
  'Forma farmaceutike':'Tablet',
});
assert.equal(sample.line, 'Tab. Amlodipine 10 mg',
  'Prescription notation builder must continue producing a usable notation line for tablet rows.');

console.log('✓ Prescription notation display passed: real notation survives API → canonical row → unified cell, while missing notation stays blank instead of —.');
