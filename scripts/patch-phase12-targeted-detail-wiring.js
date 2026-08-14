'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const DETAIL_FILE = path.join(ROOT, 'registry-desktop-targeted-detail.js');

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

function patchTargetedDetailObserver() {
  let detail = fs.readFileSync(DETAIL_FILE, 'utf8').replace(/\r\n?/g, '\n');
  const oldObserver = `    const observer = new MutationObserver(records => {\n      let needsScan = false;\n      records.forEach(record => {\n        if (record.type === 'attributes') syncRow(record.target);\n        else if (record.type === 'childList' && record.target === tbody) needsScan = true;\n      });\n      if (needsScan) queueMicrotask(scan);\n    });\n    observer.observe(tbody, {\n      childList:true, subtree:true, attributes:true,\n      attributeFilter:['data-registry-row-expanded'],\n    });\n    scan();`;
  const leanObserver = `    const observer = new MutationObserver(records => {\n      if (records.some(record => record.type === 'childList' && record.target === tbody)) queueMicrotask(scan);\n    });\n    observer.observe(tbody, { childList:true });\n    window.addEventListener('medindex:registry-row-expanded-change', event => {\n      const row = event.detail?.row;\n      if (!row?.isConnected || row.parentElement !== tbody) return;\n      syncRow(row);\n    });\n    scan();`;

  if (!detail.includes(leanObserver)) {
    if (!detail.includes(oldObserver)) throw new Error('Phase 12 could not find the targeted-detail subtree observer contract.');
    detail = detail.replace(oldObserver, leanObserver);
  }

  if (!detail.includes("window.addEventListener('medindex:registry-row-expanded-change'")) {
    throw new Error('Phase 12 targeted detail must react to the canonical row-expanded change event.');
  }
  if (/observer\.observe\(tbody, \{[\s\S]*?subtree\s*:\s*true/.test(detail)) {
    throw new Error('Phase 12 targeted detail must not observe the entire tbody subtree.');
  }
  if (/attributeFilter:\s*\['data-registry-row-expanded'\]/.test(detail)) {
    throw new Error('Phase 12 targeted detail must not retain the old row-attribute observer.');
  }

  fs.writeFileSync(DETAIL_FILE, detail, 'utf8');
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

patchTargetedDetailObserver();
fs.writeFileSync(INDEX, source, 'utf8');
require('./patch-phase13-prescription-lite.js');
require('./patch-phase14-column-lite.js');

console.log('Phase 12-14 targeted detail uses event-driven row expansion plus direct-row observation; prescription and visible-column lightweight runtimes remain in one build cohort.');
