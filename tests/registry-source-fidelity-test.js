const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../api/registry.js');

const sourceRows = [
  { 'Nr rendor':3844, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Parcoten', 'Substanca aktive':'Paracetamol & Codeine Phosphate', 'ATC Code':'N02AJ06', 'Fortësia':'500mg/10mg', 'Forma farmaceutike':'Tablet', 'Madhësia e paketimit':'20 tablets' },
  { 'Nr rendor':3845, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Bortezomib STADA', 'Substanca aktive':'Bortezomib', 'ATC Code':'L01XG01', 'Fortësia':'2.5 mg/ml', 'Forma farmaceutike':'Solution for injection', 'Madhësia e paketimit':'One 1.4 ml vial' },
  { 'Nr rendor':3846, ProtocolNo:'d.fizike', PDID:'d.fizike', 'Emri tregtar':'Amoxicillin Stada', 'Substanca aktive':'Amoxicillin', 'ATC Code':'J01CA04', 'Fortësia':'1000 mg', 'Forma farmaceutike':'Film coated tablet', 'Madhësia e paketimit':'10 tablets' },
];
const prescriptionRows = sourceRows.map((row, index) => ({ ...row, 'Si të shënohet në recetë':`NOTATION-${index + 1}` }));
const result = registry.attachPrescriptionNotation(sourceRows, prescriptionRows);
assert.equal(result.rows.length, 3);
assert.deepEqual(result.rows.map(row => row['Si të shënohet në recetë']), ['NOTATION-1', 'NOTATION-2', 'NOTATION-3']);
assert.equal(result.matched, 3);
assert.equal(result.generated, 0);
assert.equal(result.matchedByOrdinal, 3);
assert.equal(result.ambiguousExact, 1);
assert.equal(result.ambiguousPdid, 1);

const root = path.resolve(__dirname, '..');
const local = fs.readFileSync(path.join(root, 'local-registry-fidelity.js'), 'utf8');
for (const marker of ['REGISTRY_SCHEMA_VERSION', 'packagingSummary', 'prescriptionLine', 'sheetPrescriptionNotation', 'record.version !== REGISTRY_SCHEMA_VERSION']) {
  assert.ok(local.includes(marker), `local registry missing ${marker}`);
}
const html = fs.readFileSync(path.join(root, 'recetat.html'), 'utf8');
assert.match(html, /local-registry-fidelity\.js\?v=registry-fidelity-v1/);
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(worker, /local-registry-fidelity\.js/);
console.log('Registry source fidelity and collision audit passed.');
