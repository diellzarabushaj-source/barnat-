'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const treeCss = read('icd-tree.css');
const treeJs = read('icd-tree.js');
const sidebarCss = read('icd-sidebar.css');
const sidebarJs = read('icd-sidebar.js');
const detailCss = read('icd-detail-panel.css');
const detailJs = read('icd-detail-panel.js');

for (const asset of [
  'icd-tree.css?v=icd-tree-v1', 'icd-sidebar.css?v=icd-sidebar-v1',
  'icd-detail-panel.css?v=icd-detail-panel-v2', 'icd-tree.js?v=icd-tree-v1',
  'icd-sidebar.js?v=icd-sidebar-v1', 'icd-detail-panel.js?v=icd-detail-panel-v2',
]) assert.ok(html.includes(asset), `ICD tree page missing ${asset}`);

for (const removed of [
  'icd-full-table.css', 'icd-full-table.js', 'icd-premium-cards.css', 'icd-premium-cards.js',
  'icd-clinical-workspace.js', 'icd-clinical-style-loader.js', 'icd-hero-stats', 'icd-chapter-grid', 'icd-code-grid',
]) assert.ok(!html.includes(removed), `Legacy table/card asset must not load: ${removed}`);

for (const marker of [
  'id="icdTree"', 'role="tree"', 'id="icdSearch"', 'id="icdSuggestions"',
  'id="icdCollapseAll"', 'id="icdTreeStatus"', 'id="icdTreeRetry"',
]) assert.ok(html.includes(marker), `Tree HTML missing ${marker}`);

for (const marker of [
  '.icd-tree-panel', '.icd-tree-node', '.icd-tree-row', '.icd-tree-children', '.icd-tree-toggle',
  '.level-chapter', '.level-block', '.level-category', '.level-subcategory',
  '@media(max-width:1023px)', '@media(max-width:620px)', 'html[data-theme="dark"]',
  '@media(prefers-reduced-motion:reduce)', '@media(forced-colors:active)',
]) assert.ok(treeCss.includes(marker), `Tree CSS missing ${marker}`);

for (const marker of [
  "const API = '/api/icd'", "endpoint('nav')", "endpoint('children'", "endpoint('resolve'", "endpoint('suggest'",
  'loadNavigation', 'loadChildren', 'expandNode', 'collapseSiblings', 'revealCode',
  'data-open-code', 'translationStatus', 'popstate', 'MedIndexIcdTable',
]) assert.ok(treeJs.includes(marker), `Tree runtime missing ${marker}`);

for (const marker of [
  '.mi-icd-menu', '.mi-icd-chapter-trigger', '.mi-icd-block-trigger', '.mi-icd-category-link',
  'Kthehu te kapitujt', '@media(max-width:1023px)',
]) assert.ok(sidebarCss.includes(marker), `Nested sidebar CSS missing ${marker}`);
for (const marker of ['view=nav', 'view=children', 'view=resolve', 'data-mi-icd-chapter-trigger', 'data-mi-icd-block-trigger']) {
  assert.ok(sidebarJs.includes(marker), `Nested sidebar runtime missing ${marker}`);
}

for (const marker of ['.icd-detail-panel', '.icd-use-diagnosis', '.icd-detail-summary', '@media(max-width:620px)', 'html[data-theme="dark"]']) {
  assert.ok(detailCss.includes(marker), `Detail CSS missing ${marker}`);
}
for (const marker of [
  "DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2'", 'data-open-code', 'medindex:icd-open-detail',
  'MedIndexIcdDetail', 'Përdore në recetë', 'view=resolve', 'sessionStorage.setItem', 'focusables',
]) assert.ok(detailJs.includes(marker), `Detail and prescription integration missing ${marker}`);

new Function(treeJs);
new Function(sidebarJs);
new Function(detailJs);
assert.doesNotMatch(treeCss, /https?:\/\//, 'Tree CSS must not load external assets.');
assert.doesNotMatch(sidebarCss, /https?:\/\//, 'Sidebar CSS must not load external assets.');
assert.doesNotMatch(detailCss, /https?:\/\//, 'Detail CSS must not load external assets.');
console.log('ICD table removed; hierarchy tree, nested sidebar and isolated prescription transfer contract passed.');
