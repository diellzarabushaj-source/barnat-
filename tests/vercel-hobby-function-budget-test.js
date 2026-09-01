'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const apiDir = path.join(root, 'api');
const functions = fs.readdirSync(apiDir)
  .filter(name => name.endsWith('.js'))
  .sort();
const middlewareEntries = ['middleware.ts','middleware.js','middleware.mjs']
  .filter(name => fs.existsSync(path.join(root, name)));
const runtimeFunctionCount = functions.length + middlewareEntries.length;

assert.ok(
  runtimeFunctionCount <= 11,
  `Keep at least one real Vercel Hobby function slot reserved; found ${runtimeFunctionCount}/12: ${functions.concat(middlewareEntries).join(', ')}`
);

assert(!functions.includes('icd.js'));
assert(!functions.includes('phase11-review.js'));
assert(!functions.includes('medical-hub-image.js'), 'Medical Hub image compatibility route must not consume its own function');
assert(!functions.includes('prescription-dosage-context.js'), 'Prescription context must share the dosage gateway');
assert.ok(fs.existsSync(path.join(root, 'lib', 'prescription-dosage-context-handler.js')), 'Shared prescription context handler is missing');
assert.ok(fs.existsSync(path.join(root, 'lib', 'medical-hub-image-handler.js')), 'Medical Hub shared image handler is missing');

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map(row => [row.source, row.destination]));

assert.equal(rewrites.get('/api/icd'), '/api/clinical-editor?icdApi=1');
assert.equal(rewrites.get('/api/phase11-review'), '/api/clinical-editor?phase11Review=1');
assert.equal(rewrites.get('/api/medical-hub-image'), '/api/medical-hub?_route=image');
assert.equal(rewrites.get('/api/prescription-dosage-context'), '/api/dosage?view=prescription-context');

assert.equal(
  vercel.functions?.['api/clinical-editor.js']?.includeFiles,
  'data/icd-hierarchy-snapshot.json.gz'
);

console.log(`Vercel Hobby function-budget contract passed: ${runtimeFunctionCount}/12 runtime functions; at least one real slot reserved.`);
