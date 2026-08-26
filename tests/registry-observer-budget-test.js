'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

const files = [
  'registry-cell-preview.js',
  'registry-row-expand.js',
  'registry-dosage-columns-v3.js',
  'registry-dose-calculator.js',
  'registry-dose-table-button.js',
];
files.forEach(syntax);

const preview = read(files[0]);
const rows = read(files[1]);
const dosage = read(files[2]);
const calculator = read(files[3]);
const doseTable = read(files[4]);

assert.match(preview, /registry-observer-budget-v1/);
assert.match(preview, /tableObserver\.observe\(tbody, \{ childList:true, subtree:true \}\);/,
  'Cell preview must retain nested node insertion/removal recovery.');
const previewObserverBlock = preview.slice(
  preview.indexOf('function connectObserver()'),
  preview.indexOf('function enhanceVisibleCells()'),
);
assert.doesNotMatch(previewObserverBlock, /characterData\s*:\s*true/,
  'Cell preview must not rescan on nested text mutations.');
assert.doesNotMatch(previewObserverBlock, /attributes\s*:\s*true|attributeFilter\s*:/,
  'Cell preview must not rescan on nested attribute/class/aria mutations.');
assert.match(preview, /medindex:registry-content-changed/);
assert.match(preview, /medindex:registry-row-expanded-change/);

assert.match(rows, /tableObserver\.observe\(tbody, \{ childList:true \}\);/,
  'Row expansion must stay direct-row observed.');
assert.doesNotMatch(rows, /tableObserver\.observe\(tbody,[\s\S]{0,100}subtree\s*:\s*true/);
assert.match(rows, /medindex:registry-row-expanded-change/);

assert.match(dosage, /new CustomEvent\('medindex:registry-content-changed'/,
  'Nested dosage writes must publish one explicit invalidation event.');
assert.match(calculator, /new CustomEvent\('medindex:dose-calculator-activated'/,
  'Dose calculator activation must explicitly wake dependent UI.');

assert.match(doseTable, /let active = false;/);
assert.match(doseTable, /window\.addEventListener\('medindex:dose-calculator-activated', activate\);/);
assert.match(doseTable, /function activate\(\) \{[\s\S]*observeTable\(\);[\s\S]*scanVisiblePage\(\);/);
assert.match(doseTable, /function start\(\) \{[\s\S]*medindex:dose-calculator-activated[\s\S]*doseTableButtonAudit = VERSION \+ '-deferred';/);
assert.doesNotMatch(doseTable, /function start\(\) \{\s*observeTable\(\);\s*scanVisiblePage\(\);/,
  'Dose-table scanning/observers must not run unconditionally at startup.');

console.log('✓ Final registry observer budget passed: nested insertion recovery remains, text/attribute mutation churn is gone, dosage changes are explicit events, and dose-table observers are activation-only.');
