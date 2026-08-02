'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const js = read('icd-tree.js');
const css = read('icd-tree.css');

for (const marker of ['role="tree"', 'role="combobox"', 'role="listbox"', 'aria-busy="true"', 'Mbyll të gjitha']) {
  assert.ok(html.includes(marker), `ICD tree HTML missing ${marker}`);
}
for (const marker of ['loadChildren', 'collapseSiblings', 'revealCode', 'visibleButtons', 'endpoint(\'nav\')', 'endpoint(\'children\'', 'endpoint(\'resolve\'', 'endpoint(\'suggest\'']) {
  assert.ok(js.includes(marker), `ICD tree runtime missing ${marker}`);
}
for (const marker of ['.icd-tree-children', '.icd-tree-chevron', '.icd-tree-row.is-selected', '@media(max-width:620px)', '@media(forced-colors:active)']) {
  assert.ok(css.includes(marker), `ICD tree CSS missing ${marker}`);
}
assert.ok(!html.includes('id="icdTable"'));
assert.ok(!html.includes('icd-full-table.js'));
assert.doesNotMatch(js, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(css, /https?:\/\//);
new Function(js);
console.log('ICD lazy hierarchy tree contract passed.');
