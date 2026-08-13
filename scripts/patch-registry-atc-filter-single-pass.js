'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'app-parts', 'core-tail.txt');
let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

const before = `currentFilterKey = function currentFilterKeyWithAtc(){\n  return [\n    String(state.activeAtc || ''),\n    normalizeSearchText(state.search),\n    state.status,\n    state.formType || '',\n    state.formValue || '',\n  ].join('|');\n};\n\ngetFiltered = function getFilteredWithAtc(){\n  const key = currentFilterKey();\n  if(key === filteredCacheKey) return filteredCacheRows;\n\n  let rows = getRegistryAtcRows();\n  const q = normalizeSearchText(state.search);\n  if(q){\n    const terms = q.split(/\\s+/).filter(Boolean);\n    rows = rows.filter(row => rowMatchesSearch(row, terms));\n  }\n  if(state.status){\n    rows = rows.filter(row => String(row['Statusi'] ?? '').trim() === state.status);\n  }\n  if(state.formType === 'form'){\n    rows = rows.filter(row => String(row['Forma farmaceutike'] ?? '').trim() === state.formValue);\n  } else if(state.formType === 'category'){\n    rows = rows.filter(row => categoryOf(row['Forma farmaceutike']) === state.formValue);\n  }\n\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n};`;

const after = `currentFilterKey = function currentFilterKeyWithAtc(normalizedSearch = normalizeSearchText(state.search)){\n  return [\n    String(state.activeAtc || ''),\n    normalizedSearch,\n    state.status,\n    state.formType || '',\n    state.formValue || '',\n  ].join('|');\n};\n\ngetFiltered = function getFilteredWithAtc(){\n  const q = normalizeSearchText(state.search);\n  const key = currentFilterKey(q);\n  if(key === filteredCacheKey) return filteredCacheRows;\n\n  const terms = q ? q.split(/\\s+/).filter(Boolean) : null;\n  const hasStatus = Boolean(state.status);\n  const formType = state.formType || '';\n  const formValue = state.formValue || '';\n  const sourceRows = getRegistryAtcRows();\n  const hasFilters = Boolean(terms?.length || hasStatus || formType);\n  const rows = hasFilters ? sourceRows.filter(row => {\n    if(hasStatus && String(row['Statusi'] ?? '').trim() !== state.status) return false;\n    if(formType === 'form' && String(row['Forma farmaceutike'] ?? '').trim() !== formValue) return false;\n    if(formType === 'category' && categoryOf(row['Forma farmaceutike']) !== formValue) return false;\n    if(terms?.length && !rowMatchesSearch(row, terms)) return false;\n    return true;\n  }) : sourceRows;\n\n  filteredCacheKey = key;\n  filteredCacheRows = rows;\n  return rows;\n};`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('ATC-aware registry filter anchor is missing.');
  source = source.replace(before, after);
}

if (!source.includes('const key = currentFilterKey(q);')) throw new Error('ATC-aware filter must reuse the normalized query.');
if (!source.includes('const rows = hasFilters ? sourceRows.filter(row => {')) throw new Error('ATC-aware filters must share one pass.');
if (!source.includes("if(formType === 'category' && categoryOf(row['Forma farmaceutike']) !== formValue) return false;")) throw new Error('ATC-aware form-category semantics changed.');

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Final ATC-aware registry filtering normalizes once and applies status/form/search predicates in one cached pass.');
