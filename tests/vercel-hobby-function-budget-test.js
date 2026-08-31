'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const apiDir = path.join(root, 'api');
const functions = fs.readdirSync(apiDir)
  .filter(name => name.endsWith('.js'))
  .sort();

assert.equal(
  functions.length,
  12,
  `Vercel Hobby permits at most 12 Serverless Functions; found ${functions.length}: ${functions.join(', ')}`
);

assert(!functions.includes('icd.js'));
assert(!functions.includes('phase11-review.js'));

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = new Map((vercel.rewrites || []).map(row => [row.source, row.destination]));

assert.equal(rewrites.get('/api/icd'), '/api/clinical-editor?icdApi=1');
assert.equal(rewrites.get('/api/phase11-review'), '/api/clinical-editor?phase11Review=1');

assert.equal(
  vercel.functions?.['api/clinical-editor.js']?.includeFiles,
  'data/icd-hierarchy-snapshot.json.gz'
);

console.log('Vercel Hobby function-budget contract passed: 12/12 functions.');
