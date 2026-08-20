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
  if (!value.includes(before)) throw new Error(`Phase 15 final registry contract could not find ${label}.`);
  return value.replace(before, after);
}

function replaceIfPresent(value, before, after) {
  if (value.includes(after)) return value;
  return value.includes(before) ? value.replace(before, after) : value;
}

const FULL_COLUMN_PRIORITY = Object.freeze([
  'Nr rendor',
  'Substanca aktive',
  'Emri tregtar',
  'ATC Code',
  'Klasa / Çka është',
  'Përdorimi (fjalë kyçe)',
  'PDID',
  'ProtocolNo',
  'Fortësia',
  'Forma farmaceutike',
  'Si të shënohet në recetë',
  'Popullata e aprovuar',
  'Madhësia e paketimit',
  'Bartësi i Autorizim Marketingut',
  'Prodhuesi',
  'MA certifikata',
  'Statusi',
  'Çmimi me shumicë',
  'Çmimi me marzhë',
  'TVSH',
  'Çmimi me pakicë',
  'Afati i vlefshmërisë',
]);

const FULL_DEFAULT_VISIBILITY = Object.freeze({
  'Nr rendor':true,
  'Substanca aktive':true,
  'Emri tregtar':true,
  'ATC Code':false,
  'Klasa / Çka është':true,
  'Përdorimi (fjalë kyçe)':true,
  'PDID':false,
  ProtocolNo:false,
  'Fortësia':true,
  'Forma farmaceutike':true,
  'Si të shënohet në recetë':true,
  'Popullata e aprovuar':true,
  'Madhësia e paketimit':false,
  'Bartësi i Autorizim Marketingut':false,
  Prodhuesi:false,
  'MA certifikata':false,
  Statusi:false,
  'Çmimi me shumicë':false,
  'Çmimi me marzhë':false,
  TVSH:false,
  'Çmimi me pakicë':false,
  'Afati i vlefshmërisë':false,
});

function rewriteColumnArray(value, label) {
  const marker = 'const COLUMNS = [';
  const start = value.indexOf(marker);
  const end = start >= 0 ? value.indexOf('\n];', start) : -1;
  if (start < 0 || end < 0) throw new Error(`Phase 15 could not locate COLUMNS in ${label}.`);

  const bodyStart = start + marker.length;
  const lines = value.slice(bodyStart, end).split('\n').filter(line => line.trim());
  const keyed = [];
  const other = [];

  for (let line of lines) {
    const match = line.match(/key:'([^']+)'/);
    if (!match) {
      other.push(line);
      continue;
    }
    const key = match[1];
    if (Object.prototype.hasOwnProperty.call(FULL_DEFAULT_VISIBILITY, key)) {
      const nextVisible = FULL_DEFAULT_VISIBILITY[key] ? 'true' : 'false';
      if (/visible:(?:true|false)/.test(line)) line = line.replace(/visible:(?:true|false)/, `visible:${nextVisible}`);
    }
    keyed.push({ key, line });
  }

  const byKey = new Map(keyed.map(item => [item.key, item.line]));
  const ordered = [];
  FULL_COLUMN_PRIORITY.forEach(key => {
    const line = byKey.get(key);
    if (!line) return;
    ordered.push(line);
    byKey.delete(key);
  });
  keyed.forEach(item => {
    if (!byKey.has(item.key)) return;
    ordered.push(byKey.get(item.key));
    byKey.delete(item.key);
  });

  const rebuilt = `${marker}\n${[...ordered, ...other].join('\n')}`;
  return value.slice(0, start) + rebuilt + value.slice(end);
}

function enforceFullRuntimeDefaults() {
  for (const file of ['app-parts/part-01.txt', 'app-runtime.js', 'app-runtime-performance.js']) {
    const absolute = path.join(ROOT, file);
    if (!fs.existsSync(absolute)) continue;
    const runtime = rewriteColumnArray(read(file), file);
    const nr = runtime.indexOf("key:'Nr rendor'");
    const substance = runtime.indexOf("key:'Substanca aktive'");
    const trade = runtime.indexOf("key:'Emri tregtar'");
    if (!(nr >= 0 && substance > nr && trade > substance)) {
      throw new Error(`Phase 15 ${file} order must be Nr → Substanca aktive → Emri tregtar.`);
    }
    for (const [key, visible] of Object.entries(FULL_DEFAULT_VISIBILITY)) {
      if (!runtime.includes(`key:'${key}'`)) continue;
      const line = runtime.split('\n').find(item => item.includes(`key:'${key}'`)) || '';
      if (!line.includes(`visible:${visible ? 'true' : 'false'}`)) {
        throw new Error(`Phase 15 ${file} visibility mismatch for ${key}.`);
      }
    }
    write(file, runtime);
  }
}

function ensurePrescriptionListData() {
  const file = 'api/drug-search.js';
  let api = read(file);

  const listMatch = api.match(/const REGISTRY_LIST_SELECT = \[([\s\S]*?)\]\.join\(','\);/);
  if (!listMatch) throw new Error('Phase 15 registry list projection is missing.');
  if (!listMatch[1].includes("'packaging'")) {
    api = api.replace(
      "  'pharmaceutical_form',\n  'product_status',",
      "  'pharmaceutical_form',\n  'packaging',\n  'product_status',",
    );
  }

  if (!api.includes('function registryPrescriptionNotation(row)')) {
    const anchor = 'function rowForRegistryList(row) {';
    const helper = `function registryPrescriptionNotation(row) {\n  const notation = PrescriptionNotation.build({\n    'Emri tregtar':clean(row?.trade_name),\n    'Substanca aktive':clean(row?.active_substance),\n    Fortësia:clean(row?.strength),\n    'Forma farmaceutike':clean(row?.pharmaceutical_form),\n    'Madhësia e paketimit':clean(row?.packaging),\n  });\n  return clean(notation?.line);\n}\n\n${anchor}`;
    api = replaceRequired(api, anchor, helper, 'lightweight prescription notation helper');
  }

  if (!api.includes('prescriptionNotation:registryPrescriptionNotation(row)')) {
    api = replaceRequired(
      api,
      "    form:clean(row.pharmaceutical_form),\n    productStatus:clean(row.product_status),",
      "    form:clean(row.pharmaceutical_form),\n    prescriptionNotation:registryPrescriptionNotation(row),\n    productStatus:clean(row.product_status),",
      'lightweight prescription notation result',
    );
  }

  if (!api.includes("'packaging'")) throw new Error('Phase 15 lightweight registry list must select packaging for notation formatting.');
  if (!api.includes('prescriptionNotation:registryPrescriptionNotation(row)')) {
    throw new Error('Phase 15 lightweight registry list must expose prescription notation.');
  }
  write(file, api);
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

const LITE_COLUMN_PRIORITY = Object.freeze([
  'number',
  'active-substance',
  'trade-name',
  'atc',
  'drug-class',
  'use',
  'pdid',
  'protocol',
  'strength',
  'form',
  'prescription-label',
  'population',
  'packaging',
  'mah',
  'manufacturer',
  'ma-certificate',
  'status',
  'wholesale-price',
  'margin-price',
  'vat',
  'retail-price',
  'validity',
]);

const LITE_DEFAULT_VISIBILITY = Object.freeze({
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
  'prescription-label':true,
  population:true,
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

function rewriteLiteColumnArray(value) {
  if (!value.includes("key:'population'")) {
    const formColumn = "    { key:'form', label:'Forma', raw:'Forma farmaceutike', sort:'form', default:true, cls:'wrap registry-form-cell' },\n";
    const populationColumn = "    { key:'population', label:'Popullata (Adult/Pediatric)', raw:'Popullata e aprovuar', default:true, cls:'registry-population-column' },\n";
    value = replaceRequired(value, formColumn, formColumn + populationColumn, 'desktop-lite population column');
  }

  const marker = '  const columns = Object.freeze([';
  const start = value.indexOf(marker);
  const end = start >= 0 ? value.indexOf('\n  ]);', start) : -1;
  if (start < 0 || end < 0) throw new Error('Phase 15 could not locate desktop-lite columns.');

  const bodyStart = start + marker.length;
  const lines = value.slice(bodyStart, end).split('\n').filter(line => line.trim());
  const keyed = [];
  const other = [];

  for (let line of lines) {
    const match = line.match(/key:'([^']+)'/);
    if (!match) {
      other.push(line);
      continue;
    }
    const key = match[1];
    if (key === 'prescription-label') {
      line = "    { key:'prescription-label', label:'Si shënohet në recetë', raw:'Si të shënohet në recetë', default:true, cls:'wrap' },";
    } else if (Object.prototype.hasOwnProperty.call(LITE_DEFAULT_VISIBILITY, key)) {
      const nextVisible = LITE_DEFAULT_VISIBILITY[key] ? 'true' : 'false';
      if (/default:(?:true|false)/.test(line)) line = line.replace(/default:(?:true|false)/, `default:${nextVisible}`);
    }
    keyed.push({ key, line });
  }

  const byKey = new Map(keyed.map(item => [item.key, item.line]));
  const ordered = [];
  LITE_COLUMN_PRIORITY.forEach(key => {
    const line = byKey.get(key);
    if (!line) return;
    ordered.push(line);
    byKey.delete(key);
  });
  keyed.forEach(item => {
    if (!byKey.has(item.key)) return;
    ordered.push(byKey.get(item.key));
    byKey.delete(item.key);
  });

  const rebuilt = `${marker}\n${[...ordered, ...other].join('\n')}`;
  return value.slice(0, start) + rebuilt + value.slice(end);
}

function enforceDesktopLiteDefaults() {
  const file = 'registry-desktop-column-lite.js';
  let desktop = rewriteLiteColumnArray(read(file));

  desktop = replaceIfPresent(
    desktop,
    "      if (column.advanced) return;\n        changed = (visible.has(column.key)",
    "      changed = (visible.has(column.key)",
  );
  desktop = replaceIfPresent(
    desktop,
    "    next.forEach(key => { if (byKey.has(key) && !byKey.get(key).advanced) visible.add(key); });",
    "    next.forEach(key => { if (byKey.has(key)) visible.add(key); });",
  );

  const advancedHandler = `  function handleAdvanced(column, checkbox) {\n    checkbox.checked = false;\n    window.MEDINDEX_DESKTOP_LITE?.handoff?.('column-prescription-notation');\n  }\n\n`;
  desktop = desktop.replace(advancedHandler, '');
  desktop = desktop.replace("      setVisible(columns.filter(column => !column.advanced).map(column => column.key));", "      setVisible(columns.map(column => column.key));");
  desktop = desktop.replace("      if (column.advanced) checkbox.title = 'Kërkon funksionet e plota';\n", '');
  desktop = desktop.replace("        if (column.advanced) return handleAdvanced(column, checkbox);\n", '');
  desktop = desktop.replace("      span.textContent = column.label + (column.advanced ? ' · avancuar' : '');", "      span.textContent = column.label;");
  desktop = desktop.replace("      if (!column?.advanced) input.checked = visible.has(column.key);", "      if (column) input.checked = visible.has(column.key);");

  const number = desktop.indexOf("key:'number'");
  const substance = desktop.indexOf("key:'active-substance'");
  const trade = desktop.indexOf("key:'trade-name'");
  if (!(number >= 0 && substance > number && trade > substance)) {
    throw new Error('Phase 15 desktop-lite order must be Nr → Substanca aktive → Emri tregtar.');
  }
  if (!desktop.includes("key:'prescription-label', label:'Si shënohet në recetë', raw:'Si të shënohet në recetë', default:true")) {
    throw new Error('Phase 15 prescription notation must remain a normal lightweight default column.');
  }
  if (/advanced:true/.test(desktop) || desktop.includes('column-prescription-notation')) {
    throw new Error('Phase 15 prescription notation must not trigger a full-registry handoff.');
  }
  for (const [key, visible] of Object.entries(LITE_DEFAULT_VISIBILITY)) {
    if (!desktop.includes(`key:'${key}'`)) continue;
    const line = desktop.split('\n').find(item => item.includes(`key:'${key}'`)) || '';
    if (!line.includes(`default:${visible ? 'true' : 'false'}`)) {
      throw new Error(`Phase 15 desktop-lite visibility mismatch for ${key}.`);
    }
  }
  write(file, desktop);
}

function enforcePickerPreferenceContract() {
  const file = 'registry-column-picker-tailwind.js';
  let picker = read(file);
  const defaultBlock = `const DEFAULT_LITE_COLUMNS = Object.freeze([\n    'number',\n    'active-substance',\n    'trade-name',\n    'drug-class',\n    'use',\n    'strength',\n    'form',\n    'prescription-label',\n    'population',\n  ]);`;
  picker = picker.replace(/const DEFAULT_LITE_COLUMNS = Object\.freeze\(\[[\s\S]*?\]\);/, defaultBlock);
  picker = picker.replace(
    "const KNOWN_LITE_COLUMNS = new Set(Object.keys(LITE_TO_FULL).filter(key => key !== PRESCRIPTION_KEY));",
    "const KNOWN_LITE_COLUMNS = new Set(Object.keys(LITE_TO_FULL));",
  );
  picker = picker.replace(
    "      if (event.target.dataset.columnLiteKey && event.target.dataset.columnLiteKey !== PRESCRIPTION_KEY) {\n        queueMicrotask(persistLiteColumnPreference);\n      }",
    "      if (event.target.dataset.columnLiteKey) queueMicrotask(persistLiteColumnPreference);",
  );
  if (!picker.includes("'prescription-label',\n    'population'")) {
    throw new Error('Phase 15 picker defaults must include prescription notation before population.');
  }
  if (!picker.includes('const KNOWN_LITE_COLUMNS = new Set(Object.keys(LITE_TO_FULL));')) {
    throw new Error('Phase 15 picker must persist prescription notation like every normal column.');
  }
  write(file, picker);
}

function enforceUnifiedTableContract() {
  const file = 'registry-unified-table.js';
  let runtime = read(file);

  const fullOrder = `const FULL_ORDER = Object.freeze([\n    'select', 'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use',\n    'pdid', 'protocol', 'strength', 'form', 'prescription-label', 'packaging', 'mah',\n    'manufacturer', 'ma-certificate', 'status', 'wholesale-price', 'margin-price', 'vat',\n    'retail-price', 'validity', 'dosage-adult', 'dosage-pediatric', 'clinical-status',\n    'clinical-action', 'dose-calculator',\n  ]);`;
  const clinicalOrder = `const CLINICAL_ORDER = Object.freeze([\n    'select', 'number', 'active-substance', 'trade-name', 'strength', 'form',\n    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',\n  ]);`;
  runtime = runtime.replace(/const FULL_ORDER = Object\.freeze\(\[[\s\S]*?\]\);/, fullOrder);
  runtime = runtime.replace(/const CLINICAL_ORDER = Object\.freeze\(\[[\s\S]*?\]\);/, clinicalOrder);

  if (!runtime.includes("if (key === 'clinical-status' || key === 'clinical-action') return false;")) {
    runtime = replaceRequired(
      runtime,
      "  function keyVisible(key) {\n    if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key)) return false;",
      "  function keyVisible(key) {\n    if (key === 'clinical-status' || key === 'clinical-action') return false;\n    if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key)) return false;",
      'hidden technical column gate',
    );
  }

  if (!runtime.includes('--registry-frozen-active-left')) {
    runtime = replaceRequired(
      runtime,
      "    const visible = order.filter(key => keyVisible(key));\n    const width = Math.max(",
      "    const visible = order.filter(key => keyVisible(key));\n    const frozenActiveLeft = visible.includes('number') ? (WIDTHS.number || 68) : 0;\n    table.style.setProperty('--registry-frozen-active-left', `${frozenActiveLeft}px`);\n    const width = Math.max(",
      'frozen active-substance offset',
    );
  }

  runtime = replaceIfPresent(
    runtime,
    "    let storedView = 'clinical';\n    let storedFilters = false;\n    try {\n      storedView = localStorage.getItem(VIEW_STORAGE_KEY) === 'full' ? 'full' : 'clinical';",
    "    let storedView = 'full';\n    let storedFilters = false;\n    try {\n      storedView = localStorage.getItem(VIEW_STORAGE_KEY) === 'clinical' ? 'clinical' : 'full';",
  );

  if (!runtime.includes("'select', 'number', 'active-substance', 'trade-name'")) {
    throw new Error('Phase 15 unified table must order Nr and active substance before trade name.');
  }
  if (!runtime.includes("let storedView = 'full'")) {
    throw new Error('Phase 15 first visit must open the user-configurable full table.');
  }
  if (!runtime.includes('--registry-frozen-active-left')) {
    throw new Error('Phase 15 frozen active-substance offset is missing.');
  }
  write(file, runtime);
}

function enforceFrozenColumnCss() {
  const file = 'registry-unified-table.css';
  let css = read(file);
  const marker = 'registry-frozen-columns-v2';
  if (!css.includes(marker)) {
    css += `\n\n/* ${marker} — only Nr + Substanca aktive are frozen on table layouts. */\n@media (min-width:1200px) {\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] :is(th,td)[data-registry-column-key="number"] {\n    position:sticky!important;\n    left:0!important;\n    z-index:9!important;\n    background:var(--ru-row)!important;\n  }\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] :is(th,td)[data-registry-column-key="active-substance"] {\n    position:sticky!important;\n    left:var(--registry-frozen-active-left,68px)!important;\n    z-index:9!important;\n    background:var(--ru-row)!important;\n    box-shadow:1px 0 0 var(--ru-line-strong),8px 0 14px rgba(15,23,42,.045)!important;\n  }\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] thead th[data-registry-column-key="number"],\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] thead th[data-registry-column-key="active-substance"] {\n    z-index:13!important;\n    background:#f8fbff!important;\n  }\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] tbody tr:nth-child(even)>td[data-registry-column-key="number"],\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] tbody tr:nth-child(even)>td[data-registry-column-key="active-substance"] {\n    background:var(--ru-row-alt)!important;\n  }\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] tbody tr:hover>td[data-registry-column-key="number"],\n  html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable[data-registry-unified-table] tbody tr:hover>td[data-registry-column-key="active-substance"] {\n    background:var(--ru-row-hover)!important;\n  }\n}\n`;
  }
  if (!css.includes(marker) || !css.includes('left:var(--registry-frozen-active-left,68px)!important')) {
    throw new Error('Phase 15 frozen-column stylesheet contract is incomplete.');
  }
  write(file, css);
}

function updateColumnLiteRegression() {
  const file = 'tests/registry-desktop-column-lite-test.js';
  if (!fs.existsSync(path.join(ROOT, file))) return;
  let test = read(file);
  test = test.replace(
    "assert.match(runtime, /column-prescription-notation/, 'Only the unstructured prescription-label column may explicitly request full mode.');",
    "assert.doesNotMatch(runtime, /column-prescription-notation|advanced:true/, 'Prescription notation must remain on the lightweight path.');\nassert.match(runtime, /key:'prescription-label'[\\s\\S]{0,180}raw:'Si të shënohet në recetë'[\\s\\S]{0,120}default:true/, 'Prescription notation must be a normal default lightweight column.');",
  );
  write(file, test);
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

enforceFullRuntimeDefaults();
ensurePrescriptionListData();
enforceDesktopCanonicalPrescription();
enforceDesktopLiteDefaults();
enforcePickerPreferenceContract();
enforceUnifiedTableContract();
enforceFrozenColumnCss();
updateColumnLiteRegression();
enforceDosageDefaultsMigration();

console.log('Phase 15 lazy dose runtime: insulin modal CSS/JS is interaction-gated while visible table controls stay eager.');
console.log('Phase 15 final registry table: Nr → Substanca aktive → Emri tregtar, exact user defaults, persistent lightweight prescription notation and frozen Nr + active substance are enforced.');
