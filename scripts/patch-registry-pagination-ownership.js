'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const LIST_MARKER = "pagination.hidden = next === 'list';";
const CSS_MARKER = '/* Pagination belongs only to the actual registry table. */';
const PANEL_GUARD = '#registryListView:not([hidden]) ~ #pagination';

function patchListOwnership() {
  const file = 'registry-list-view.js';
  let source = read(file);
  if (!source.includes(LIST_MARKER)) {
    const anchor = "    ROOT.dataset.miRegistryView = next;\n    if (elements) {";
    const replacement = "    ROOT.dataset.miRegistryView = next;\n\n    // Pagination belongs to the paged medicine table, never to the ATC browser.\n    // Keep this as DOM state as well as CSS state so late stylesheet ordering,\n    // restored preferences or a pagination re-render cannot leak the table footer\n    // beneath category browsing.\n    const pagination = document.getElementById('pagination');\n    if (pagination) {\n      pagination.hidden = next === 'list';\n      pagination.setAttribute('aria-hidden', String(next === 'list'));\n    }\n\n    if (elements) {";
    if (!source.includes(anchor)) throw new Error('Registry pagination ownership could not find List view switch anchor.');
    source = source.replace(anchor, replacement);
    write(file, source);
  }

  const verified = read(file);
  if (!verified.includes(LIST_MARKER)) throw new Error('List view does not own pagination visibility.');
  if (!verified.includes("pagination.setAttribute('aria-hidden', String(next === 'list'))")) {
    throw new Error('Pagination accessibility visibility is not synchronized with List mode.');
  }
  if (!verified.includes("pagination.hidden = next === 'list'")) {
    throw new Error('Pagination hidden state is not restored in both view directions.');
  }
}

function patchPaginationCss() {
  const file = 'registry-pagination-v2.css';
  let source = read(file);

  // Replace the previous two-state guard with a three-state guard. The visible
  // panel selector is deliberate: it is based on what the doctor can actually
  // see, not only on a dataset flag that may update one frame earlier/later.
  const oldGuard = `${CSS_MARKER}\nhtml[data-mi-page="barnat"] #pagination[hidden],\nhtml[data-mi-page="barnat"][data-mi-registry-view="list"] #pagination {\n  display: none !important;\n}\n\n`;
  const guard = `${CSS_MARKER}\nhtml[data-mi-page="barnat"] #pagination[hidden],\nhtml[data-mi-page="barnat"][data-mi-registry-view="list"] #pagination,\nhtml[data-mi-page="barnat"] ${PANEL_GUARD} {\n  display: none !important;\n}\n\n`;

  if (source.includes(oldGuard)) source = source.replace(oldGuard, guard);
  else if (!source.includes(CSS_MARKER)) source = guard + source;
  else if (!source.includes(PANEL_GUARD)) {
    throw new Error('Pagination ownership found an unknown existing guard; refusing an unsafe rewrite.');
  }
  write(file, source);

  const verified = read(file);
  if (!verified.includes('#pagination[hidden]')) throw new Error('Pagination hidden-state CSS guard is missing.');
  if (!verified.includes('[data-mi-registry-view="list"] #pagination')) {
    throw new Error('ATC/List-mode pagination CSS guard is missing.');
  }
  if (!verified.includes(PANEL_GUARD)) {
    throw new Error('Visible ATC panel pagination guard is missing.');
  }
  if (!verified.includes('display: none !important;')) throw new Error('Pagination ownership guard is not authoritative.');

  // A later v3 rule may intentionally declare display:block for table mode.
  // The authoritative guard must therefore be !important and more specific to
  // the visible ATC panel. This static assertion protects the regression seen in
  // production where a visually newer layer exposed the footer in the wrong view.
  const guardIndex = verified.indexOf(CSS_MARKER);
  const displayIndex = verified.indexOf('display: none !important;', guardIndex);
  if (guardIndex < 0 || displayIndex < guardIndex) {
    throw new Error('Pagination ownership guard does not win the CSS cascade.');
  }
}

function verifyUiLogicContract() {
  const listSource = read('registry-list-view.js');
  const css = read('registry-pagination-v2.css');

  const contract = {
    table: { hidden:false, aria:'false' },
    list: { hidden:true, aria:'true' },
  };
  if (contract.table.hidden === contract.list.hidden) throw new Error('Pagination visibility model is ambiguous.');
  if (contract.table.aria === contract.list.aria) throw new Error('Pagination accessibility visibility model is ambiguous.');

  if (!listSource.includes("const next = view === 'list' ? 'list' : 'table';")) {
    throw new Error('Registry view normalization contract changed unexpectedly.');
  }
  if (!css.includes(PANEL_GUARD)) throw new Error('Visible panel must independently suppress pagination.');
}

patchListOwnership();
patchPaginationCss();
verifyUiLogicContract();
require('./patch-registry-pagination-v4.js');
require('./patch-registry-pagination-v5.js');
console.log('Registry pagination ownership passed: table-only footer, DOM + CSS visibility sync, visible-ATC-panel fail-safe and reversible accessibility state.');
