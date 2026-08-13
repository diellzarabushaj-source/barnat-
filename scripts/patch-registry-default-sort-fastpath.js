'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'app-parts', 'part-03.txt');
let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n?/g, '\n');

const before = `function sortRows(rows){\n  const cacheKey = \`${'${state.sortKey}|${state.sortDir}'}\`;\n  if(sortedCacheInput === rows && sortedCacheKey === cacheKey) return sortedCacheRows;\n  const col = COLUMNS.find(c => c.key === state.sortKey);`;

const after = `function sortRows(rows){\n  const cacheKey = \`${'${state.sortKey}|${state.sortDir}'}\`;\n  if(sortedCacheInput === rows && sortedCacheKey === cacheKey) return sortedCacheRows;\n  if(rows === RAW && state.sortKey === 'Nr rendor' && state.sortDir === 1){\n    sortedCacheInput = rows;\n    sortedCacheKey = cacheKey;\n    sortedCacheRows = rows;\n    return rows;\n  }\n  const col = COLUMNS.find(c => c.key === state.sortKey);`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Default registry sort fast-path anchor is missing.');
  source = source.replace(before, after);
}

if (!source.includes("rows === RAW && state.sortKey === 'Nr rendor' && state.sortDir === 1")) {
  throw new Error('Default registry sort fast path was not applied.');
}
if (!source.includes('const sorted = [...rows].sort((a,b) => {')) {
  throw new Error('Non-default registry sorting must remain unchanged.');
}

fs.writeFileSync(TARGET, source, 'utf8');
console.log('Default Nr rendor ascending registry view reuses canonical row order without cloning and sorting the full dataset.');
