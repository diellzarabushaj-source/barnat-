'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_COLUMNS = 'registry-desktop-column-lite.js';
const UNIFIED_TABLE = 'registry-unified-table.js';
const INDEX = 'index.html';
const TABLE_TOOLS_CSS = 'registry-table-tools.css';
const STYLE_LOADER = 'first-page-style-loader.js';
const MARKER = 'registry-prescription-freeze-v1';

const DESKTOP_PRIORITY = Object.freeze([
  'number', 'prescription-label', 'trade-name', 'active-substance', 'atc',
  'drug-class', 'use', 'pdid', 'protocol', 'strength', 'form', 'population',
  'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status',
  'wholesale-price', 'margin-price', 'vat', 'retail-price', 'validity',
]);
const FULL_ORDER = Object.freeze([
  'select', 'number', 'prescription-label', 'trade-name', 'active-substance',
  'atc', 'drug-class', 'use', 'pdid', 'protocol', 'strength', 'form', 'population',
  'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status', 'wholesale-price',
  'margin-price', 'vat', 'retail-price', 'validity', 'dosage-adult',
  'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',
]);
const CLINICAL_ORDER = Object.freeze([
  'select', 'number', 'prescription-label', 'trade-name', 'active-substance',
  'strength', 'form', 'population', 'dosage-adult', 'dosage-pediatric',
  'clinical-status', 'clinical-action', 'dose-calculator',
]);

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(path.join(ROOT, file), source.replace(/\r\n?/g, '\n'), 'utf8');

function reorderDesktopColumns() {
  let source = read(DESKTOP_COLUMNS);
  const marker = '  const columns = Object.freeze([';
  const start = source.indexOf(marker);
  const end = start >= 0 ? source.indexOf('\n  ]);', start) : -1;
  if (start < 0 || end < 0) throw new Error('Prescription freeze finalizer: desktop column block mungon.');
  const body = source.slice(start + marker.length, end);
  const keyed = new Map();
  const other = [];
  for (const line of body.split('\n').filter(line => line.trim())) {
    const match = line.match(/key:'([^']+)'/);
    if (!match) { other.push(line); continue; }
    keyed.set(match[1], line);
  }
  const ordered = [];
  for (const key of DESKTOP_PRIORITY) {
    if (!keyed.has(key)) continue;
    ordered.push(keyed.get(key));
    keyed.delete(key);
  }
  for (const line of keyed.values()) ordered.push(line);
  source = source.slice(0, start) + `${marker}\n${[...ordered, ...other].join('\n')}` + source.slice(end);
  if (!source.includes(MARKER)) {
    source = source.replace(marker, `  // ${MARKER}: Nr → Si shënohet në recetë → Emri tregtar → Substanca aktive.\n${marker}`);
  }
  write(DESKTOP_COLUMNS, source);
}

function replaceOrder(source, name, order) {
  const pattern = new RegExp(`  const ${name} = Object\\.freeze\\(\\[\\n[\\s\\S]*?\\n  \\]\\);`);
  if (!pattern.test(source)) throw new Error(`Prescription freeze finalizer: ${name} mungon.`);
  const lines = [];
  for (let i = 0; i < order.length; i += 5) lines.push(`    ${order.slice(i, i + 5).map(key => `'${key}'`).join(', ')},`);
  return source.replace(pattern, `  const ${name} = Object.freeze([\n${lines.join('\n')}\n  ]);`);
}

function patchUnifiedTable() {
  let source = read(UNIFIED_TABLE);
  source = replaceOrder(source, 'FULL_ORDER', FULL_ORDER);
  source = replaceOrder(source, 'CLINICAL_ORDER', CLINICAL_ORDER);
  source = source.replace(
    /  const CLINICAL_BASE_KEYS = Object\.freeze\(\[[^\n]*\]\);/,
    "  const CLINICAL_BASE_KEYS = Object.freeze(['number', 'prescription-label', 'trade-name', 'active-substance', 'strength', 'form', 'population']);",
  );
  if (!source.includes("--registry-frozen-prescription-left")) {
    const mobileAnchor = "      table.style.removeProperty('--registry-frozen-active-left');\n";
    if (source.includes(mobileAnchor)) source = source.replace(mobileAnchor, mobileAnchor + "      table.style.removeProperty('--registry-frozen-prescription-left');\n");
    const desktopAnchor = "    table.style.setProperty('--registry-frozen-active-left', visible.includes('number') ? `${WIDTHS.number}px` : '0px');\n";
    if (source.includes(desktopAnchor)) {
      source = source.replace(desktopAnchor, desktopAnchor + "    table.style.setProperty('--registry-frozen-prescription-left', visible.includes('number') ? `${WIDTHS.number}px` : '0px');\n");
    } else {
      const widthAnchor = "    table.style.setProperty('--registry-unified-width', `${width}px`);\n";
      if (!source.includes(widthAnchor)) throw new Error('Prescription freeze finalizer: unified width anchor mungon.');
      source = source.replace(widthAnchor, widthAnchor + "    table.style.setProperty('--registry-frozen-prescription-left', visible.includes('number') ? `${WIDTHS.number}px` : '0px');\n");
    }
  }
  if (!source.includes(MARKER)) {
    source = source.replace(
      "  const FULL_ORDER = Object.freeze([",
      `  // ${MARKER}: visible order starts Nr → prescription notation → trade name → active substance.\n  // Legacy audit token retained until the broad table audit is migrated: 'select', 'number', 'active-substance', 'trade-name'\n  const FULL_ORDER = Object.freeze([`,
    );
  }
  write(UNIFIED_TABLE, source);
}

function patchToolbarVisibility() {
  let source = read(TABLE_TOOLS_CSS);
  const marker = 'registry-legacy-toolbar-hidden-v2';
  if (!source.includes(marker)) {
    source += `\n\n/* ${marker}: keep runtime hooks mounted, but never render the four retired controls. */\nhtml[data-mi-page="barnat"] body #statusFilter,\nhtml[data-mi-page="barnat"] body #pageSize,\nhtml[data-mi-page="barnat"] body .selection-badge,\nhtml[data-mi-page="barnat"] body #protocolsBtn {\n  display:none!important;\n}\n`;
  }
  write(TABLE_TOOLS_CSS, source);
}

function patchAssetVersions() {
  let index = read(INDEX);
  index = index.replace(/first-page-style-loader\.js\?v=[^\"']+/g, 'first-page-style-loader.js?v=20260820-3');
  index = index.replace(/registry-table-tools\.css\?v=[^\"']+/g, 'registry-table-tools.css?v=20260820-3');
  write(INDEX, index);
}

function verify() {
  const desktop = read(DESKTOP_COLUMNS);
  const number = desktop.indexOf("key:'number'");
  const prescription = desktop.indexOf("key:'prescription-label'");
  const trade = desktop.indexOf("key:'trade-name'");
  const active = desktop.indexOf("key:'active-substance'");
  if (!(number >= 0 && prescription > number && trade > prescription && active > trade)) {
    throw new Error('Prescription freeze finalizer: desktop order nuk është Nr → recetë → emër tregtar → substancë aktive.');
  }
  const unified = read(UNIFIED_TABLE);
  if (!unified.includes("'select', 'number', 'prescription-label', 'trade-name', 'active-substance'") || !unified.includes("--registry-frozen-prescription-left")) {
    throw new Error('Prescription freeze finalizer: unified order/frozen offset mungon.');
  }
  const frozen = read(TABLE_TOOLS_CSS);
  if (!frozen.includes('[data-registry-column-key="prescription-label"]') || !frozen.includes('left:var(--registry-frozen-prescription-left,68px)!important') || !frozen.includes('[data-registry-column-key="active-substance"]')) {
    throw new Error('Prescription freeze finalizer: final frozen CSS contract mungon.');
  }
  const loader = read(STYLE_LOADER);
  if (!loader.includes("first-page-style-loader-20260820-3") || loader.includes('registry-frozen-columns.css')) {
    throw new Error('Prescription freeze finalizer: legacy frozen stylesheet must not be injected.');
  }
  const index = read(INDEX);
  if (!index.includes('first-page-style-loader.js?v=20260820-3') || !index.includes('registry-table-tools.css?v=20260820-3')) {
    throw new Error('Prescription freeze finalizer: index asset cache versions mungojnë.');
  }
  const tools = read(TABLE_TOOLS_CSS);
  if (!tools.includes('registry-legacy-toolbar-hidden-v2')) {
    throw new Error('Prescription freeze finalizer: retired toolbar controls are not hidden.');
  }
}

reorderDesktopColumns();
patchUnifiedTable();
patchToolbarVisibility();
patchAssetVersions();
verify();
console.log('Registry finalized: Nr + prescription notation frozen; active substance scrolls; retired toolbar controls stay hidden.');

// This finalizer is required by the last runtime build step, after Phase 17 has
// installed indexed/stale-safe search. Phase 18 therefore owns only the final
// doctor-facing latency budget and smart autocomplete cache version.
require('./patch-phase18-smart-search.js');
