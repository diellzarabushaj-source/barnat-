'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

function removeBlock(start, end, label) {
  const a = source.indexOf(start);
  if (a < 0) return;
  const b = source.indexOf(end, a);
  if (b < 0) throw new Error(`Phase 13 could not find ${label} end.`);
  source = source.slice(0, a) + source.slice(b);
}

function removeTradeNameListenerBlock() {
  const start = "    tbody.querySelectorAll('[data-registry-column-key=\"trade-name\"]').forEach(cell => {";
  const renderRowsClose = '\n  }\n\n  function renderCount() {';
  const a = source.indexOf(start);
  if (a < 0) return;
  const b = source.indexOf(renderRowsClose, a);
  if (b < 0) throw new Error('Phase 13 could not find redundant per-row trade-name detail listeners end.');
  // Preserve the closing brace of renderRows(); only the per-row listener loop
  // is redundant because row-expand and targeted-detail already delegate clicks.
  source = source.slice(0, a) + source.slice(b);
}

function patchHeaderRenderChurn() {
  const before = `  function buildHeader() {\n    const header = document.getElementById('headerRow');\n    if (!header) return;`;
  const after = `  function buildHeader() {\n    const header = document.getElementById('headerRow');\n    if (!header) return;\n    const signature = state.sort + '|' + state.direction;\n    if (header.dataset.desktopLiteHeaderSignature === signature) return;\n    header.dataset.desktopLiteHeaderSignature = signature;`;

  if (!source.includes(after)) {
    if (!source.includes(before)) throw new Error('Phase 13 could not find desktop header render anchor.');
    source = source.replace(before, after);
  }

  if (!source.includes("header.dataset.desktopLiteHeaderSignature === signature")) {
    throw new Error('Phase 13 desktop header must skip rebuilds when sort state is unchanged.');
  }
}

function patchPaginationDelegation() {
  if (!source.includes('function onDesktopLitePaginationClick(event)')) {
    const renderAnchor = `  function renderPagination() {`;
    if (!source.includes(renderAnchor)) throw new Error('Phase 13 could not find desktop pagination render anchor.');
    const delegated = `  function onDesktopLitePaginationClick(event) {\n    const button = event.target.closest?.('[data-desktop-lite-page]');\n    const pagination = document.getElementById('pagination');\n    if (!button || !pagination?.contains(button) || state.loading || state.disabled) return;\n    const direction = button.dataset.desktopLitePage;\n    if (direction === 'prev') {\n      if (state.page <= 1) return;\n      state.page -= 1;\n    } else if (direction === 'next') {\n      if (!state.hasNext) return;\n      state.page += 1;\n    } else return;\n    void loadPage({ includeTotal:false, scroll:true });\n  }\n\n${renderAnchor}`;
    source = source.replace(renderAnchor, delegated);
  }

  const oldPrev = `    pagination.querySelector('[data-desktop-lite-page="prev"]')?.addEventListener('click', () => {\n      if (state.page <= 1 || state.loading) return;\n      state.page -= 1;\n      void loadPage({ includeTotal:false, scroll:true });\n    });\n`;
  const oldNext = `    pagination.querySelector('[data-desktop-lite-page="next"]')?.addEventListener('click', () => {\n      if (!state.hasNext || state.loading) return;\n      state.page += 1;\n      void loadPage({ includeTotal:false, scroll:true });\n    });\n`;
  source = source.replace(oldPrev, '').replace(oldNext, '');

  const controlsBefore = `  function configureControls() {\n    const search = document.getElementById('search');`;
  const controlsAfter = `  function configureControls() {\n    document.getElementById('pagination')?.addEventListener('click', onDesktopLitePaginationClick);\n    const search = document.getElementById('search');`;
  if (!source.includes(controlsAfter)) {
    if (!source.includes(controlsBefore)) throw new Error('Phase 13 could not find desktop control setup for pagination delegation.');
    source = source.replace(controlsBefore, controlsAfter);
  }

  if (!source.includes("document.getElementById('pagination')?.addEventListener('click', onDesktopLitePaginationClick)")) {
    throw new Error('Phase 13 delegated desktop pagination listener is missing.');
  }
  if (source.includes("pagination.querySelector('[data-desktop-lite-page=\"prev\"]')?.addEventListener") ||
      source.includes("pagination.querySelector('[data-desktop-lite-page=\"next\"]')?.addEventListener")) {
    throw new Error('Phase 13 per-render desktop pagination listeners must not return.');
  }
}

removeBlock(
  "    header.querySelector('[data-desktop-lite-select-all]')?.addEventListener('change', event => {",
  "    header.querySelectorAll('[data-desktop-lite-sort]').forEach(button => {",
  'select-all handoff',
);
removeBlock(
  "    tbody.querySelectorAll('.drug-select').forEach(input => {",
  "    tbody.querySelectorAll('[data-registry-column-key=\"trade-name\"]').forEach(cell => {",
  'row prescription-selection handoff',
);
removeTradeNameListenerBlock();
patchHeaderRenderChurn();
patchPaginationDelegation();
source = source.replace("      ['protocolsBtn', 'prescription-builder'],\n", '');

if (/prescription-selection|select-page-for-prescription/.test(source)) throw new Error('Phase 13 legacy selection handoff remains.');
if (source.includes("['protocolsBtn', 'prescription-builder']")) throw new Error('Phase 13 protocolsBtn still hands off to full registry.');
if (source.includes('desktop-full-detail')) throw new Error('Phase 13 redundant per-row desktop detail handoff remains.');
if (source.includes("tbody.querySelectorAll('[data-registry-column-key=\"trade-name\"]')")) {
  throw new Error('Phase 13 per-row trade-name listeners must be delegated to registry-row-expand/targeted-detail.');
}
fs.writeFileSync(FILE, source, 'utf8');
console.log('Phase 13 removes legacy desktop listener churn: delegated rows/pagination and stable headers own normal lightweight interactions.');
