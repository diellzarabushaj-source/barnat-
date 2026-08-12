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
source = source.replace("      ['protocolsBtn', 'prescription-builder'],\n", '');

if (/prescription-selection|select-page-for-prescription/.test(source)) throw new Error('Phase 13 legacy selection handoff remains.');
if (source.includes("['protocolsBtn', 'prescription-builder']")) throw new Error('Phase 13 protocolsBtn still hands off to full registry.');
fs.writeFileSync(FILE, source, 'utf8');
console.log('Phase 13 removed legacy desktop prescription handoffs; lightweight selection bridge owns the normal path.');
