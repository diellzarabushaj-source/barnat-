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

function replaceIfPresent(value, before, after) {
  if (value.includes(after)) return value;
  return value.includes(before) ? value.replace(before, after) : value;
}

function enforceFullRuntimeDefaults() {
  const runtimeFiles = ['app-runtime.js', 'app-runtime-performance.js'];
  for (const file of runtimeFiles) {
    let runtime = read(file);
    runtime = replaceIfPresent(
      runtime,
      "{ key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:false }",
      "{ key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true }",
    );
    runtime = replaceIfPresent(
      runtime,
      "{ key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:true }",
      "{ key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false }",
    );
    runtime = replaceIfPresent(
      runtime,
      "{ key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:false }",
      "{ key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:true }",
    );

    const required = [
      "key:'Emri tregtar', label:'Emri Tregtar', mobileLabel:'Emri tregtar', type:'str', cls:'name', visible:true",
      "key:'Substanca aktive', label:'Substanca Aktive', mobileLabel:'Substanca aktive', type:'str', cls:'', visible:true",
      "key:'ATC Code', label:'ATC', mobileLabel:'ATC', type:'str', cls:'code', visible:true",
      "key:'Fortësia', label:'Fort&euml;sia', mobileLabel:'Fortësia', type:'str', cls:'', visible:true",
      "key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true",
      "key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true",
      "key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:true",
      "key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false",
    ];
    if (required.some(fragment => !runtime.includes(fragment))) {
      throw new Error(`Phase 15 final default-column contract failed in ${file}.`);
    }
    write(file, runtime);
  }
}

function enforceDesktopLiteDefaults() {
  const file = 'registry-desktop-column-lite.js';
  let desktop = read(file);
  desktop = replaceIfPresent(
    desktop,
    "{ key:'prescription-label', label:'Si shënohet në recetë', advanced:true, default:false, cls:'wrap' }",
    "{ key:'prescription-label', label:'Si shënohet në recetë', advanced:true, default:true, cls:'wrap' }",
  );
  desktop = replaceIfPresent(
    desktop,
    "{ key:'status', label:'Statusi', raw:'Statusi', sort:'status', default:true }",
    "{ key:'status', label:'Statusi', raw:'Statusi', sort:'status', default:false }",
  );
  if (!desktop.includes("key:'population'")) {
    const formColumn = "    { key:'form', label:'Forma', raw:'Forma farmaceutike', sort:'form', default:true, cls:'wrap registry-form-cell' },\n";
    const populationColumn = "    { key:'population', label:'Popullata (Adult/Pediatric)', raw:'Popullata e aprovuar', default:true, cls:'registry-population-column' },\n";
    if (!desktop.includes(formColumn)) throw new Error('Phase 15 could not locate desktop-lite form column.');
    desktop = desktop.replace(formColumn, formColumn + populationColumn);
  }

  const required = [
    "key:'trade-name', label:'Emri Tregtar', raw:'Emri tregtar', sort:'name', default:true",
    "key:'active-substance', label:'Substanca Aktive', raw:'Substanca aktive', sort:'substance', default:true",
    "key:'atc', label:'ATC', raw:'ATC Code', sort:'atc', default:true",
    "key:'strength', label:'Fortësia', raw:'Fortësia', sort:'strength', default:true",
    "key:'form', label:'Forma', raw:'Forma farmaceutike', sort:'form', default:true",
    "key:'population', label:'Popullata (Adult/Pediatric)', raw:'Popullata e aprovuar', default:true",
    "key:'prescription-label', label:'Si shënohet në recetë', advanced:true, default:true",
    "key:'status', label:'Statusi', raw:'Statusi', sort:'status', default:false",
  ];
  if (required.some(fragment => !desktop.includes(fragment))) {
    throw new Error('Phase 15 desktop-lite default-column contract failed.');
  }
  write(file, desktop);
}

function enforceDosageDefaultsMigration() {
  const file = 'registry-dosage-loader.js';
  let loader = read(file);
  const storageLine = "  const VISIBILITY_STORAGE_KEY = 'medindex-registry-dosage-columns-v2';\n";
  const migrationLine = "  const DEFAULT_VISIBILITY_MIGRATION_KEY = 'medindex-registry-dosage-defaults-20260816-v1';\n";
  if (!loader.includes('DEFAULT_VISIBILITY_MIGRATION_KEY')) {
    if (!loader.includes(storageLine)) throw new Error('Phase 15 dosage visibility storage key is missing.');
    loader = loader.replace(storageLine, storageLine + migrationLine);
  }

  const functionStart = "  function ensureDefaultDoseVisibility() {\n    try {\n";
  const migrationBlock = "  function ensureDefaultDoseVisibility() {\n    try {\n      if (localStorage.getItem(DEFAULT_VISIBILITY_MIGRATION_KEY) !== '1') {\n        localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify({ adult:true, pediatric:true }));\n        localStorage.setItem(DEFAULT_VISIBILITY_MIGRATION_KEY, '1');\n        return;\n      }\n";
  if (!loader.includes("localStorage.getItem(DEFAULT_VISIBILITY_MIGRATION_KEY) !== '1'")) {
    if (!loader.includes(functionStart)) throw new Error('Phase 15 dosage default function is missing.');
    loader = loader.replace(functionStart, migrationBlock);
  }
  if (!loader.includes("JSON.stringify({ adult:true, pediatric:true })")) {
    throw new Error('Phase 15 dosage defaults must keep adult and pediatric columns enabled.');
  }
  write(file, loader);
}

enforceFullRuntimeDefaults();
enforceDesktopLiteDefaults();
enforceDosageDefaultsMigration();

console.log('Phase 15 lazy dose runtime: insulin modal CSS/JS is interaction-gated while visible table controls stay eager.');
console.log('Phase 15 final registry defaults: requested 9-column picker contract enforced after all earlier runtime patches.');
