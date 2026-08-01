const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('index.html');
const script = read('registry-table-integrity.js');
const css = read('registry-table-integrity.css');

assert.match(index, /registry-table-integrity\.css\?v=20260801-3/);
assert.match(index, /registry-table-integrity\.js\?v=20260801-3/);
assert.ok(
  index.indexOf('app-stability.js') < index.indexOf('registry-table-integrity.js'),
  'The table integrity layer must load after the final workspace loader.'
);

assert.match(script, /registry-table-integrity-v3/);
assert.match(script, /data-registry-colgroup/);
assert.match(script, /registryColumnKey/);
assert.match(script, /MEDINDEX_REGISTRY_TABLE_AUDIT/);
assert.match(script, /sameNodes/);
assert.match(script, /lastLayoutSignature/);
assert.match(script, /Math\.abs\(width - lastObservedWidth\) < 2/);
assert.match(script, /dosage-adult/);
assert.match(script, /clinical-status/);
assert.doesNotMatch(script, /wrapper\.scrollTop\s*=/);
assert.doesNotMatch(script, /const scrollTop\s*=\s*wrapper\.scrollTop/);

assert.match(css, /table-layout:fixed!important/);
assert.match(css, /tbody td[\s\S]*position:static!important/);
assert.match(css, /scrollbar-gutter:stable both-edges!important/);
assert.match(css, /height:clamp\(460px,68dvh,760px\)!important/);
assert.match(css, /height:88px!important/);
assert.match(css, /overflow-anchor:none!important/);
assert.match(css, /nth-child\(3\)[\s\S]*left:auto!important/);
assert.match(css, /@media \(max-width:760px\)/);
assert.doesNotMatch(css, /tbody td[\s\S]{0,180}position:sticky!important/);

console.log('Deterministic registry table layout and vertical stability audit passed.');
