'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const DETAIL_SCRIPT = '<script src="registry-desktop-targeted-detail.js?v=20260812-1" defer></script>';
const PRESCRIPTION_SCRIPT = '<script src="registry-desktop-prescription-lite.js?v=20260812-1" defer></script>';
const ROW_ANCHOR = '<script src="registry-row-expand.js?v=20260810-1" defer></script>';

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');
if (!source.includes(DETAIL_SCRIPT)) {
  if (!source.includes(ROW_ANCHOR)) throw new Error('Phase 12 wiring could not find registry-row-expand.js anchor.');
  source = source.replace(ROW_ANCHOR, `${ROW_ANCHOR}\n${DETAIL_SCRIPT}`);
}
if (!source.includes(PRESCRIPTION_SCRIPT)) {
  if (!source.includes(DETAIL_SCRIPT)) throw new Error('Phase 13 wiring could not find targeted-detail anchor.');
  source = source.replace(DETAIL_SCRIPT, `${DETAIL_SCRIPT}\n${PRESCRIPTION_SCRIPT}`);
}
fs.writeFileSync(INDEX, source, 'utf8');
require('./patch-phase13-prescription-lite.js');

if (source.indexOf(DETAIL_SCRIPT) < source.indexOf(ROW_ANCHOR)) throw new Error('Phase 12 targeted detail must load after the existing row expander.');
if (source.indexOf(PRESCRIPTION_SCRIPT) < source.indexOf(DETAIL_SCRIPT)) throw new Error('Phase 13 prescription bridge must load after targeted detail.');
console.log('Phase 12/13 targeted detail and lightweight prescription runtimes wired after the canonical row expander.');
