'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APP_PART = path.join(ROOT, 'app-parts', 'part-03.txt');
const UNIFIED = path.join(ROOT, 'registry-unified-table.js');

let app = fs.readFileSync(APP_PART, 'utf8').replace(/\r\n?/g, '\n');
const pageAnchor = `  const pageRows = filtered.slice(start, start + pageSize);`;
const pageReplacement = `${pageAnchor}\n  window.MEDINDEX_REGISTRY_VISIBLE_ROWS = pageRows;`;
if (!app.includes(pageReplacement)) {
  if (!app.includes(pageAnchor)) throw new Error('Visible-row index patch could not find the page slice anchor.');
  app = app.replace(pageAnchor, pageReplacement);
}
if (!app.includes('window.MEDINDEX_REGISTRY_VISIBLE_ROWS = pageRows;')) {
  throw new Error('Full registry render must expose only the current visible page for table indexing.');
}
fs.writeFileSync(APP_PART, app, 'utf8');

let unified = fs.readFileSync(UNIFIED, 'utf8').replace(/\r\n?/g, '\n');
const rowsAnchor = `    const rows = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];`;
const rowsReplacement = `    const visibleRows = Array.isArray(window.MEDINDEX_REGISTRY_VISIBLE_ROWS)\n      ? window.MEDINDEX_REGISTRY_VISIBLE_ROWS\n      : null;\n    const rows = visibleRows || (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : []);`;
if (!unified.includes(rowsReplacement)) {
  if (!unified.includes(rowsAnchor)) throw new Error('Visible-row index patch could not find the unified raw-row anchor.');
  unified = unified.replace(rowsAnchor, rowsReplacement);
}
if (!unified.includes('const rows = visibleRows || (Array.isArray(window.MEDINDEX_REGISTRY_ROWS)')) {
  throw new Error('Unified table must prefer the bounded visible-row dataset.');
}
fs.writeFileSync(UNIFIED, unified, 'utf8');

console.log('Unified registry indexing is bounded to the currently rendered page while full data remains available to search and filters.');