'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const audit = fs.readFileSync(path.join(root, 'docs/icd-source-rebuild-audit.md'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'scripts/sync-neon-from-sheets.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'lib/icd-api-base.js'), 'utf8');

assert.match(audit, /total: 701/);
assert.match(audit, /emergency: 622/);
assert.match(audit, /critical: 244/);
assert.match(audit, /0c767740f6668f9fb9381ae875afc95ecbe7e69c7407f4f0e1022ed759bde36d/);
assert.match(audit, /zero hierarchy nodes/);
assert.match(audit, /marked `failed`, not `active`/);
assert.match(sync, /function icdRecords/);
assert.match(sync, /is_family_medicine/);
assert.match(sync, /is_emergency/);
assert.match(sync, /is_critical/);
assert.match(api, /buildNeonIcdDataset/);
assert.match(api, /buildSheetsIcdDataset/);
assert.match(api, /sheets-fallback/);

console.log('Clinical ICD Sheet/Neon parity and safe full-hierarchy fallback contract passed.');
