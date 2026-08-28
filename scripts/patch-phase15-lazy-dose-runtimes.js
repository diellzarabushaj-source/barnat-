'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const LOADER_SRC = 'registry-dose-interaction-loader.js?v=20260814-1';
const INSULIN_STYLES = Object.freeze([
  'registry-novorapid-simple-calculator.css',
  'registry-novomix30-simple-calculator.css',
  'registry-other-insulins-simple-calculator.css',
]);
const INSULIN_SCRIPTS = Object.freeze([
  'registry-novorapid-simple-calculator.js',
  'registry-novomix30-simple-calculator.js',
  'registry-other-insulins-simple-calculator.js',
  'registry-insulin-final-safety.js',
]);

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeStaticStyle(asset) {
  const pattern = new RegExp(`^[ \\t]*<link\\s+[^>]*href="${escapeRegExp(asset)}[^\"]*"[^>]*>\\n?`, 'm');
  source = source.replace(pattern, '');
}

function removeStaticScript(asset) {
  const pattern = new RegExp(`^[ \\t]*<script\\s+[^>]*src="${escapeRegExp(asset)}[^\"]*"[^>]*><\\/script>\\n?`, 'm');
  source = source.replace(pattern, '');
}

INSULIN_STYLES.forEach(removeStaticStyle);
INSULIN_SCRIPTS.forEach(removeStaticScript);

const rowBridgePattern = /<script src="registry-insulin-row-bridge\.js\?[^\"]+" defer><\/script>/;
const rowBridge = source.match(rowBridgePattern)?.[0] || '';
if (!rowBridge) throw new Error('Phase 15 lazy dose runtime patch could not find the insulin row bridge anchor.');

const buildQuery = rowBridge.match(/&build=[^\"]+/)?.[0] || '';
const loaderTag = `<script src="${LOADER_SRC}${buildQuery}" defer></script>`;
const existingLoaderPattern = /<script src="registry-dose-interaction-loader\.js\?[^\"]+" defer><\/script>/;
if (existingLoaderPattern.test(source)) source = source.replace(existingLoaderPattern, loaderTag);
else source = source.replace(rowBridge, `${loaderTag}\n${rowBridge}`);

for (const asset of INSULIN_STYLES) {
  const staticPattern = new RegExp(`<link\\s+[^>]*href="${escapeRegExp(asset)}[^\"]*"`, 'i');
  if (staticPattern.test(source)) throw new Error(`Phase 15 must not statically load ${asset}.`);
}
for (const asset of INSULIN_SCRIPTS) {
  const staticPattern = new RegExp(`<script\\s+[^>]*src="${escapeRegExp(asset)}[^\"]*"`, 'i');
  if (staticPattern.test(source)) throw new Error(`Phase 15 must not statically load ${asset}.`);
}
if (!source.includes('registry-insulin-row-bridge.js')) {
  throw new Error('Phase 15 must keep the insulin row bridge in the startup path so visible Smart Insulin controls remain unchanged.');
}
if (!source.includes('registry-insulin-deep-audit.css')) {
  throw new Error('Phase 15 must keep the visible Smart Insulin table styling in the startup path.');
}
if (source.indexOf('registry-dose-interaction-loader.js') > source.indexOf('registry-insulin-row-bridge.js')) {
  throw new Error('Phase 15 interaction loader must initialize before the insulin row bridge.');
}

fs.writeFileSync(INDEX, source, 'utf8');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
}

function write(file, value) {
  fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');
}

function replaceRequired(value, before, after, label) {
  if (value.includes(after)) return value;
  if (!value.includes(before)) throw new Error(`Phase 15 could not find ${label}.`);
  return value.replace(before, after);
}

function validateCanonicalTableOwner() {
  for (const file of ['app-runtime.js', 'app-runtime-performance.js']) {
    const runtime = read(file);
    const nr = runtime.indexOf("key:'Nr rendor'");
    const substance = runtime.indexOf("key:'Substanca aktive'");
    const trade = runtime.indexOf("key:'Emri tregtar'");
    if (!(nr >= 0 && substance > nr && trade > substance)) {
      throw new Error(`${file}: canonical order must be Nr → Substanca aktive → Emri tregtar.`);
    }
    for (const fragment of [
      "key:'Nr rendor', label:'Nr', mobileLabel:'Nr', type:'num', cls:'code', visible:true",
      "key:'Substanca aktive', label:'Substanca Aktive', mobileLabel:'Substanca aktive', type:'str', cls:'', visible:true",
      "key:'Emri tregtar', label:'Emri Tregtar', mobileLabel:'Emri tregtar', type:'str', cls:'name', visible:true",
      "key:'ATC Code', label:'ATC', mobileLabel:'ATC', type:'str', cls:'code', visible:false",
      "key:'Klasa / Çka është', label:'Klasa / Çka është', mobileLabel:'Klasa', type:'str', cls:'wrap', visible:true",
      "key:'Përdorimi (fjalë kyçe)', label:'Përdorimi / fjalë kyçe', mobileLabel:'Përdorimi', type:'str', cls:'wrap', visible:true",
      "key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true",
      "key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:true",
      "key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true",
      "key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false",
      'REGISTRY_COLUMN_VISIBILITY_KEY',
      'saveRegistryColumnVisibility()',
    ]) {
      if (!runtime.includes(fragment)) throw new Error(`${file}: missing canonical registry fragment ${fragment}.`);
    }
  }

  const unified = read('registry-unified-table.js');
  if (!unified.includes("'select', 'number', 'trade-name', 'active-substance'")
      || !unified.includes("'select', 'trade-name', 'active-substance', 'strength', 'form'")
      || !unified.includes("'dosage-adult', 'dosage-pediatric', 'clinical-status'")
      || !unified.includes("if (key === 'clinical-status') return false")
      || !unified.includes("let storedView = 'clinical'")
      || unified.includes("'clinical-action'")
      || unified.includes("'dose-calculator'")) {
    throw new Error('Phase 15: canonical registry table contract is missing or retired action columns returned.');
  }

  const frozen = read('registry-frozen-columns.css');
  if (!frozen.includes('[data-registry-column-key="select"]')
      || !frozen.includes('[data-registry-column-key="trade-name"]')
      || !frozen.includes('left:44px!important')
      || !frozen.includes('[data-registry-column-key="number"]')
      || !frozen.includes('position:relative!important')) {
    throw new Error('Phase 15: final selection + trade-name frozen-column contract is missing.');
  }
}

function validatePrescriptionListData() {
  const api = read('api/drug-search.js');
  const listMatch = api.match(/const REGISTRY_LIST_SELECT = \[([\s\S]*?)\]\.join\(','\);/);
  if (!listMatch) throw new Error('Phase 15 registry list projection is missing.');
  if (!listMatch[1].includes("'packaging'")) {
    throw new Error('Phase 15 lightweight registry list must include packaging in committed source.');
  }
  if (!api.includes('function registryPrescriptionNotation(row)')) {
    throw new Error('Phase 15 prescription notation helper must exist in committed source.');
  }
  if (!api.includes('prescriptionNotation:registryPrescriptionNotation(row)')) {
    throw new Error('Phase 15 registry-page rows must expose prescription notation in committed source.');
  }
}

function enforceDesktopCanonicalPrescription() {
  const file = 'registry-desktop-lite.js';
  let desktop = read(file);
  if (!desktop.includes("'Si të shënohet në recetë':clean(row.prescriptionNotation)")) {
    desktop = replaceRequired(
      desktop,
      "      'Forma farmaceutike':clean(row.form),\n      'Statusi':clean(row.productStatus),",
      "      'Forma farmaceutike':clean(row.form),\n      'Si të shënohet në recetë':clean(row.prescriptionNotation),\n      'Statusi':clean(row.productStatus),",
      'desktop canonical prescription notation',
    );
  }
  write(file, desktop);
}

const LITE_PRIORITY = Object.freeze([
  'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use',
  'pdid', 'protocol', 'strength', 'form', 'population', 'prescription-label',
  'packaging', 'mah', 'manufacturer', 'ma-certificate', 'status',
  'wholesale-price', 'margin-price', 'vat', 'retail-price', 'validity',
]);

const LITE_DEFAULTS = Object.freeze({
  number:true,
  'active-substance':true,
  'trade-name':true,
  atc:false,
  'drug-class':true,
  use:true,
  pdid:false,
  protocol:false,
  strength:true,
  form:true,
  population:true,
  'prescription-label':true,
  packaging:false,
  mah:false,
  manufacturer:false,
  'ma-certificate':false,
  status:false,
  'wholesale-price':false,
  'margin-price':false,
  vat:false,
  'retail-price':false,
  validity:false,
});

function canonicalizeLiteColumns(value) {
  if (!value.includes("key:'population'")) {
    const form = "    { key:'form', label:'Forma', raw:'Forma farmaceutike', sort:'form', default:true, cls:'wrap registry-form-cell' },\n";
    const population = "    { key:'population', label:'Popullata (Adult/Pediatric)', raw:'Popullata e aprovuar', default:true, cls:'registry-population-column' },\n";
    value = replaceRequired(value, form, form + population, 'desktop-lite population column');
  }

  const marker = '  const columns = Object.freeze([';
  const start = value.indexOf(marker);
  const end = start >= 0 ? value.indexOf('\n  ]);', start) : -1;
  if (start < 0 || end < 0) throw new Error('Phase 15 desktop-lite column block is missing.');

  const items = [];
  const other = [];
  for (let line of value.slice(start + marker.length, end).split('\n').filter(line => line.trim())) {
    const match = line.match(/key:'([^']+)'/);
    if (!match) {
      other.push(line);
      continue;
    }
    const key = match[1];
    if (key === 'prescription-label') {
      line = "    { key:'prescription-label', label:'Si shënohet në recetë', raw:'Si të shënohet në recetë', default:true, cls:'wrap' },";
    } else if (Object.prototype.hasOwnProperty.call(LITE_DEFAULTS, key)) {
      line = line.replace(/default:(?:true|false)/, `default:${LITE_DEFAULTS[key] ? 'true' : 'false'}`);
    }
    items.push({ key, line });
  }

  const byKey = new Map(items.map(item => [item.key, item.line]));
  const ordered = [];
  LITE_PRIORITY.forEach(key => {
    if (!byKey.has(key)) return;
    ordered.push(byKey.get(key));
    byKey.delete(key);
  });
  items.forEach(item => {
    if (!byKey.has(item.key)) return;
    ordered.push(byKey.get(item.key));
    byKey.delete(item.key);
  });

  return value.slice(0, start) + `${marker}\n${[...ordered, ...other].join('\n')}` + value.slice(end);
}

function expectedDesktopLiteSource(value) {
  let expected = canonicalizeLiteColumns(value);
  expected = expected.replace(
    "    next.forEach(key => { if (byKey.has(key) && !byKey.get(key).advanced) visible.add(key); });",
    "    next.forEach(key => { if (byKey.has(key)) visible.add(key); });",
  );
  expected = expected.replace(
    `  function handleAdvanced(column, checkbox) {\n    checkbox.checked = false;\n    window.MEDINDEX_DESKTOP_LITE?.handoff?.('column-prescription-notation');\n  }\n\n`,
    '',
  );
  expected = expected.replace("      setVisible(columns.filter(column => !column.advanced).map(column => column.key));", "      setVisible(columns.map(column => column.key));");
  expected = expected.replace("      if (column.advanced) checkbox.title = 'Kërkon funksionet e plota';\n", '');
  expected = expected.replace("        if (column.advanced) return handleAdvanced(column, checkbox);\n", '');
  expected = expected.replace("      span.textContent = column.label + (column.advanced ? ' · avancuar' : '');", "      span.textContent = column.label;");
  expected = expected.replace("      if (!column?.advanced) input.checked = visible.has(column.key);", "      if (column) input.checked = visible.has(column.key);");
  expected = expected.replace("        if (column.advanced) return;\n", '');
  return expected;
}

function validateDesktopLiteColumns() {
  const file = 'registry-desktop-column-lite.js';
  const desktop = read(file);
  const expected = expectedDesktopLiteSource(desktop);
  if (expected !== desktop) {
    throw new Error('Phase 15: registry-desktop-column-lite.js is not canonical in committed source; build will not rewrite it.');
  }

  const number = desktop.indexOf("key:'number'");
  const substance = desktop.indexOf("key:'active-substance'");
  const trade = desktop.indexOf("key:'trade-name'");
  if (!(number >= 0 && substance > number && trade > substance)) {
    throw new Error('Phase 15 desktop-lite order must be Nr → Substanca aktive → Emri tregtar.');
  }
  if (!desktop.includes("key:'prescription-label', label:'Si shënohet në recetë', raw:'Si të shënohet në recetë', default:true")) {
    throw new Error('Phase 15 prescription notation must be a normal lightweight default column.');
  }
  if (/advanced:true/.test(desktop) || desktop.includes('column-prescription-notation')) {
    throw new Error('Phase 15 prescription notation must not hand off to the full registry.');
  }
  for (const [key, expectedDefault] of Object.entries(LITE_DEFAULTS)) {
    if (!desktop.includes(`key:'${key}'`)) continue;
    const line = desktop.split('\n').find(item => item.includes(`key:'${key}'`)) || '';
    if (!line.includes(`default:${expectedDefault ? 'true' : 'false'}`)) {
      throw new Error(`Phase 15 desktop-lite default mismatch for ${key}.`);
    }
  }
}

function validatePickerPreferences() {
  const picker = read('registry-column-picker-tailwind.js');
  const defaults = `const DEFAULT_LITE_COLUMNS = Object.freeze([\n    'number',\n    'active-substance',\n    'trade-name',\n    'drug-class',\n    'use',\n    'strength',\n    'form',\n    'population',\n    'prescription-label',\n  ]);`;
  if (!picker.includes(defaults)) {
    throw new Error('Phase 15 picker defaults must be canonical in committed source.');
  }
  if (!picker.includes('const KNOWN_LITE_COLUMNS = new Set(Object.keys(LITE_TO_FULL));')) {
    throw new Error('Phase 15 picker must persist prescription notation as a normal column.');
  }
  if (!picker.includes("if (event.target.dataset.columnLiteKey) queueMicrotask(persistLiteColumnPreference);")) {
    throw new Error('Phase 15 picker must persist every explicit lightweight column change.');
  }
}

function validateColumnLiteRegression() {
  const file = 'tests/registry-desktop-column-lite-test.js';
  if (!fs.existsSync(path.join(ROOT, file))) return;
  const test = read(file);
  if (!test.includes("assert.doesNotMatch(runtime, /column-prescription-notation|advanced:true/")) {
    throw new Error('Phase 15 column regression must assert that prescription notation stays lightweight.');
  }
  if (test.includes("assert.match(runtime, /column-prescription-notation/")) {
    throw new Error('Phase 15 column regression still contains the retired advanced-handoff expectation.');
  }
}

function enforceDosageDefaultsMigration() {
  const file = 'registry-dosage-loader.js';
  let loader = read(file);
  const storageLine = "  const VISIBILITY_STORAGE_KEY = 'medindex-registry-dosage-columns-v2';\n";
  const migrationLine = "  const DEFAULT_VISIBILITY_MIGRATION_KEY = 'medindex-registry-dosage-defaults-20260816-v1';\n";
  if (!loader.includes('DEFAULT_VISIBILITY_MIGRATION_KEY')) {
    loader = replaceRequired(loader, storageLine, storageLine + migrationLine, 'dosage visibility migration key');
  }

  const functionStart = "  function ensureDefaultDoseVisibility() {\n    try {\n";
  const migrationBlock = "  function ensureDefaultDoseVisibility() {\n    try {\n      if (localStorage.getItem(DEFAULT_VISIBILITY_MIGRATION_KEY) !== '1') {\n        localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify({ adult:true, pediatric:true }));\n        localStorage.setItem(DEFAULT_VISIBILITY_MIGRATION_KEY, '1');\n        return;\n      }\n";
  if (!loader.includes("localStorage.getItem(DEFAULT_VISIBILITY_MIGRATION_KEY) !== '1'")) {
    loader = replaceRequired(loader, functionStart, migrationBlock, 'dosage default migration');
  }
  if (!loader.includes("JSON.stringify({ adult:true, pediatric:true })")) {
    throw new Error('Phase 15 dosage defaults must keep adult and pediatric columns enabled.');
  }
  write(file, loader);
}

validateCanonicalTableOwner();
validatePrescriptionListData();
enforceDesktopCanonicalPrescription();
validateDesktopLiteColumns();
validatePickerPreferences();
validateColumnLiteRegression();
enforceDosageDefaultsMigration();

console.log('Phase 15 lazy dose runtime: insulin modal CSS/JS is interaction-gated while visible table controls stay eager.');
console.log('Phase 15 registry consistency: table and column preference source is canonical before build; Phase 15 validates instead of rewriting tests or column source.');
