'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESKTOP_COLUMNS = 'registry-desktop-column-lite.js';
const UNIFIED_TABLE = 'registry-unified-table.js';
const INDEX = 'index.html';
const TABLE_TOOLS_CSS = 'registry-table-tools.css';
const FROZEN_CSS = 'registry-frozen-columns.css';
const STYLE_LOADER = 'first-page-style-loader.js';
const MARKER = 'registry-admin-stripe-freeze-v3';

const DESKTOP_PRIORITY = Object.freeze([
  'trade-name', 'active-substance', 'strength', 'form', 'number',
  'prescription-label', 'population', 'atc', 'drug-class', 'use', 'pdid',
  'protocol', 'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status',
  'wholesale-price', 'margin-price', 'vat', 'retail-price', 'validity',
]);

const FULL_ORDER = Object.freeze([
  'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',
  'pdid', 'protocol', 'strength', 'form', 'population', 'prescription-label',
  'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status', 'wholesale-price',
  'margin-price', 'vat', 'retail-price', 'validity', 'dosage-adult',
  'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',
]);

const CLINICAL_ORDER = Object.freeze([
  'select', 'trade-name', 'active-substance', 'strength', 'form', 'population',
  'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action',
  'dose-calculator',
]);

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(
  path.join(ROOT, file),
  source.replace(/\r\n?/g, '\n'),
  'utf8',
);

function reorderDesktopColumns() {
  let source = read(DESKTOP_COLUMNS);
  const marker = '  const columns = Object.freeze([';
  const start = source.indexOf(marker);
  const end = start >= 0 ? source.indexOf('\n  ]);', start) : -1;
  if (start < 0 || end < 0) {
    throw new Error('Admin Stripe finalizer: desktop column block mungon.');
  }

  const body = source.slice(start + marker.length, end);
  const keyed = new Map();
  const other = [];

  for (const line of body.split('\n').filter(line => line.trim())) {
    const match = line.match(/key:'([^']+)'/);
    if (!match) {
      other.push(line);
      continue;
    }
    keyed.set(match[1], line);
  }

  const ordered = [];
  for (const key of DESKTOP_PRIORITY) {
    if (!keyed.has(key)) continue;
    ordered.push(keyed.get(key));
    keyed.delete(key);
  }
  for (const line of keyed.values()) ordered.push(line);

  source = source.slice(0, start)
    + `${marker}\n${[...ordered, ...other].join('\n')}`
    + source.slice(end);

  if (!source.includes(MARKER)) {
    source = source.replace(
      marker,
      `  // ${MARKER}: trade name → substance → strength → form; Nr/prescription stay available but unfrozen.\n${marker}`,
    );
  }

  write(DESKTOP_COLUMNS, source);
}

function replaceOrder(source, name, order) {
  const pattern = new RegExp(
    `  const ${name} = Object\\.freeze\\(\\[\\n[\\s\\S]*?\\n  \\]\\);`,
  );
  if (!pattern.test(source)) {
    throw new Error(`Admin Stripe finalizer: ${name} mungon.`);
  }

  const lines = [];
  for (let i = 0; i < order.length; i += 5) {
    lines.push(`    ${order.slice(i, i + 5).map(key => `'${key}'`).join(', ')},`);
  }

  return source.replace(
    pattern,
    `  const ${name} = Object.freeze([\n${lines.join('\n')}\n  ]);`,
  );
}

function patchUnifiedTable() {
  let source = read(UNIFIED_TABLE);
  source = replaceOrder(source, 'FULL_ORDER', FULL_ORDER);
  source = replaceOrder(source, 'CLINICAL_ORDER', CLINICAL_ORDER);
  source = source.replace(
    /  const CLINICAL_BASE_KEYS = Object\.freeze\(\[[^\n]*\]\);/,
    "  const CLINICAL_BASE_KEYS = Object.freeze(['trade-name', 'active-substance', 'strength', 'form', 'population']);",
  );

  /* Remove the retired prescription-freeze offset if a stale generated tree
     still contains it. Frozen identity is now owned by
     registry-frozen-columns.css: selection + trade name only. */
  source = source
    .replace(/^\s*table\.style\.removeProperty\('--registry-frozen-prescription-left'\);\s*$/gm, '')
    .replace(/^\s*table\.style\.setProperty\('--registry-frozen-prescription-left'[^\n]*\);\s*$/gm, '');

  if (!source.includes(MARKER)) {
    source = source.replace(
      '  const FULL_ORDER = Object.freeze([',
      `  // ${MARKER}: clinical identity remains trade name → substance → strength → form; prescription notation is not frozen.\n  const FULL_ORDER = Object.freeze([`,
    );
  }

  write(UNIFIED_TABLE, source);
}

function verifyToolbarVisibility() {
  const source = read(TABLE_TOOLS_CSS);
  for (const required of [
    '#statusFilter',
    '#pageSize',
    '.selection-badge',
    '#protocolsBtn',
    '.clinical-editor-progress',
  ]) {
    if (!source.includes(required)) {
      throw new Error(`Admin Stripe finalizer: hidden toolbar contract missing ${required}.`);
    }
  }
}

function patchAssetVersions() {
  let index = read(INDEX);
  index = index.replace(
    /first-page-style-loader\.js\?v=[^"'&]+/g,
    'first-page-style-loader.js?v=20260828-canonical-v3',
  );
  index = index.replace(
    /registry-table-tools\.css\?v=[^"'&]+/g,
    'registry-table-tools.css?v=20260828-admin-stripe-v3',
  );
  write(INDEX, index);
}

function verify() {
  const desktop = read(DESKTOP_COLUMNS);
  const trade = desktop.indexOf("key:'trade-name'");
  const active = desktop.indexOf("key:'active-substance'");
  const strength = desktop.indexOf("key:'strength'");
  const form = desktop.indexOf("key:'form'");
  const number = desktop.indexOf("key:'number'");
  const prescription = desktop.indexOf("key:'prescription-label'");

  if (!(trade >= 0
    && active > trade
    && strength > active
    && form > strength
    && number > form
    && prescription > number)) {
    throw new Error(
      'Admin Stripe finalizer: desktop priority is not trade → substance → strength → form → Nr → prescription.',
    );
  }

  const unified = read(UNIFIED_TABLE);
  if (!unified.includes("'select', 'trade-name', 'active-substance', 'strength', 'form'")) {
    throw new Error('Admin Stripe finalizer: clinical-first unified order mungon.');
  }
  if (unified.includes('--registry-frozen-prescription-left')) {
    throw new Error('Admin Stripe finalizer: retired prescription frozen offset is still present.');
  }

  const frozen = read(FROZEN_CSS);
  for (const required of [
    '[data-registry-column-key="select"]',
    '[data-registry-column-key="trade-name"]',
    '[data-registry-column-key="number"]',
    '[data-registry-column-key="prescription-label"]',
    'left:44px!important',
  ]) {
    if (!frozen.includes(required)) {
      throw new Error(`Admin Stripe finalizer: frozen CSS contract missing ${required}.`);
    }
  }

  const loader = read(STYLE_LOADER);
  if (!loader.includes('first-page-style-loader-20260828-canonical-v3')
    || !loader.includes('registry-frozen-columns.css?v=20260828-admin-stripe-v3')
    || !loader.includes('placeCanonicalRegistryStylesLast')) {
    throw new Error('Admin Stripe finalizer: canonical cascade loader mungon.');
  }

  const index = read(INDEX);
  if (!index.includes('first-page-style-loader.js?v=20260828-canonical-v3')
    || !index.includes('registry-table-tools.css?v=20260828-admin-stripe-v3')) {
    throw new Error('Admin Stripe finalizer: index asset cache versions mungojnë.');
  }

  verifyToolbarVisibility();
}

reorderDesktopColumns();
patchUnifiedTable();
patchAssetVersions();
verify();

console.log(
  'Registry finalized: Admin Stripe clinical identity preserved; selection + trade name are the only frozen desktop identity columns; legacy Auditimi stays hidden.',
);

// This finalizer remains the last registry build step before Phase 18 smart
// search. Phase 18 owns only the latency/autocomplete cache contract.
require('./patch-phase18-smart-search.js');
