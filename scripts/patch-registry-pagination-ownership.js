'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const LIST_MARKER = "pagination.hidden = next === 'list';";
const CSS_MARKER = '/* Pagination belongs only to the actual registry table. */';

function patchListOwnership() {
  const file = 'registry-list-view.js';
  let source = read(file);
  if (!source.includes(LIST_MARKER)) {
    const anchor = "    ROOT.dataset.miRegistryView = next;\n    if (elements) {";
    const replacement = "    ROOT.dataset.miRegistryView = next;\n\n    // Pagination belongs to the paged medicine table, never to the ATC browser.\n    // Keep this as DOM state as well as CSS state so late stylesheet ordering or\n    // a pagination re-render cannot make the table footer leak into List mode.\n    const pagination = document.getElementById('pagination');\n    if (pagination) {\n      pagination.hidden = next === 'list';\n      pagination.setAttribute('aria-hidden', String(next === 'list'));\n    }\n\n    if (elements) {";
    if (!source.includes(anchor)) throw new Error('Registry pagination ownership could not find List view switch anchor.');
    source = source.replace(anchor, replacement);
    write(file, source);
  }

  const verified = read(file);
  if (!verified.includes(LIST_MARKER)) throw new Error('List view does not own pagination visibility.');
  if (!verified.includes("pagination.setAttribute('aria-hidden', String(next === 'list'))")) {
    throw new Error('Pagination accessibility visibility is not synchronized with List mode.');
  }
}

function patchPaginationCss() {
  const file = 'registry-pagination-v2.css';
  let source = read(file);
  if (!source.includes(CSS_MARKER)) {
    const guard = `${CSS_MARKER}\nhtml[data-mi-page="barnat"] #pagination[hidden],\nhtml[data-mi-page="barnat"][data-mi-registry-view="list"] #pagination {\n  display: none !important;\n}\n\n`;
    source = guard + source;
    write(file, source);
  }

  const verified = read(file);
  if (!verified.includes('#pagination[hidden]')) throw new Error('Pagination hidden-state CSS guard is missing.');
  if (!verified.includes('[data-mi-registry-view="list"] #pagination')) {
    throw new Error('ATC/List-mode pagination CSS guard is missing.');
  }
  if (!verified.includes('display: none !important;')) throw new Error('Pagination ownership guard is not authoritative.');
}

patchListOwnership();
patchPaginationCss();
console.log('Registry pagination ownership passed: pagination is table-only and stays hidden throughout ATC/List browsing.');
