'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SCRIPT = '<script src="registry-desktop-targeted-detail.js?v=20260812-1" defer></script>';
const ANCHOR = '<script src="registry-row-expand.js?v=20260810-1" defer></script>';

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');
if (!source.includes(SCRIPT)) {
  if (!source.includes(ANCHOR)) throw new Error('Phase 12 wiring could not find registry-row-expand.js anchor.');
  source = source.replace(ANCHOR, `${ANCHOR}\n${SCRIPT}`);
  fs.writeFileSync(INDEX, source, 'utf8');
}

if (source.indexOf(SCRIPT) < source.indexOf(ANCHOR)) throw new Error('Phase 12 targeted detail must load after the existing row expander.');
console.log('Phase 12 targeted desktop detail runtime wired after the canonical row expander.');
