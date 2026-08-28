'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

const MARKER = 'Registry Pagination v4 — final product polish';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Registry pagination v4 could not find ${label}.`);
  return source.replace(before, after);
}

function patchLite(file) {
  let source = read(file);

  source = replaceOnce(
    source,
    "    const frame = document.createElement('div');\n    frame.className = 'registry-pagination-frame';",
    "    const frame = document.createElement('div');\n    frame.className = 'registry-pagination-frame';\n    if (totalPages !== null && totalPages <= 1) frame.classList.add('registry-pagination-frame-static');",
    `${file} static one-page state`,
  );

  source = replaceOnce(
    source,
    "    const summary = document.createElement('div');\n    summary.className = 'registry-pagination-summary';\n    if (totalItems !== null) {",
    "    const summary = document.createElement('div');\n    summary.className = 'registry-pagination-summary';\n    summary.setAttribute('aria-live', 'polite');\n    summary.setAttribute('aria-atomic', 'true');\n    if (totalItems === 0) {\n      summary.innerHTML = '<strong>0 rezultate</strong>';\n      summary.setAttribute('aria-label', '0 rezultate');\n    } else if (totalItems !== null) {",
    `${file} zero-result summary`,
  );

  source = source
    .replace("const icon = direction === 'prev' ? '←' : '→';", "const icon = direction === 'prev' ? '‹' : '›';");

  if (!source.includes("registry-pagination-frame-static")) throw new Error(`${file} one-page static state missing.`);
  if (!source.includes("summary.setAttribute('aria-live', 'polite')")) throw new Error(`${file} polite page announcement missing.`);
  if (!source.includes("summary.innerHTML = '<strong>0 rezultate</strong>'")) throw new Error(`${file} zero-result copy missing.`);
  write(file, source);
}

function patchFull() {
  const file = 'app-parts/part-04.txt';
  let source = read(file);

  source = replaceOnce(
    source,
    "  const frame = document.createElement('div');\n  frame.className = 'registry-pagination-frame';\n  const summary = document.createElement('div');",
    "  const frame = document.createElement('div');\n  frame.className = 'registry-pagination-frame';\n  if(safeTotal <= 1) frame.classList.add('registry-pagination-frame-static');\n  const summary = document.createElement('div');",
    'full runtime static one-page state',
  );

  source = replaceOnce(
    source,
    "  const summary = document.createElement('div');\n  summary.className = 'registry-pagination-summary';\n  if(safeItems !== null){",
    "  const summary = document.createElement('div');\n  summary.className = 'registry-pagination-summary';\n  summary.setAttribute('aria-live', 'polite');\n  summary.setAttribute('aria-atomic', 'true');\n  if(safeItems === 0){\n    summary.innerHTML = '<strong>0 rezultate</strong>';\n    summary.setAttribute('aria-label', '0 rezultate');\n  } else if(safeItems !== null){",
    'full runtime zero-result summary',
  );

  source = source
    .replace("const icon = direction === 'prev' ? '←' : '→';", "const icon = direction === 'prev' ? '‹' : '›';");

  if (!source.includes("if(safeTotal <= 1) frame.classList.add('registry-pagination-frame-static')")) {
    throw new Error('Full runtime one-page static state missing.');
  }
  write(file, source);
}

function patchCss() {
  const file = 'registry-table-tools.css';
  let source = read(file);
  if (source.includes(MARKER)) return;

  source += `\n\n/* ${MARKER}\n   Brand-aligned teal accent, calmer density and meaningful edge states. */\nhtml[data-mi-page="barnat"] #pagination {\n  --mi-page-accent: var(--mi-brand-600, #147c80);\n  --mi-page-accent-strong: var(--mi-brand-700, #0f6266);\n  --mi-page-accent-soft: var(--mi-brand-50, #eaf7f6);\n  padding-block: 10px 12px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame {\n  min-height: 44px;\n  gap: 16px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-controls {\n  gap: 7px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-pages {\n  gap: 1px;\n  padding: 2px;\n  border-color: #e4eaf1;\n  border-radius: 12px;\n  background: #f8fafc;\n  box-shadow: none;\n}\n\nhtml[data-mi-page="barnat"] #pagination button {\n  height: 36px;\n  border-radius: 8px;\n  font-size: 12.75px;\n  font-weight: 650;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-page {\n  width: 34px;\n  min-width: 34px;\n  color: #475569;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-nav {\n  min-width: 72px;\n  padding-inline: 11px;\n  border-color: #dce5ee;\n  color: #334155;\n  box-shadow: none;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-nav-icon {\n  width: 12px;\n  color: currentColor;\n  font-size: 18px;\n  font-weight: 500;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-page:hover:not([aria-current="page"]),\nhtml[data-mi-page="barnat"] #pagination button.registry-pagination-nav:hover:not(:disabled) {\n  border-color: #b8d7d6;\n  background: var(--mi-page-accent-soft);\n  color: var(--mi-page-accent-strong);\n  box-shadow: none;\n}\n\nhtml[data-mi-page="barnat"] #pagination button.active,\nhtml[data-mi-page="barnat"] #pagination button[aria-current="page"] {\n  border-color: var(--mi-page-accent);\n  background: var(--mi-page-accent);\n  color: #fff;\n  box-shadow: 0 1px 2px rgba(15, 98, 102, .18), inset 0 0 0 1px rgba(255,255,255,.10);\n  font-weight: 750;\n}\n\nhtml[data-mi-page="barnat"] #pagination button:disabled {\n  border-color: transparent;\n  background: transparent;\n  color: #a7b2c1;\n  opacity: .72;\n}\n\nhtml[data-mi-page="barnat"] #pagination button:focus-visible {\n  outline: 2px solid color-mix(in srgb, var(--mi-page-accent) 42%, transparent);\n  outline-offset: 2px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-summary {\n  gap: 4px;\n  font-size: 12.25px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-summary strong {\n  font-size: 12.75px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-size {\n  font-size: 12.25px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame-static {\n  grid-template-columns: 1fr;\n  min-height: 34px;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame-static .registry-pagination-controls,\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame-static .registry-pagination-size {\n  display: none !important;\n}\n\nhtml[data-mi-page="barnat"] #pagination .registry-pagination-frame-static .registry-pagination-summary {\n  justify-self: start;\n}\n\n@media (max-width: 560px) {\n  html[data-mi-page="barnat"] #pagination { padding-block: 9px 11px; }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-frame { gap: 8px; }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-controls {\n    grid-template-columns: 40px minmax(0,1fr) 40px;\n    gap: 5px;\n  }\n  html[data-mi-page="barnat"] #pagination button.registry-pagination-nav {\n    width: 40px;\n    min-width: 40px;\n    height: 40px;\n  }\n  html[data-mi-page="barnat"] #pagination .registry-pagination-frame-static .registry-pagination-summary {\n    justify-self: center;\n  }\n}\n\nhtml.dark[data-mi-page="barnat"] #pagination .registry-pagination-pages,\nhtml[data-theme="dark"][data-mi-page="barnat"] #pagination .registry-pagination-pages {\n  border-color: #2b3a4f;\n  background: #111c2f;\n}\n`;

  write(file, source);
}

function verify() {
  const desktop = read('registry-desktop-lite.js');
  const mobile = read('registry-mobile-lite.js');
  const full = read('app-parts/part-04.txt');
  const css = read('registry-table-tools.css');

  for (const [name, source] of [['desktop', desktop], ['mobile', mobile], ['full', full]]) {
    if (!source.includes('registry-pagination-frame-static')) throw new Error(`${name} static pagination state missing.`);
    if (!source.includes("aria-live', 'polite")) throw new Error(`${name} pagination announcement missing.`);
    if (!source.includes('0 rezultate')) throw new Error(`${name} zero-result state missing.`);
    if (!source.includes("? '‹' : '›'")) throw new Error(`${name} refined chevrons missing.`);
  }
  if (!css.includes(MARKER)) throw new Error('Pagination v4 CSS marker missing.');
  if (!css.includes('--mi-page-accent: var(--mi-brand-600')) throw new Error('Pagination is not aligned to the MedIndex brand accent.');
  if (!css.includes('.registry-pagination-frame-static .registry-pagination-controls')) {
    throw new Error('Single-page controls are not suppressed.');
  }
}

patchLite('registry-desktop-lite.js');
patchLite('registry-mobile-lite.js');
patchFull();
patchCss();
verify();
console.log('Registry pagination v4 final polish passed: MedIndex brand accent, calm density, zero/one-page states, accessible announcements and mobile parity.');
