'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

const DETAIL_SRC = 'registry-desktop-targeted-detail.js?v=20260812-1';
const PRESCRIPTION_SRC = 'registry-desktop-prescription-lite.js?v=20260812-1';
const COLUMN_SRC = 'registry-desktop-column-lite.js?v=20260812-1';
const ROW_PATTERN = /<script src="registry-row-expand\.js\?v=20260810-1(?:&[^"]*)?" defer><\/script>/;
const DETAIL_PATTERN = /<script src="registry-desktop-targeted-detail\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;
const PRESCRIPTION_PATTERN = /<script src="registry-desktop-prescription-lite\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;
const COLUMN_PATTERN = /<script src="registry-desktop-column-lite\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

function buildQueryFrom(tag) {
  return tag.match(/&build=[^"]+/)?.[0] || '';
}

function ensureAfter(anchorPattern, targetPattern, targetSrc, missingAnchorMessage) {
  const anchorMatch = source.match(anchorPattern);
  if (!anchorMatch) throw new Error(missingAnchorMessage);

  const desired = `<script src="${targetSrc}${buildQueryFrom(anchorMatch[0])}" defer></script>`;
  const existing = source.match(targetPattern);

  if (existing) {
    if (existing[0] !== desired) source = source.replace(existing[0], desired);
    return;
  }

  source = source.replace(anchorPattern, `${anchorMatch[0]}\n${desired}`);
}

ensureAfter(
  ROW_PATTERN,
  DETAIL_PATTERN,
  DETAIL_SRC,
  'Phase 12 wiring could not find registry-row-expand.js anchor.',
);
ensureAfter(
  DETAIL_PATTERN,
  PRESCRIPTION_PATTERN,
  PRESCRIPTION_SRC,
  'Phase 13 wiring could not find targeted-detail anchor.',
);
ensureAfter(
  PRESCRIPTION_PATTERN,
  COLUMN_PATTERN,
  COLUMN_SRC,
  'Phase 14 wiring could not find prescription-lite anchor.',
);

const rowIndex = source.search(ROW_PATTERN);
const detailIndex = source.search(DETAIL_PATTERN);
const prescriptionIndex = source.search(PRESCRIPTION_PATTERN);
const columnIndex = source.search(COLUMN_PATTERN);
if (rowIndex < 0 || detailIndex <= rowIndex) throw new Error('Phase 12 targeted detail must load after the existing row expander.');
if (prescriptionIndex <= detailIndex) throw new Error('Phase 13 prescription bridge must load after targeted detail.');
if (columnIndex <= prescriptionIndex) throw new Error('Phase 14 column-lite runtime must load after prescription bridge.');

fs.writeFileSync(INDEX, source, 'utf8');
require('./patch-phase13-prescription-lite.js');
require('./patch-phase14-column-lite.js');

console.log('Phase 12-14 targeted detail, prescription and visible-column lightweight runtimes wired after the canonical row expander with one build cohort.');
