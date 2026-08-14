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
source = source.replace("      ['protocolsBtn', 'prescription-builder'],\n", '');

if (/prescription-selection|select-page-for-prescription/.test(source)) throw new Error('Phase 13 legacy selection handoff remains.');
if (source.includes("['protocolsBtn', 'prescription-builder']")) throw new Error('Phase 13 protocolsBtn still hands off to full registry.');
if (source.includes('desktop-full-detail')) throw new Error('Phase 13 redundant per-row desktop detail handoff remains.');
if (source.includes("tbody.querySelectorAll('[data-registry-column-key=\"trade-name\"]')")) {
  throw new Error('Phase 13 per-row trade-name listeners must be delegated to registry-row-expand/targeted-detail.');
}
fs.writeFileSync(FILE, source, 'utf8');
console.log('Phase 13 removed legacy desktop handoffs/listeners and skips unchanged desktop header rebuilds; delegated lightweight runtimes own normal interactions.');
