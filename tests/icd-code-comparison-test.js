'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const comparison = require('../icd-code-comparison.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'icd.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'icd-code-comparison.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'icd-code-comparison-bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'icd-code-comparison.css'), 'utf8');

const ancestor = (code, level, displayTitle = code) => ({ code, level, displayTitle });
const resolved = ({ code, level = 'subcategory', parentCode = 'A00', childCount = 0, title = code, status = 'standardized', ancestors = [] }) => ({
  node:{
    code,
    level,
    parentCode,
    childCount,
    albanianDraft:title,
    englishTitle:`${title} EN`,
    translationStatus:status,
  },
  ancestors,
});

const chapter = ancestor('I', 'chapter', 'Sëmundjet infektive');
const block = ancestor('A00-A09', 'block', 'Sëmundjet infektive të zorrëve');
const category = resolved({ code:'A00', level:'category', parentCode:'A00-A09', childCount:4, title:'Kolera', ancestors:[chapter, block] });
const sub0 = resolved({ code:'A00.0', title:'Kolera nga Vibrio cholerae 01', ancestors:[chapter, block, ancestor('A00', 'category', 'Kolera')] });
const sub1 = resolved({ code:'A00.1', title:'Kolera biovar eltor', ancestors:[chapter, block, ancestor('A00', 'category', 'Kolera')] });
const sub9 = resolved({ code:'A00.9', title:'Kolera e paspecifikuar', ancestors:[chapter, block, ancestor('A00', 'category', 'Kolera')] });
const other = resolved({ code:'I10', level:'category', parentCode:'I10-I15', childCount:0, title:'Hipertensioni esencial', ancestors:[ancestor('IX', 'chapter'), ancestor('I10-I15', 'block')] });

assert.equal(comparison.VERSION, 'icd-code-comparison-v1');
assert.equal(comparison.MAX_ITEMS, 3);
assert.equal(comparison.normalizeCode('a001'), '');
assert.equal(comparison.normalizeCode('A00.1'), 'A00.1');
assert.equal(comparison.normalizeCode('A00-A09'), '');
assert.equal(comparison.normalizeNode({ code:'A00-A09', level:'block', displayTitle:'Block' }), null);
assert.equal(comparison.normalizeNode(category.node).code, 'A00');

let values = comparison.addItem([], category);
values = comparison.addItem(values, sub0);
values = comparison.addItem(values, sub0);
assert.deepEqual(values.map(item => item.node.code), ['A00', 'A00.0']);
values = comparison.addItem(values, sub1);
values = comparison.addItem(values, sub9);
assert.deepEqual(values.map(item => item.node.code), ['A00', 'A00.0', 'A00.1'], 'A fourth code must not evict an existing comparison choice.');
assert.deepEqual(comparison.removeItem(values, 'A00.0').map(item => item.node.code), ['A00', 'A00.1']);

const serialized = comparison.serializeCodes(values);
assert.deepEqual(comparison.parseCodes(serialized), ['A00', 'A00.0', 'A00.1']);
assert.deepEqual(comparison.parseCodes(JSON.stringify({ version:1, codes:['A00', 'A00', 'BAD', 'A00.1', 'I10'] })), ['A00', 'A00.1', 'I10']);
assert.deepEqual(comparison.parseCodes('{bad'), []);

assert.equal(comparison.deepestCommonAncestor([sub0, sub1]).code, 'A00');
assert.equal(comparison.relationInfo([category, sub0]).label, 'Kategori dhe nënkod i saj');
assert.equal(comparison.relationInfo([sub0, sub1]).label, 'Kode motra në të njëjtën degë');
assert.equal(comparison.relationInfo([sub0, other]).label, 'Degë të ndryshme ICD-10');

const siblingSummary = comparison.comparisonSummary([sub0, sub1]);
assert.equal(siblingSummary.count, 2);
assert.equal(siblingSummary.commonAncestor, 'A00');
assert.equal(siblingSummary.sameLevel, true);
assert.deepEqual(siblingSummary.specificCodes, ['A00.0', 'A00.1']);
const mixedSummary = comparison.comparisonSummary([category, sub0]);
assert.equal(mixedSummary.sameLevel, false);

const copied = comparison.copyText([category, sub0, sub1]);
for (const marker of ['KRAHASIM ICD-10-WHO 2019', 'A00 — Kolera', 'A00.0', 'Paraardhësi i përbashkët', 'vendim klinik']) {
  assert.ok(copied.includes(marker), `Comparison copy missing ${marker}`);
}
for (const forbidden of ['selectedAt', 'STORAGE_KEY', 'medindex_icd_code_comparison_v1', 'translationStatus', 'source:']) {
  assert.ok(!copied.includes(forbidden), `Comparison copy leaked ${forbidden}`);
}

const context = comparison.diagnosisContext(sub0, 123456);
assert.deepEqual({ code:context.code, level:context.level, selectedAt:context.selectedAt }, { code:'A00.0', level:'subcategory', selectedAt:123456 });
assert.ok(!('ancestors' in context));

for (const marker of ['icd-code-comparison.css?v=icd-code-comparison-v1', 'icd-code-comparison.js?v=icd-code-comparison-v1', 'icd-code-comparison-bridge.js?v=icd-code-comparison-bridge-v1']) {
  assert.ok(html.includes(marker), `ICD page missing ${marker}`);
}
for (const marker of ['MAX_ITEMS = 3', 'deepestCommonAncestor', 'relationInfo', 'Krahasimi profesional i kodeve', 'data-mi-icd-comparison-primary', 'data-mi-icd-comparison-secondary']) {
  assert.ok(js.includes(marker), `Comparison runtime missing ${marker}`);
}
for (const marker of ['MutationObserver', 'data-mi-icd-compare-active', 'stopImmediatePropagation', 'activeIsCodable']) {
  assert.ok(bridge.includes(marker), `Comparison bridge missing ${marker}`);
}
for (const marker of ['.icd-comparison-summary', '.icd-comparison-grid', '@media (max-width: 520px)', '@media (forced-colors: active)', '@media (prefers-reduced-motion: reduce)']) {
  assert.ok(css.includes(marker), `Comparison CSS missing ${marker}`);
}
assert.doesNotMatch(js, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(bridge, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(css, /https?:\/\//);
new Function(js);
new Function(bridge);

console.log('Professional ICD code comparison contract passed.');