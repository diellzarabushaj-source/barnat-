'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeFiles = ['app-runtime.js', 'app-runtime-performance.js'];
const unifiedTableFile = 'registry-unified-table.js';
const unifiedCssFile = 'registry-unified-table.css';
const columnContractFile = 'registry-column-contract.js';
const indexFile = 'index.html';
const ASSET_VERSION = '20260816-default-columns-1';

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function write(relative, source) {
  fs.writeFileSync(path.join(root, relative), source, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Population column patch: mungon pattern-i ${label}.`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Population column patch: pattern-i ${label} nuk është unik.`);
  }
  return source.replace(needle, replacement);
}

function patchRuntime(relative) {
  let source = read(relative);
  if (source.includes("key:'Popullata e aprovuar'")) return;

  // Default-i klinik i picker-it: 6 kolona bazë + Popullata + 2 kolonat e dozimit.
  // Dy kolonat e dozimit mbahen default ON nga registry-dosage-loader.js.
  source = replaceOnce(
    source,
    "  { key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:false },\n",
    "  { key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true },\n",
    'COLUMNS/prescription default',
  );

  source = replaceOnce(
    source,
    "  { key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:true },\n",
    "  { key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false },\n",
    'COLUMNS/status default',
  );

  source = replaceOnce(
    source,
    "  { key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true },\n",
    "  { key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true },\n  { key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:true },\n",
    'COLUMNS/forma',
  );

  source = replaceOnce(
    source,
    "        if(col.type === 'num' && (col.cls === 'price')){\n",
    "        if(col.key === 'Popullata e aprovuar'){\n          const population = String(val ?? '').trim();\n          const populationClass = population === 'Pediatric only'\n            ? ' pediatric-only'\n            : population === 'Adult only'\n              ? ' adult-only'\n              : population === 'Pediatric and adult both'\n                ? ' pediatric-adult-both'\n                : ' unknown';\n          const display = population || '—';\n          return '<td class=\"' + col.cls + '\" data-column-key=\"' + columnKey + '\" data-label=\"' + mobileLabel + '\" title=\"' + escapeHtml(population) + '\"><span class=\"registry-population-badge' + populationClass + '\">' + escapeHtml(display) + '</span></td>';\n        }\n        if(col.type === 'num' && (col.cls === 'price')){\n",
    'render/population',
  );

  source = replaceOnce(
    source,
    "initFormPicker();\nbuildColPanel();\ninitPrescriptionBridge();\nrender();\n",
    "window.MEDINDEX_REFRESH_REGISTRY = function refreshRegistryFromExternalMetadata(){\n  resetRegistryFilterCaches();\n  render();\n};\n\ninitFormPicker();\nbuildColPanel();\ninitPrescriptionBridge();\nrender();\n",
    'runtime refresh hook',
  );

  write(relative, source);
}

function patchUnifiedTable() {
  let source = read(unifiedTableFile);
  if (source.includes("population:'Popullata e aprovuar'")) return;

  source = replaceOnce(
    source,
    "    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',\n    'pdid', 'protocol', 'strength', 'form', 'prescription-label', 'packaging', 'mah',\n",
    "    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',\n    'pdid', 'protocol', 'strength', 'form', 'population', 'prescription-label', 'packaging', 'mah',\n",
    'unified/full order',
  );

  source = replaceOnce(
    source,
    "    'select', 'trade-name', 'active-substance', 'strength', 'form',\n    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',\n",
    "    'select', 'trade-name', 'active-substance', 'strength', 'form', 'population',\n    'dosage-adult', 'dosage-pediatric', 'clinical-status', 'clinical-action', 'dose-calculator',\n",
    'unified/clinical order',
  );

  source = replaceOnce(
    source,
    "    form:'Forma', 'prescription-label':'Si shënohet në recetë', packaging:'Paketimi',\n",
    "    form:'Forma', population:'Popullata', 'prescription-label':'Si shënohet në recetë', packaging:'Paketimi',\n",
    'unified/label',
  );

  source = replaceOnce(
    source,
    "    form:'Forma farmaceutike', number:'Nr rendor', atc:'ATC Code', 'drug-class':'Klasa / Çka është',\n",
    "    form:'Forma farmaceutike', population:'Popullata e aprovuar', number:'Nr rendor', atc:'ATC Code', 'drug-class':'Klasa / Çka është',\n",
    'unified/raw field',
  );

  source = replaceOnce(
    source,
    "    'drug-class':210, use:230, pdid:98, protocol:122, strength:82, form:142,\n    'prescription-label':235, packaging:150, mah:190, manufacturer:180,\n",
    "    'drug-class':210, use:230, pdid:98, protocol:122, strength:82, form:142, population:176,\n    'prescription-label':235, packaging:150, mah:190, manufacturer:180,\n",
    'unified/width',
  );

  source = replaceOnce(
    source,
    "    protocol:'protocol', fortesia:'strength', forma:'form', formafarmaceutike:'form',\n    sishenohetnerecete:'prescription-label', paketimi:'packaging', madhesiaepaketimit:'packaging',\n",
    "    protocol:'protocol', fortesia:'strength', forma:'form', formafarmaceutike:'form',\n    popullata:'population', popullataeaprovuar:'population', pediatriconly:'population',\n    sishenohetnerecete:'prescription-label', paketimi:'packaging', madhesiaepaketimit:'packaging',\n",
    'unified/label aliases',
  );

  write(unifiedTableFile, source);
}

function patchUnifiedCss() {
  let source = read(unifiedCssFile);
  if (!source.includes('[data-registry-column-key="population"]')) {
    source = replaceOnce(
      source,
      '    [data-registry-column-key="form"],[data-registry-column-key="dosage-adult"],\n    [data-registry-column-key="dosage-pediatric"],[data-registry-column-key="clinical-status"],',
      '    [data-registry-column-key="form"],[data-registry-column-key="population"],\n    [data-registry-column-key="dosage-adult"],[data-registry-column-key="dosage-pediatric"],\n    [data-registry-column-key="clinical-status"],',
      'unified css/clinical population visibility',
    );
  }

  if (!source.includes('.registry-population-badge')) {
    source += `\n\n/* Selectable approved-population column. */\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-column {\n  text-align:center!important;\n}\n\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-badge {\n  display:inline-flex!important;\n  max-width:100%!important;\n  min-height:27px!important;\n  align-items:center!important;\n  justify-content:center!important;\n  padding:5px 9px!important;\n  border:1px solid #dbe5f1!important;\n  border-radius:999px!important;\n  background:#f8fafc!important;\n  color:#475569!important;\n  font-size:.62rem!important;\n  font-weight:800!important;\n  line-height:1.15!important;\n  text-align:center!important;\n  white-space:normal!important;\n}\n\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-badge.pediatric-only {\n  border-color:#f9a8d4!important;\n  background:#fff0f6!important;\n  color:#be185d!important;\n}\n\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-badge.adult-only {\n  border-color:#bfdbfe!important;\n  background:#eff6ff!important;\n  color:#1d4ed8!important;\n}\n\nhtml.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-badge.pediatric-adult-both {\n  border-color:#99f6e4!important;\n  background:#f0fdfa!important;\n  color:#0f766e!important;\n}\n\n[data-theme="dark"] html.medindex-tailadmin[data-mi-page="barnat"] body #dataTable .registry-population-badge.pediatric-only {\n  border-color:#db2777!important;\n  background:#3a1d2b!important;\n  color:#f9a8d4!important;\n}\n`;
  }

  write(unifiedCssFile, source);
}

function patchColumnContract() {
  let source = read(columnContractFile);
  if (source.includes("popullataeaprovuar:'population'")) return;

  source = replaceOnce(
    source,
    "    protokolli:'protocol', protokoli:'protocol', fortesia:'strength', forma:'form',\n    formafarmaceutike:'form', sishenohetnerecete:'prescription-label',\n",
    "    protokolli:'protocol', protokoli:'protocol', fortesia:'strength', forma:'form',\n    formafarmaceutike:'form', popullata:'population', popullataeaprovuar:'population',\n    pediatriconly:'population', sishenohetnerecete:'prescription-label',\n",
    'column contract aliases',
  );

  write(columnContractFile, source);
}

function patchAssetVersions() {
  let source = read(indexFile);
  source = source.replace(/registry-unified-table\.css\?v=[^\"']+/g, `registry-unified-table.css?v=${ASSET_VERSION}`);
  source = source.replace(/registry-unified-table\.js\?v=[^\"']+/g, `registry-unified-table.js?v=${ASSET_VERSION}`);
  source = source.replace(/registry-dose-clinical-row-markers\.js\?v=[^\"']+/g, `registry-dose-clinical-row-markers.js?v=${ASSET_VERSION}`);
  source = source.replace(/registry-column-picker-tailwind\.js\?v=[^\"']+/g, `registry-column-picker-tailwind.js?v=${ASSET_VERSION}`);
  write(indexFile, source);
}

runtimeFiles.forEach(patchRuntime);
patchUnifiedTable();
patchUnifiedCss();
patchColumnContract();
patchAssetVersions();

for (const relative of runtimeFiles) {
  const source = read(relative);
  if (!source.includes("key:'Popullata e aprovuar'")
      || !source.includes("key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:true")
      || !source.includes("key:'Si të shënohet në recetë', label:'Si shënohet në recetë', mobileLabel:'Shënimi në recetë', type:'str', cls:'wrap', visible:true")
      || !source.includes("key:'Statusi', label:'Statusi', mobileLabel:'Statusi', type:'str', cls:'', visible:false")
      || !source.includes('registry-population-badge')) {
    throw new Error(`Population/default column patch nuk u aplikua në ${relative}.`);
  }
}
const unified = read(unifiedTableFile);
if (!unified.includes("population:'Popullata e aprovuar'") || !unified.includes("'population'")) {
  throw new Error('Population column patch nuk u aplikua në unified table.');
}
const unifiedCss = read(unifiedCssFile);
if (!unifiedCss.includes('[data-registry-column-key="population"]') || !unifiedCss.includes('.registry-population-badge')) {
  throw new Error('Population column patch nuk u aplikua në unified CSS.');
}
const indexSource = read(indexFile);
if (!indexSource.includes(`registry-unified-table.css?v=${ASSET_VERSION}`)
    || !indexSource.includes(`registry-unified-table.js?v=${ASSET_VERSION}`)
    || !indexSource.includes(`registry-dose-clinical-row-markers.js?v=${ASSET_VERSION}`)
    || !indexSource.includes(`registry-column-picker-tailwind.js?v=${ASSET_VERSION}`)) {
  throw new Error('Population/default column asset versions nuk u përditësuan.');
}

console.log('Approved population column and requested 9-column clinical default applied.');
