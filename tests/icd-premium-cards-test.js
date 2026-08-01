const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const tableCss = read('icd-full-table.css');
const tableJs = read('icd-full-table.js');
const sidebarCss = read('icd-sidebar.css');
const sidebarJs = read('icd-sidebar.js');
const detailCss = read('icd-detail-panel.css');
const detailJs = read('icd-detail-panel.js');

for (const asset of [
  'icd-full-table.css?v=icd-full-table-v1',
  'icd-sidebar.css?v=icd-sidebar-v1',
  'icd-detail-panel.css?v=icd-detail-panel-v1',
  'icd-full-table.js?v=icd-full-table-v1',
  'icd-sidebar.js?v=icd-sidebar-v1',
  'icd-detail-panel.js?v=icd-detail-panel-v1',
]) assert.ok(html.includes(asset), `ICD table page missing ${asset}`);

for (const legacy of [
  'icd-premium-cards.css', 'icd-premium-cards.js', 'icd-clinical-workspace.js',
  'icd-clinical-style-loader.js', 'icd.js?v=', 'icd-hero-stats', 'icd-chapter-grid', 'icd-code-grid',
]) assert.ok(!html.includes(legacy), `Legacy ICD card workspace must not load: ${legacy}`);

for (const marker of [
  'id="icdTable"', 'id="icdTableBody"', 'id="icdSearch"', 'id="icdSuggestions"',
  'id="icdContext"', 'id="icdPagination"', 'Kategori dhe nënkategori',
]) assert.ok(html.includes(marker), `Unified ICD table HTML missing ${marker}`);

for (const marker of [
  '.icd-registry-panel', '.icd-table', '.icd-suggestions', '.icd-context',
  '@media(max-width:1023px)', '@media(max-width:620px)', 'html[data-theme="dark"]',
  '@media(prefers-reduced-motion:reduce)', '@media(forced-colors:active)',
]) assert.ok(tableCss.includes(marker), `Unified ICD table CSS missing ${marker}`);

for (const marker of [
  '.mi-icd-menu', '.mi-icd-chapter-trigger', '.mi-icd-block-trigger', '.mi-icd-category-link',
  'Kthehu te kapitujt', ':has(.mi-icd-chapter.is-open)', '@media(max-width:1023px)',
]) assert.ok(sidebarCss.includes(marker), `Nested ICD sidebar CSS missing ${marker}`);

for (const marker of [
  '.icd-detail-panel', '.icd-use-diagnosis', '.icd-detail-summary',
  '@media(max-width:620px)', 'html[data-theme="dark"]',
]) assert.ok(detailCss.includes(marker), `ICD detail panel CSS missing ${marker}`);

for (const marker of [
  "const API = '/api/icd'", 'view=suggest', 'MedIndexIcdTable', 'medindex:icd-state',
  'data-icd-open-branch', 'translationStatus', 'popstate',
]) assert.ok(tableJs.includes(marker), `Unified ICD table runtime missing ${marker}`);

for (const marker of [
  'view=nav', 'view=children', 'view=resolve', 'data-mi-icd-chapter-trigger',
  'data-mi-icd-block-trigger', 'data-mi-icd-filter-parent', 'medindex:open-icd-sidebar',
]) assert.ok(sidebarJs.includes(marker), `Nested ICD sidebar runtime missing ${marker}`);

for (const marker of [
  "DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1'", 'data-open-code', 'detailOverlay',
  'Përdore në recetë', 'view=resolve', 'sessionStorage.setItem', 'focusables',
]) assert.ok(detailJs.includes(marker), `ICD detail and prescription transfer missing ${marker}`);

new Function(tableJs);
new Function(sidebarJs);
new Function(detailJs);
assert.doesNotMatch(tableCss, /https?:\/\//, 'ICD table CSS must not load external assets');
assert.doesNotMatch(sidebarCss, /https?:\/\//, 'ICD sidebar CSS must not load external assets');
assert.doesNotMatch(detailCss, /https?:\/\//, 'ICD detail CSS must not load external assets');

console.log('ICD legacy cards removed; unified table, nested sidebar and prescription transfer contract passed.');
