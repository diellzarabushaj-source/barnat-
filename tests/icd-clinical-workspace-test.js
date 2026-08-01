const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('icd.html');
const tableJs = read('icd-full-table.js');
const sidebarJs = read('icd-sidebar.js');
const api = read('api/icd.js');
const hierarchy = read('lib/icd-full-hierarchy.js');

const staticStyles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
assert.match(staticStyles.at(-1), /tailadmin-professional\.css/, 'The professional shell must remain the final static stylesheet.');

for (const marker of [
  'ICD-10 — hierarkia e plotë', 'icd-registry-intro', 'icd-registry-panel',
  'icdOpenSidebar', 'icdClearFilters', 'icdLevelFilter', 'icdPageSize',
  'Titulli shqip', 'Titulli anglisht', 'Përkthimi', 'Veprimet',
]) assert.ok(html.includes(marker), `ICD table workspace missing ${marker}`);

for (const removed of [
  'icd-clinical-hero', 'icd-hero-stats', 'icd-workbench', 'icd-quick-nav',
  'data-icd-quick=', 'chapterGrid', 'icdGrid', 'detailOverlay',
]) assert.ok(!html.includes(removed), `Legacy ICD workspace must remain removed: ${removed}`);

for (const marker of [
  'readState', 'stateUrl', 'apiUrl', 'renderTable', 'renderContext', 'renderSuggestions',
  'chooseNode', 'copyCode', 'MedIndexIcdTable', 'medindex:icd-table-ready',
  'aria-expanded', 'ArrowDown', 'ArrowUp', 'Escape',
]) assert.ok(tableJs.includes(marker), `ICD table runtime missing ${marker}`);

for (const marker of [
  'loadNavigation', 'loadCategories', 'resolveActive', 'syncActive',
  'setRootOpen', 'setChapterOpen', 'setBlockOpen', 'closeMobileSidebar',
  'MutationObserver', 'medindex:tailadmin-ready',
]) assert.ok(sidebarJs.includes(marker), `ICD nested navigation missing ${marker}`);

for (const marker of [
  "FULL_SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0'",
  "FULL_SHEET_GID = 329283560", "'table', 'nav', 'children', 'resolve', 'suggest', 'meta'",
  'loadFullHierarchy', 'fullViewPayload', 'X-MedIndex-ICD-Nodes',
]) assert.ok(api.includes(marker), `ICD API full hierarchy mode missing ${marker}`);

for (const marker of [
  'levels || params.level', 'childrenOf', 'ancestorsOf', 'nodeMap',
]) assert.ok(hierarchy.includes(marker), `ICD hierarchy query layer missing ${marker}`);

assert.match(html, /role="combobox"/);
assert.match(html, /role="listbox"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /tabindex="0" aria-label="Tabela ICD-10 me scroll horizontal"/);
assert.doesNotMatch(tableJs, /innerHTML\s*=\s*[^;]*location\./, 'URL values must not be injected directly into markup');

new Function(tableJs);
new Function(sidebarJs);
new Function(api);
new Function(hierarchy);
console.log('ICD full hierarchy table, nested navigation and accessibility audit passed.');
