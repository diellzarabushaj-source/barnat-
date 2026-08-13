'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'app-parts', 'part-03.txt');
let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

const before = `function getFiltered(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n  let rows = RAW;\n  const q = normalizeSearchText(state.search);\n  if(q){\n    const terms = q.split(/\\s+/).filter(Boolean);\n    rows = rows.filter(row => rowMatchesSearch(row, terms));\n  }\n  if(state.status){\n    rows = rows.filter(r => String(r['Statusi'] ?? '').trim() === state.status);\n  }\n  if(state.formType === 'form'){\n    rows = rows.filter(r => String(r['Forma farmaceutike'] ?? '').trim() === state.formValue);\n  } else if(state.formType === 'category'){\n    rows = rows.filter(r => categoryOf(r['Forma farmaceutike']) === state.formValue);\n  }\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n}`;

const searchFirst = `function getFiltered(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n  const q = normalizeSearchText(state.search);\n  const terms = q ? q.split(/\\s+/).filter(Boolean) : null;\n  const hasStatus = Boolean(state.status);\n  const formType = state.formType || '';\n  const formValue = state.formValue || '';\n  const hasFilters = Boolean(terms?.length || hasStatus || formType);\n  const rows = hasFilters ? RAW.filter(row => {\n    if(terms?.length && !rowMatchesSearch(row, terms)) return false;\n    if(hasStatus && String(row['Statusi'] ?? '').trim() !== state.status) return false;\n    if(formType === 'form' && String(row['Forma farmaceutike'] ?? '').trim() !== formValue) return false;\n    if(formType === 'category' && categoryOf(row['Forma farmaceutike']) !== formValue) return false;\n    return true;\n  }) : RAW;\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n}`;

const after = `function getFiltered(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n  const q = normalizeSearchText(state.search);\n  const terms = q ? q.split(/\\s+/).filter(Boolean) : null;\n  const hasStatus = Boolean(state.status);\n  const formType = state.formType || '';\n  const formValue = state.formValue || '';\n  const hasFilters = Boolean(terms?.length || hasStatus || formType);\n  const rows = hasFilters ? RAW.filter(row => {\n    if(hasStatus && String(row['Statusi'] ?? '').trim() !== state.status) return false;\n    if(formType === 'form' && String(row['Forma farmaceutike'] ?? '').trim() !== formValue) return false;\n    if(formType === 'category' && categoryOf(row['Forma farmaceutike']) !== formValue) return false;\n    if(terms?.length && !rowMatchesSearch(row, terms)) return false;\n    return true;\n  }) : RAW;\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n}`;

if (!source.includes(after)) {
  if (source.includes(searchFirst)) source = source.replace(searchFirst, after);
  else {
    if (!source.includes(before)) throw new Error('Registry single-pass filter anchor is missing.');
    source = source.replace(before, after);
  }
}

if (!source.includes('const hasFilters = Boolean(terms?.length || hasStatus || formType);')) {
  throw new Error('Registry filter fast path must reuse RAW when no filter is active.');
}
if (!source.includes('const rows = hasFilters ? RAW.filter(row => {')) {
  throw new Error('Registry filters must execute in one bounded pass.');
}
if (!source.includes("if(formType === 'category' && categoryOf(row['Forma farmaceutike']) !== formValue) return false;")) {
  throw new Error('Registry category filtering semantics must be preserved.');
}
if (source.indexOf("if(terms?.length && !rowMatchesSearch(row, terms)) return false;") < source.indexOf("if(hasStatus && String(row['Statusi'] ?? '').trim() !== state.status) return false;")) {
  throw new Error('Cheap registry filters must short-circuit before search indexing.');
}

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Registry status/form filters short-circuit before search indexing in one cached pass over the canonical dataset.');
