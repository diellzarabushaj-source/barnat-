const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const script = read('registry-unified-table.js');
const css = read('registry-unified-table.css');
const rowExpand = read('registry-row-expand.js');
const dosage = read('registry-dosage-columns-v3.js');

assert.match(index, /registry-unified-table\.css\?v=20260820-registry-columns-v2/);
assert.match(index, /registry-unified-table\.js\?v=20260820-registry-columns-v2/);
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
assert.match(script, /--registry-frozen-active-left/);
assert.match(script, /table\.querySelectorAll\(':scope > colgroup'\)\.forEach\(group => group\.remove\(\)\)/);
assert.match(script, /observer\.observe\(header, \{ childList:true \}\)/);
assert.match(script, /observer\.observe\(tbody, \{ childList:true \}\)/);
assert.doesNotMatch(script, /registry-dose-dialog|showModal\(/);
assert.doesNotMatch(script, /subtree\s*:\s*true|observe\(document\.body/);
assert.doesNotMatch(script, /wrapper\.scrollTop\s*=/);

assert.match(rowExpand, /tableObserver\.observe\(tbody, \{ childList:true \}\)/, 'Row expansion must react to direct page-row replacement only.');
assert.doesNotMatch(rowExpand, /tableObserver\.observe\(tbody,[\s\S]{0,100}subtree\s*:\s*true/, 'Row expansion must not watch all nested table mutations.');
assert.match(rowExpand, /medindex:registry-row-expanded-change/, 'Row expansion must publish targeted expansion changes.');
assert.match(dosage, /let rowContentChanged = false/, 'Dosage reconciliation must track whether nested row content actually changed.');
assert.match(dosage, /if \(rowContentChanged\) window\.MedIndexRegistryRows\?\.refresh\?\.\(\)/, 'Dosage must explicitly refresh row expansion only after a real nested content change.');

assert.match(css, /table-layout:fixed!important/);
assert.match(css, /#dataTable\[data-registry-unified-table\] :is\(th,td\)\[data-registry-column-key\][\s\S]*position:relative!important/);
assert.match(css, /scrollbar-gutter:stable!important/);
assert.match(css, /height:92px!important/);
assert.match(css, /registry-unified-skeleton/);
assert.match(css, /:is\(\.registry-dose-dialog,\.registry-cell-preview-dialog\)[\s\S]*display:none!important/);
assert.match(css, /@media \(max-width:760px\)/);
assert.match(css, /registry-frozen-columns-v2/, 'desktop frozen-column contract must be explicit');
assert.match(css, /\[data-registry-column-key="number"\][\s\S]{0,180}position:sticky!important[\s\S]{0,120}left:0!important/, 'Nr must be the first frozen data column');
// The prescription notation is what a doctor reads a row by, so it is the
// column that stays put; the active substance scrolls with the rest.
assert.match(css, /\[data-registry-column-key="prescription-label"\][\s\S]{0,220}position:sticky!important/, 'the prescription notation must be the second frozen data column');
assert.doesNotMatch(css, /\[data-registry-column-key="trade-name"\]\s*\{[^}]*position:sticky!important/, 'trade name must remain horizontally scrollable');

console.log('Registry table controllers use direct-row observation; nested dosage changes refresh row expansion explicitly; only Nr + active substance freeze on desktop.');
