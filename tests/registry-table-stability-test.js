const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const script = read('registry-unified-table.js');
const css = read('registry-unified-table.css');

assert.match(index, /registry-unified-table\.css\?v=20260812-population-column-1/);
assert.match(index, /registry-unified-table\.js\?v=20260812-population-column-1/);
assert.ok(
  index.indexOf('registry-dosage-loader.js') < index.indexOf('registry-unified-table.js'),
  'The unified controller must reconcile dosage columns after the idle dosage loader is wired.'
);
assert.ok(
  index.indexOf('clinical-editor.js') < index.indexOf('registry-unified-table.js'),
  'The unified controller must reconcile editor columns after the clinical editor is wired.'
);
assert.doesNotMatch(index, /registry-table-integrity\.(?:css|js)/, 'legacy integrity controller must not load');

assert.match(script, /registry-unified-table-20260801-1/);
assert.match(script, /const FULL_ORDER = Object\.freeze/);
assert.match(script, /const CLINICAL_ORDER = Object\.freeze/);
assert.match(script, /data-registry-column-key|registryColumnKey/);
assert.match(script, /registryNumber/);
assert.match(script, /MEDINDEX_REGISTRY_TABLE_AUDIT/);
assert.match(script, /dosage-adult/);
assert.match(script, /clinical-status/);
assert.match(script, /table\.querySelectorAll\(':scope > colgroup'\)\.forEach\(group => group\.remove\(\)\)/);
assert.match(script, /observer\.observe\(header, \{ childList:true \}\)/);
assert.match(script, /observer\.observe\(tbody, \{ childList:true \}\)/);
assert.doesNotMatch(script, /registry-dose-dialog|showModal\(/);
assert.doesNotMatch(script, /subtree\s*:\s*true|observe\(document\.body/);
assert.doesNotMatch(script, /wrapper\.scrollTop\s*=/);

assert.match(css, /table-layout:fixed!important/);
assert.match(css, /#dataTable\[data-registry-unified-table\] :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/);
assert.match(css, /scrollbar-gutter:stable!important/);
assert.match(css, /height:92px!important/);
assert.match(css, /registry-unified-skeleton/);
assert.match(css, /:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/);
assert.match(css, /@media \(max-width:760px\)/);
assert.doesNotMatch(css, /tbody td[\s\S]{0,180}position:sticky!important/);

console.log('Single-controller registry columns, one colgroup and fixed row geometry audit passed.');
