'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeFiles = ['app-runtime.js', 'app-runtime-performance.js'];
const unifiedTableFile = 'registry-unified-table.js';
const columnContractFile = 'registry-column-contract.js';

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

  source = replaceOnce(
    source,
    "  { key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true },\n",
    "  { key:'Forma farmaceutike', label:'Forma', mobileLabel:'Forma', type:'str', cls:'wrap', visible:true },\n  { key:'Popullata e aprovuar', label:'Popullata (Adult/Pediatric)', mobileLabel:'Popullata', type:'str', cls:'registry-population-column', visible:false },\n",
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
    "    form:142,\n    'prescription-label':235, packaging:150, mah:190, manufacturer:180,\n",
    "    form:142, population:176,\n    'prescription-label':235, packaging:150, mah:190, manufacturer:180,\n",
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

runtimeFiles.forEach(patchRuntime);
patchUnifiedTable();
patchColumnContract();

for (const relative of runtimeFiles) {
  const source = read(relative);
  if (!source.includes("key:'Popullata e aprovuar'") || !source.includes('registry-population-badge')) {
    throw new Error(`Population column patch nuk u aplikua në ${relative}.`);
  }
}
const unified = read(unifiedTableFile);
if (!unified.includes("population:'Popullata e aprovuar'") || !unified.includes("'population'")) {
  throw new Error('Population column patch nuk u aplikua në unified table.');
}

console.log('Approved population column added to picker/runtime/unified table.');
