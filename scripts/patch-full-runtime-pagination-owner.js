'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'app-parts', 'part-04.txt');
const MARKER = 'full-runtime-pagination-busy-reset-v1';

let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

if (!source.includes(MARKER)) {
  const anchor = [
    'function renderPagination(totalPages, totalItems = null){',
    "  const pag = document.getElementById('pagination');",
    '  if(!pag) return;',
    "  pag.innerHTML = '';",
    "  pag.classList.add('registry-pagination-v2', 'registry-pagination-v3');",
  ].join('\n');

  const replacement = [
    'function renderPagination(totalPages, totalItems = null){',
    "  const pag = document.getElementById('pagination');",
    '  if(!pag) return;',
    `  // ${MARKER}: the full-data runtime owns synchronous local pagination.`,
    '  // A lightweight request may have left the shared footer busy while the',
    '  // owner changed. Full-runtime page changes do not perform network work,',
    '  // so a carried .is-loading state is always stale and must be released.',
    "  pag.classList.remove('is-loading');",
    "  pag.removeAttribute('aria-busy');",
    "  document.getElementById('dataTable')?.setAttribute('aria-busy', 'false');",
    "  pag.innerHTML = '';",
    "  pag.classList.add('registry-pagination-v2', 'registry-pagination-v3');",
  ].join('\n');

  const at = source.indexOf(anchor);
  if (at < 0) {
    throw new Error(`${MARKER}: full-runtime pagination v3 anchor was not found.`);
  }
  if (source.indexOf(anchor, at + anchor.length) >= 0) {
    throw new Error(`${MARKER}: full-runtime pagination anchor is ambiguous.`);
  }
  source = source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

if (!source.includes(MARKER)
    || !source.includes("pag.classList.remove('is-loading');")
    || !source.includes("pag.removeAttribute('aria-busy');")
    || !source.includes("document.getElementById('dataTable')?.setAttribute('aria-busy', 'false');")) {
  throw new Error(`${MARKER}: full-runtime pagination does not release inherited lightweight busy state.`);
}

fs.writeFileSync(FILE, source, 'utf8');
console.log('Full-runtime pagination ownership passed: every local render clears inherited desktop-lite busy state before exposing page controls.');
