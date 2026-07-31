const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const script = read('registry-table-integrity.js');
const css = read('registry-table-integrity.css');

assert.match(index, /registry-table-integrity\.css\?v=20260801-2/);
assert.match(index, /registry-table-integrity\.js\?v=20260801-2/);
assert.ok(
  index.indexOf('app-stability.js') < index.indexOf('registry-table-integrity.js'),
  'The table integrity layer must load after the final workspace loader.'
);

assert.match(script, /registry-table-integrity-v2/);
assert.match(script, /data-registry-colgroup/);
assert.match(script, /registryColumnKey/);
assert.match(script, /MEDINDEX_REGISTRY_TABLE_AUDIT/);
assert.match(script, /scrollLeft = Math\.min\(scrollLeft, maxLeft\)/);
assert.match(script, /dosage-adult/);
assert.match(script, /clinical-status/);

assert.match(css, /table-layout:fixed!important/);
assert.match(css, /tbody td[\s\S]*position:static!important/);
assert.match(css, /scrollbar-gutter:stable both-edges!important/);
assert.match(css, /nth-child\(3\)[\s\S]*left:auto!important/);
assert.match(css, /@media \(max-width:760px\)/);
assert.doesNotMatch(css, /tbody td[\s\S]{0,180}position:sticky!important/);

console.log('Deterministic registry table layout and column integrity audit passed.');
