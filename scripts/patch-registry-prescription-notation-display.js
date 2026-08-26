'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'registry-prescription-notation-display-v2';
const COLUMN_FILE = path.join(ROOT, 'registry-desktop-column-lite.js');
const UNIFIED_FILE = path.join(ROOT, 'registry-unified-table.js');
const DESKTOP_FILE = path.join(ROOT, 'registry-desktop-lite.js');
const API_FILE = path.join(ROOT, 'api', 'drug-search.js');

const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
const write = (file, source) => fs.writeFileSync(file, source.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const at = source.indexOf(before);
  if (at < 0) throw new Error(`${MARKER}: ${label} anchor not found.`);
  return source.slice(0, at) + after + source.slice(at + before.length);
}

function patchColumnLite() {
  let source = read(COLUMN_FILE);

  const oldFormatted = `  function formatted(value, column) {\n    if (!column.price) return clean(value) || '—';\n    const number = Number(value);\n    return value === '' || value == null || !Number.isFinite(number)\n      ? '—'\n      : number.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';\n  }`;
  const oldV1Formatted = `  function formatted(value, column) {\n    const text = clean(value);\n    // registry-prescription-notation-display-v1: a dash is not prescription notation. Preserve the real\n    // notation when present and render a genuinely missing notation as blank.\n    if (column.key === 'prescription-label') return text;\n    if (!column.price) return text || '—';\n    const number = Number(value);\n    return value === '' || value == null || !Number.isFinite(number)\n      ? '—'\n      : number.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';\n  }`;
  const newFormatted = `  function prescriptionDisplayValue(value) {\n    const text = clean(value);\n    // ${MARKER}: a dash-only value is a placeholder, not prescription content.\n    return /^[-–—]+$/.test(text) ? '' : text;\n  }\n\n  function formatted(value, column) {\n    const text = clean(value);\n    // ${MARKER}: preserve the real notation when present and render a genuinely\n    // missing or placeholder-only notation as blank.\n    if (column.key === 'prescription-label') return prescriptionDisplayValue(value);\n    if (!column.price) return text || '—';\n    const number = Number(value);\n    return value === '' || value == null || !Number.isFinite(number)\n      ? '—'\n      : number.toLocaleString('de-DE', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';\n  }`;
  if (!source.includes(newFormatted)) {
    if (source.includes(oldV1Formatted)) source = replaceOnce(source, oldV1Formatted, newFormatted, 'v1 prescription fallback upgrade');
    else source = replaceOnce(source, oldFormatted, newFormatted, 'targeted prescription fallback');
  }

  const oldRehydrate = `      if (!existed || column.remote) {\n        changed = fillCell(cell, valueFor(rowMap.get(id), id, column), column) || changed;\n      }`;
  const oldV1Rehydrate = `      // registry-prescription-notation-display-v1: unified-table may synthesize this cell before the\n      // lightweight column owner runs. Always rehydrate prescription notation\n      // from the canonical row instead of accepting the synthetic dash.\n      if (!existed || column.remote || column.key === 'prescription-label') {\n        changed = fillCell(cell, valueFor(rowMap.get(id), id, column), column) || changed;\n      }`;
  const newRehydrate = `      // ${MARKER}: unified-table may synthesize this cell before the\n      // lightweight column owner runs. Always rehydrate prescription notation\n      // from the canonical row instead of accepting any synthetic placeholder.\n      if (!existed || column.remote || column.key === 'prescription-label') {\n        changed = fillCell(cell, valueFor(rowMap.get(id), id, column), column) || changed;\n      }`;
  if (!source.includes(newRehydrate)) {
    if (source.includes(oldV1Rehydrate)) source = replaceOnce(source, oldV1Rehydrate, newRehydrate, 'v1 existing prescription cell rehydration upgrade');
    else source = replaceOnce(source, oldRehydrate, newRehydrate, 'existing prescription cell rehydration');
  }

  if (!source.includes("if (column.key === 'prescription-label') return prescriptionDisplayValue(value);")) {
    throw new Error(`${MARKER}: prescription notation still falls back to a dash in column-lite.`);
  }
  if (!source.includes("return /^[-–—]+$/.test(text) ? '' : text;")) {
    throw new Error(`${MARKER}: dash-only prescription placeholders are not normalized.`);
  }
  if (!source.includes("!existed || column.remote || column.key === 'prescription-label'")) {
    throw new Error(`${MARKER}: existing prescription cells are not rehydrated.`);
  }
  write(COLUMN_FILE, source);
}

function patchUnifiedTable() {
  let source = read(UNIFIED_FILE);
  const before = `    } else if (key === 'form') {\n      cell.className = 'wrap registry-form-cell';\n      cell.innerHTML = '<span class="cat-dot" aria-hidden="true"></span><span class="registry-cell-value"></span>';\n      cell.querySelector('.registry-cell-value').textContent = value || '—';\n    } else {\n      cell.textContent = value || '—';\n    }\n    cell.title = value;`;
  const oldV1 = `    } else if (key === 'form') {\n      cell.className = 'wrap registry-form-cell';\n      cell.innerHTML = '<span class="cat-dot" aria-hidden="true"></span><span class="registry-cell-value"></span>';\n      cell.querySelector('.registry-cell-value').textContent = value || '—';\n    } else if (key === 'prescription-label') {\n      // registry-prescription-notation-display-v1: never present a synthetic dash as if it were prescription\n      // content. Column-lite will also rehydrate this cell from the canonical row.\n      cell.className = 'wrap';\n      cell.textContent = value;\n    } else {\n      cell.textContent = value || '—';\n    }\n    cell.title = value;`;
  const after = `    } else if (key === 'form') {\n      cell.className = 'wrap registry-form-cell';\n      cell.innerHTML = '<span class="cat-dot" aria-hidden="true"></span><span class="registry-cell-value"></span>';\n      cell.querySelector('.registry-cell-value').textContent = value || '—';\n    } else if (key === 'prescription-label') {\n      // ${MARKER}: never present a synthetic or upstream dash-only placeholder\n      // as prescription content. Column-lite rehydrates from the canonical row too.\n      cell.className = 'wrap';\n      cell.textContent = /^[-–—]+$/.test(value) ? '' : value;\n    } else {\n      cell.textContent = value || '—';\n    }\n    cell.title = value;`;
  if (!source.includes(after)) {
    if (source.includes(oldV1)) source = replaceOnce(source, oldV1, after, 'v1 unified prescription placeholder upgrade');
    else source = replaceOnce(source, before, after, 'unified prescription placeholder');
  }

  const start = source.indexOf('  function makeCell(key, row, synthetic = true) {');
  const end = source.indexOf('  function stampHeader(header) {', start);
  const block = start >= 0 && end > start ? source.slice(start, end) : '';
  if (!block.includes("} else if (key === 'prescription-label') {")) {
    throw new Error(`${MARKER}: unified table has no dedicated prescription cell branch.`);
  }
  const prescriptionAt = block.indexOf("} else if (key === 'prescription-label') {");
  const prescriptionEnd = block.indexOf('    } else {', prescriptionAt);
  const prescriptionBlock = block.slice(prescriptionAt, prescriptionEnd);
  if (prescriptionBlock.includes("value || '—'")) {
    throw new Error(`${MARKER}: unified prescription cell can still emit a dash placeholder.`);
  }
  if (!prescriptionBlock.includes("/^[-–—]+$/.test(value) ? '' : value")) {
    throw new Error(`${MARKER}: unified prescription cell does not suppress dash-only upstream placeholders.`);
  }
  write(UNIFIED_FILE, source);
}

function verifyDataContract() {
  const desktop = read(DESKTOP_FILE);
  const api = read(API_FILE);
  if (!desktop.includes("'Si të shënohet në recetë':clean(row.prescriptionNotation)")) {
    throw new Error(`${MARKER}: desktop canonical row dropped prescriptionNotation.`);
  }
  if (!api.includes('prescriptionNotation:registryPrescriptionNotation(row)')) {
    throw new Error(`${MARKER}: registry API dropped computed prescription notation.`);
  }
  if (!api.includes('return clean(notation?.line);')) {
    throw new Error(`${MARKER}: registry API prescription notation is no longer sourced from the canonical builder line.`);
  }
}

patchColumnLite();
patchUnifiedTable();
verifyDataContract();
console.log('Prescription notation display hardened v2: canonical API value always rehydrates the visible cell; missing and dash-only placeholders stay blank.');
