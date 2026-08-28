'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const MARKER = 'Registry Pagination v5 — attached table footer';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Registry pagination v5 could not find ${label}.`);
  return source.replace(before, after);
}

function patchLite(file) {
  let source = read(file);
  source = replaceOnce(
    source,
    "      summary.innerHTML = '<span class=\"registry-pagination-summary-label\">Rezultatet</span>'\n        + `<strong>${start}–${end}</strong><span>nga ${totalItems}</span>`;\n      summary.setAttribute('aria-label', `Rezultatet ${start} deri ${end} nga ${totalItems}`);",
    "      summary.innerHTML = `<strong>${start}–${end}</strong><span>nga ${totalItems} barna</span>`;\n      summary.setAttribute('aria-label', `Barnat ${start} deri ${end} nga ${totalItems}`);",
    `${file} concise registry range copy`,
  );
  if (!source.includes('nga ${totalItems} barna')) throw new Error(`${file} registry range copy missing.`);
  write(file, source);
}

function patchFull() {
  const file = 'app-parts/part-04.txt';
  let source = read(file);
  source = replaceOnce(
    source,
    "    summary.innerHTML = '<span class=\"registry-pagination-summary-label\">Rezultatet</span>' + `<strong>${start}–${end}</strong><span>nga ${safeItems}</span>`;\n    summary.setAttribute('aria-label', `Rezultatet ${start} deri ${end} nga ${safeItems}`);",
    "    summary.innerHTML = `<strong>${start}–${end}</strong><span>nga ${safeItems} barna</span>`;\n    summary.setAttribute('aria-label', `Barnat ${start} deri ${end} nga ${safeItems}`);",
    'full runtime concise registry range copy',
  );
  if (!source.includes('nga ${safeItems} barna')) throw new Error('Full runtime registry range copy missing.');
  write(file, source);
}

function patchCss() {
  const file = 'registry-table-tools.css';
  let source = read(file);
  if (source.includes(MARKER)) return;

  source += `\n\n/* ${MARKER}\n   Pagination is part of the medicine table, not a second card. The table owns\n   the top of the surface; this footer closes the same surface underneath it. */\nhtml[data-mi-page="barnat"]:not([data-mi-registry-view="list"]) #registryContent {\n  margin-bottom: 0 !important;\n  border-bottom-left-radius: 0 !important;\n  border-bottom-right-radius: 0 !important;\n}\n\nhtml[data-mi-page="barnat"] #pagination:not([hidden]) {\n  margin: -1px 0 0 !important;\n  padding: 8px 16px 10px;\n  border: 1px solid var(--mi-page-border-soft, #e8eef5);\n  border-top-color: #edf1f5;\n  border-radius: 0 0 14px 14px;\n  background: var(--mi-page-surface, #fff);\n  box-shadow: none;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame {\n  width: 100%;\n  max-width: none;\n  min-height: 40px;\n  grid-template-columns: minmax(170px, 1fr) auto minmax(100px, 1fr);\n  gap: 14px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-summary {\n  color: #64748b;\n  font-size: 12.25px;\n  font-weight: 520;\n  letter-spacing: -.005em;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-summary strong {\n  color: #334155;\n  font-size: 12.5px;\n  font-weight: 700;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-pages {\n  border-color: #e8edf2;\n  background: transparent;\n  padding: 1px;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-page {\n  width: 33px;\n  min-width: 33px;\n  height: 34px;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-nav {\n  min-width: 68px;\n  height: 34px;\n  padding-inline: 10px;\n  border-color: transparent;\n  background: transparent;\n  color: #64748b;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-nav:hover:not(:disabled) {\n  border-color: #d8e7e6;\n  background: var(--mi-page-accent-soft);\n  color: var(--mi-page-accent-strong);\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-size {\n  color: #94a3b8;\n  font-size: 12px;\n  font-weight: 600;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame-static {\n  grid-template-columns: 1fr;\n  min-height: 30px;\n}\n\n@media (max-width: 760px) {\n  html[data-mi-page="barnat"] #pagination:not([hidden]) {\n    padding-inline: 12px;\n  }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-frame {\n    grid-template-columns: 1fr auto;\n    gap: 8px 12px;\n  }\n}\n\n@media (max-width: 560px) {\n  html[data-mi-page="barnat"] #pagination:not([hidden]) {\n    margin-top: -1px !important;\n    padding: 8px 9px 10px;\n    border-radius: 0 0 12px 12px;\n  }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-frame {\n    grid-template-columns: 1fr;\n    gap: 7px;\n  }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-summary {\n    justify-self: center;\n    font-size: 11.75px;\n  }\n  html[data-mi-page="barnat"] #pagination button.registry-pagination-page {\n    width: 32px;\n    min-width: 32px;\n    height: 34px;\n  }\n}\n\nhtml.dark[data-mi-page="barnat"] #pagination:not([hidden]),\nhtml[data-theme="dark"][data-mi-page="barnat"] #pagination:not([hidden]) {\n  border-color: #25354a;\n  border-top-color: #25354a;\n  background: #0f172a;\n}\n\nhtml.dark[data-mi-page="barnat"] #pagination .registry-pagination-summary strong,\nhtml[data-theme="dark"][data-mi-page="barnat"] #pagination .registry-pagination-summary strong {\n  color: #d7e2ef;\n}\n`;
  write(file, source);
}

function verify() {
  const desktop = read('registry-desktop-lite.js');
  const mobile = read('registry-mobile-lite.js');
  const full = read('app-parts/part-04.txt');
  const css = read('registry-table-tools.css');

  for (const [name, source, token] of [
    ['desktop', desktop, 'nga ${totalItems} barna'],
    ['mobile', mobile, 'nga ${totalItems} barna'],
    ['full', full, 'nga ${safeItems} barna'],
  ]) {
    if (!source.includes(token)) throw new Error(`${name} concise medicine-range copy missing.`);
    if (!source.includes('registry-pagination-frame-static')) throw new Error(`${name} one-page state regressed.`);
    if (!source.includes('aria-live')) throw new Error(`${name} accessible live summary regressed.`);
  }

  if (!css.includes(MARKER)) throw new Error('Pagination v5 CSS marker missing.');
  if (!css.includes('#registryContent')) throw new Error('Pagination v5 does not visually attach to the registry table.');
  if (!css.includes('border-radius: 0 0 14px 14px')) throw new Error('Pagination v5 footer radius missing.');
  if (!css.includes('width: 100%')) throw new Error('Pagination v5 footer does not align to the table width.');
  if (!css.includes('[data-mi-registry-view="list"]')) throw new Error('Pagination v5 table-only styling guard missing.');
}

patchLite('registry-desktop-lite.js');
patchLite('registry-mobile-lite.js');
patchFull();
patchCss();
verify();
console.log('Registry pagination v5 passed: table-attached footer, concise medicine range, full-width alignment, calm controls and mobile/dark parity.');
