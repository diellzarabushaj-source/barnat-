'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const tree = read('icd-tree.js');
const sidebar = read('icd-sidebar.js');
const apiWrapper = read('api/icd.js');
const apiBase = read('lib/icd-api-base.js');
const publicSource = read('lib/icd-public-source.js');
const hierarchy = read('lib/icd-full-hierarchy.js');

const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
assert.match(styles.at(-1), /tailadmin-professional\.css/, 'Professional shell must remain the final static stylesheet.');

for (const marker of [
  'ICD-10 — shfletuesi hierarkik', 'icd-tree-panel', 'id="icdTree"', 'role="tree"',
  'id="icdSearch"', 'id="icdSuggestions"', 'id="icdCollapseAll"', 'id="icdTreeRetry"',
  'Kapitujt, blloqet, kategoritë dhe nënkategoritë ICD-10',
]) assert.ok(html.includes(marker), `ICD tree workspace missing ${marker}`);

for (const removed of [
  'id="icdTable"', 'id="icdTableBody"', 'id="icdPagination"', 'icdPageSize', 'icdLevelFilter',
  'icd-clinical-hero', 'icd-hero-stats', 'icd-workbench', 'chapterGrid', 'icdGrid',
]) assert.ok(!html.includes(removed), `Table or legacy ICD workspace must remain removed: ${removed}`);

for (const marker of [
  'loadNavigation', 'loadChildren', 'expandNode', 'collapseNode', 'collapseSiblings',
  'revealCode', 'visibleButtons', 'loadSuggestions', 'MedIndexIcdTable',
  'medindex:icd-tree-ready', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End',
]) assert.ok(tree.includes(marker), `ICD tree runtime missing ${marker}`);

for (const marker of [
  'loadNavigation', 'loadCategories', 'resolveActive', 'syncActive',
  'setRootOpen', 'setChapterOpen', 'setBlockOpen', 'closeMobileSidebar',
]) assert.ok(sidebar.includes(marker), `ICD nested sidebar missing ${marker}`);

for (const marker of [
  "require('../lib/icd-public-source.js')", "'table', 'nav', 'children', 'resolve', 'suggest', 'meta'",
  'IcdPublicSource.load()', 'fullViewPayload', 'X-MedIndex-ICD-Nodes', 'X-MedIndex-ICD-Revision',
]) assert.ok(apiBase.includes(marker), `ICD API full hierarchy mode missing ${marker}`);
for (const marker of [
  "SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0'", 'SHEET_GID = 329283560',
  'validateCsv', 'strictCounts:true', 'sourceMeta', 'staleReason',
]) assert.ok(publicSource.includes(marker), `Shared ICD source missing ${marker}`);
assert.ok(!apiBase.includes('1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0'), 'Full spreadsheet ID must not be duplicated in the API handler.');

for (const marker of [
  "require('../lib/icd-api-base.js')", "require('../lib/icd-advanced-handler.js')", "String(req.query?.advanced || '') === '1'",
]) assert.ok(apiWrapper.includes(marker), `ICD API router missing ${marker}`);
for (const marker of ['childrenOf', 'ancestorsOf', 'nodeMap', 'attachIndexes', 'childCountOf']) {
  assert.ok(hierarchy.includes(marker), `Hierarchy layer missing ${marker}`);
}

assert.match(html, /role="combobox"/);
assert.match(html, /role="listbox"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /aria-busy="true"/);
assert.doesNotMatch(tree, /innerHTML\s*=\s*[^;]*location\./, 'URL values must not be injected into markup.');
new Function(tree);
new Function(sidebar);
new Function(apiWrapper);
new Function(apiBase);
new Function(publicSource);
new Function(hierarchy);
console.log('ICD hierarchy tree, indexed public source and shared API routing audit passed.');
