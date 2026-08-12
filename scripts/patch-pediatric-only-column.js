'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_OUTPUTS = [
  path.join(ROOT, 'app-runtime.js'),
  path.join(ROOT, 'app-runtime-performance.js'),
];
const UNIFIED_JS = path.join(ROOT, 'registry-unified-table.js');
const UNIFIED_CSS = path.join(ROOT, 'registry-unified-table.css');
const COLUMN_CONTRACT_JS = path.join(ROOT, 'registry-column-contract.js');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Pediatric-only column patch could not find ${label}.`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Pediatric-only column patch found ambiguous ${label}.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchFrozenArray(source, name) {
  const marker = `const ${name} = Object.freeze([`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Pediatric-only column patch could not find ${name}.`);
  const end = source.indexOf(']);', start);
  if (end < 0) throw new Error(`Pediatric-only column patch could not close ${name}.`);
  const block = source.slice(start, end + 3);
  if (block.includes("'pediatric-only'")) return source;
  const before = "'dosage-pediatric', 'clinical-status'";
  if (!block.includes(before)) throw new Error(`Pediatric-only column patch could not place ${name}.`);
  const next = block.replace(before, "'dosage-pediatric', 'pediatric-only', 'clinical-status'");
  return source.slice(0, start) + next + source.slice(end + 3);
}

function addObjectEntry(source, name, entry, sentinel) {
  const marker = `const ${name} = Object.freeze({`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Pediatric-only column patch could not find ${name}.`);
  const end = source.indexOf('\n  });', start);
  if (end < 0) throw new Error(`Pediatric-only column patch could not close ${name}.`);
  const block = source.slice(start, end);
  if (block.includes(sentinel)) return source;
  const next = `${block}\n    ${entry}`;
  return source.slice(0, start) + next + source.slice(end);
}

function patchRuntime(source) {
  source = replaceOnce(
    source,
    "  { key:'Nr rendor', label:'Nr', mobileLabel:'Nr', type:'num', cls:'code', visible:false },\n  { key:'Emri tregtar'",
    "  { key:'Nr rendor', label:'Nr', mobileLabel:'Nr', type:'num', cls:'code', visible:false },\n  { key:'Pediatric only', label:'Pediatric only', mobileLabel:'Pediatric only', type:'str', cls:'population-pediatric-only-column', visible:false },\n  { key:'Emri tregtar'",
    'COLUMNS entry'
  );

  source = replaceOnce(
    source,
    "        let val = r[col.key];\n        if(col.key === 'Statusi')",
    "        let val = r[col.key];\n        if(col.key === 'Pediatric only'){\n          const pediatricOnly = String(val ?? '').trim() === 'Pediatric only';\n          const display = pediatricOnly ? '<span class=\"mi-pediatric-only-column-value\">Pediatric only</span>' : '&mdash;';\n          return '<td class=\"' + col.cls + '\" data-column-key=\"' + columnKey + '\" data-label=\"' + mobileLabel + '\" data-approved-population=\"' + (pediatricOnly ? 'pediatric_only' : '') + '\">' + display + '</td>';\n        }\n        if(col.key === 'Statusi')",
    'pediatric-only cell renderer'
  );

  source = replaceOnce(
    source,
    "initFormPicker();\nbuildColPanel();\ninitPrescriptionBridge();\nrender();",
    "window.addEventListener('medindex:pediatric-only-population-ready', () => {\n  if(typeof window.MEDINDEX_REFRESH_REGISTRY === 'function') window.MEDINDEX_REFRESH_REGISTRY();\n  else render();\n});\n\ninitFormPicker();\nbuildColPanel();\ninitPrescriptionBridge();\nrender();",
    'population-ready rerender hook'
  );

  if (!source.includes("key:'Pediatric only'")
      || !source.includes("col.key === 'Pediatric only'")
      || !source.includes('medindex:pediatric-only-population-ready')) {
    throw new Error('Pediatric-only runtime column contract was not applied.');
  }
  return source;
}

function patchUnifiedTable(source) {
  source = patchFrozenArray(source, 'FULL_ORDER');
  source = patchFrozenArray(source, 'CLINICAL_ORDER');
  source = addObjectEntry(source, 'LABEL_BY_KEY', "'pediatric-only':'Pediatric only',", "'pediatric-only':'Pediatric only'");
  source = addObjectEntry(source, 'RAW_FIELD_BY_KEY', "'pediatric-only':'Pediatric only',", "'pediatric-only':'Pediatric only'");
  source = addObjectEntry(source, 'WIDTHS', "'pediatric-only':138,", "'pediatric-only':138");

  if (source.includes("pediatriconly:'population'")) {
    source = source.replace("pediatriconly:'population'", "pediatriconly:'pediatric-only'");
  } else if (!source.includes("pediatriconly:'pediatric-only'")) {
    source = addObjectEntry(source, 'LABEL_KEYS', "pediatriconly:'pediatric-only', popullataepediatrike:'pediatric-only',", "pediatriconly:'pediatric-only'");
  }

  if (!source.includes("'pediatric-only':'Pediatric only'")
      || !source.includes("pediatriconly:'pediatric-only'")) {
    throw new Error('Pediatric-only unified table contract was not applied.');
  }
  return source;
}

function patchColumnContract(source) {
  if (source.includes("pediatriconly:'population'")) {
    source = source.replace("pediatriconly:'population'", "pediatriconly:'pediatric-only'");
  } else if (!source.includes("pediatriconly:'pediatric-only'")) {
    source = replaceOnce(
      source,
      "    formafarmaceutike:'form', sishenohetnerecete:'prescription-label',\n",
      "    formafarmaceutike:'form', pediatriconly:'pediatric-only', popullataepediatrike:'pediatric-only', sishenohetnerecete:'prescription-label',\n",
      'column-contract alias'
    );
  }
  if (!source.includes("pediatriconly:'pediatric-only'")) {
    throw new Error('Pediatric-only registry column contract was not applied.');
  }
  return source;
}

function patchUnifiedCss(source) {
  const before = '    [data-registry-column-key="dosage-pediatric"],[data-registry-column-key="clinical-status"],\n    [data-registry-column-key="clinical-action"]';
  const after = '    [data-registry-column-key="dosage-pediatric"],[data-registry-column-key="pediatric-only"],\n    [data-registry-column-key="clinical-status"],[data-registry-column-key="clinical-action"]';
  source = replaceOnce(source, before, after, 'clinical-view visibility');

  if (!source.includes('.mi-pediatric-only-column-value')) {
    source += `\n\n/* Optional approved Pediatric only column from the column picker. */\n#dataTable :is(td,th)[data-registry-column-key="pediatric-only"] {\n  text-align:center!important;\n}\n\n#dataTable .mi-pediatric-only-column-value {\n  display:inline-flex!important;\n  min-height:25px!important;\n  align-items:center!important;\n  justify-content:center!important;\n  padding:4px 8px!important;\n  border:1px solid #f9a8d4!important;\n  border-radius:999px!important;\n  background:#fff0f6!important;\n  color:#be185d!important;\n  font-size:.64rem!important;\n  font-weight:800!important;\n  line-height:1!important;\n  white-space:nowrap!important;\n}\n\n[data-theme="dark"] #dataTable .mi-pediatric-only-column-value {\n  border-color:#db2777!important;\n  background:#3a1d2b!important;\n  color:#f9a8d4!important;\n}\n`;
  }
  return source;
}

for (const file of RUNTIME_OUTPUTS) {
  if (!fs.existsSync(file)) throw new Error(`Generated registry runtime missing: ${path.basename(file)}`);
  fs.writeFileSync(file, patchRuntime(fs.readFileSync(file, 'utf8')), 'utf8');
}

if (!fs.existsSync(UNIFIED_JS)) throw new Error('registry-unified-table.js is missing.');
fs.writeFileSync(UNIFIED_JS, patchUnifiedTable(fs.readFileSync(UNIFIED_JS, 'utf8')), 'utf8');

if (!fs.existsSync(COLUMN_CONTRACT_JS)) throw new Error('registry-column-contract.js is missing.');
fs.writeFileSync(COLUMN_CONTRACT_JS, patchColumnContract(fs.readFileSync(COLUMN_CONTRACT_JS, 'utf8')), 'utf8');

if (!fs.existsSync(UNIFIED_CSS)) throw new Error('registry-unified-table.css is missing.');
fs.writeFileSync(UNIFIED_CSS, patchUnifiedCss(fs.readFileSync(UNIFIED_CSS, 'utf8')), 'utf8');

console.log('Selectable Pediatric only registry column applied to picker, runtime and unified table.');
