const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const script = read('registry-table-integrity.js');
const css = read('registry-table-integrity.css');

assert.match(index, /registry-table-integrity\.css\?v=20260801-4/);
assert.match(index, /registry-table-integrity\.js\?v=20260801-4/);
assert.ok(
  index.indexOf('registry-table-integrity.js') < index.indexOf('registry-dosage-loader.js'),
  'The stable column skeleton must load before dosage columns.'
);
assert.ok(
  index.indexOf('registry-table-integrity.js') < index.indexOf('clinical-editor.js'),
  'Registry identities must be available before the clinical editor enhances rows.'
);

assert.match(script, /registry-table-integrity-v5/);
assert.match(script, /data-registry-colgroup/);
assert.match(script, /data-registry-number-probe/);
assert.match(script, /registry-dynamic-placeholder/);
assert.match(script, /registryNumberForRow/);
assert.match(script, /wakeClinicalEditor/);
assert.match(script, /MEDINDEX_REGISTRY_TABLE_AUDIT/);
assert.match(script, /registry-dose-dialog/);
assert.match(script, /dosage-adult/);
assert.match(script, /clinical-status/);
assert.doesNotMatch(script, /wrapper\.scrollTop\s*=/);
assert.doesNotMatch(script, /const scrollTop\s*=\s*wrapper\.scrollTop/);

assert.match(css, /table-layout:fixed!important/);
assert.match(css, /tbody td[\s\S]*position:static!important/);
assert.match(css, /scrollbar-gutter:stable both-edges!important/);
assert.match(css, /height:auto!important/);
assert.match(css, /height:96px!important/);
assert.match(css, /registry-cell-skeleton/);
assert.match(css, /registry-dose-dialog/);
assert.match(css, /nth-child\(3\)[\s\S]*left:auto!important/);
assert.match(css, /@media \(max-width:760px\)/);
assert.doesNotMatch(css, /height:clamp\(460px,68dvh,760px\)!important/);
assert.doesNotMatch(css, /tbody td[\s\S]{0,180}position:sticky!important/);

console.log('Preallocated registry columns, single page scroll and fixed row geometry audit passed.');