'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const api = read('api/drug-search.js');
const desktop = read('registry-desktop-lite.js');
const columns = read('registry-desktop-column-lite.js');
const unified = read('registry-unified-table.js');
const finalizer = read('scripts/patch-registry-personal-final.js');
const PrescriptionNotation = require('../prescription-notation.js');

assert.match(api, /prescriptionNotation:registryPrescriptionNotation\(row\)/,
  'Registry API must expose computed prescription notation on every lightweight/personal row.');
assert.match(api, /return clean\(notation\?\.line\);/,
  'Registry API must keep prescription notation sourced from the canonical builder line.');
assert.match(desktop, /'Si të shënohet në recetë':clean\(row\.prescriptionNotation\)/,
  'Canonical desktop rows must preserve prescriptionNotation for the visible table.');
assert.match(columns, /function prescriptionDisplayValue\(value\)/,
  'Column-lite must own a dedicated prescription display sanitizer.');
assert.match(columns, /return \/\^\[-–—\]\+\$\/\.test\(text\) \? '' : text;/,
  'Dash-only prescription placeholders must normalize to blank.');
assert.match(columns, /if \(column\.key === 'prescription-label'\) return prescriptionDisplayValue\(value\);/,
  'Prescription notation must render blank only when genuinely absent or placeholder-only.');
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
assert.match(prescriptionBranch, /cell\.textContent = \/\^\[-–—\]\+\$\/\.test\(value\) \? '' : value;/,
  'Unified table must suppress dash-only placeholders before column-lite rehydration.');
assert.doesNotMatch(prescriptionBranch, /value \|\| '—'/,
  'Unified table must never turn missing prescription notation into a visible dash.');

const sameTableAt = finalizer.indexOf("require('./patch-registry-personal-same-table.js');");
const supabaseAt = finalizer.indexOf("require('./patch-registry-personal-supabase-owner.js');");
const notationAt = finalizer.indexOf("require('./patch-registry-prescription-notation-display.js');");
const isolationAt = finalizer.indexOf("require('./patch-user-library-account-isolation.js');");
assert.ok(sameTableAt >= 0 && supabaseAt > sameTableAt && notationAt > supabaseAt,
  'Prescription hardening must run after the same-table and Supabase personal-row composers.');
assert.ok(isolationAt > notationAt,
  'Prescription hardening must remain inside the final composition gate before offline packaging continues.');
assert.match(finalizer, /registry-prescription-notation-display-test\.js/,
  'The finalizer must execute the prescription display regression gate on every production build.');

const sample = PrescriptionNotation.build({
  'Substanca aktive':'Amlodipine',
  'Fortësia':'10 mg',
  'Forma farmaceutike':'Tablet',
});
assert.equal(sample.line, 'Tab. Amlodipine 10 mg',
  'Prescription notation builder must continue producing a usable notation line for tablet rows.');

const patchedFiles = [
  'registry-desktop-column-lite.js',
  'registry-unified-table.js',
  'registry-desktop-lite.js',
  'api/drug-search.js',
];
const digest = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const before = new Map(patchedFiles.map(file => [file, digest(file)]));
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'patch-registry-prescription-notation-display.js')], {
  cwd:ROOT,
  stdio:'pipe',
});
for (const file of patchedFiles) {
  assert.equal(digest(file), before.get(file),
    `Prescription hardening patch must be idempotent and must not rewrite ${file} after composition is already correct.`);
}

console.log('✓ Prescription notation display hardened v2: real notation survives API → canonical row → unified cell; missing/dash-only placeholders stay blank and the build patch is idempotent.');
