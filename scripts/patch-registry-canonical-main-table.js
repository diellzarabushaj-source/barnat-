'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS_FILE = path.join(ROOT, 'registry-unified-table.js');
const CSS_FILE = path.join(ROOT, 'registry-table-tools.css');
const HTML_FILE = path.join(ROOT, 'index.html');
const RELEASE = 'registry-canonical-main-table-v1';

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`${label}: expected source anchor was not found.`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) throw new Error(`${label}: expected source block was not found.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function removeFunctionBefore(source, functionName, nextFunctionName, label) {
  const startNeedle = `function ${functionName}`;
  const nextNeedle = `function ${nextFunctionName}`;
  const start = source.indexOf(startNeedle);
  if (start < 0) return source;
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const next = source.indexOf(nextNeedle, start + startNeedle.length);
  if (next < 0) throw new Error(`${label}: next function boundary was not found.`);
  const nextLineStart = source.lastIndexOf('\n', next) + 1;
  return source.slice(0, lineStart) + source.slice(nextLineStart);
}

let js = read(JS_FILE);

if (!js.includes(`const VERSION = '${RELEASE}';`)) {
  js = js.replace(/const VERSION = 'registry-unified-table-[^']+';/, `const VERSION = '${RELEASE}';`);
}
if (!js.includes(`const VERSION = '${RELEASE}';`)) throw new Error('registry unified release marker was not replaced.');

// Keep the canonical source order used by the main registry. This is only a
// fallback order: the same-table personal-view gate captures the real visible
// header before any handoff and preserves that exact contract.
js = js.replace(
  "    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',",
  "    'select', 'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use',",
);

if (!js.includes("const currentView = () => 'full';")) {
  js = replaceOnce(
    js,
    "  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';\n  const currentOrder = () => currentView() === 'full' ? FULL_ORDER : CLINICAL_ORDER;",
    "  const currentView = () => 'full';\n  const currentOrder = () => FULL_ORDER;",
    'single canonical registry view',
  );
}

js = js.replace("    if (currentView() === 'clinical') CLINICAL_BASE_KEYS.forEach(key => required.add(key));\n", '');
js = js.replace("    if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key)) return false;\n", '');

// Remove the dead alternate-view toolbar source by function boundaries rather
// than by its historical body. Earlier build phases are allowed to reformat or
// enrich that function, but none of them may preserve a second visible table
// controller in the final runtime.
js = removeFunctionBefore(js, 'buildToolbar', 'filtersOpen', 'remove alternate registry toolbar source');

if (js.includes('tableWrap.before(replacement)')) {
  js = replaceRegexOnce(
    js,
    /  function ensureShell\(\) \{[\s\S]*?\n  \}\n\n  function setView\(view\) \{[\s\S]*?\n  \}\n\n  function bindControls\(\) \{/,
    `  function ensureShell() {
    const tableWrap = document.getElementById('registryContent');
    const panel = document.querySelector('.toolbar.registry-toolbar, body > .toolbar, .registry-page-workspace > .toolbar');
    if (!tableWrap || !panel) {
      shellAttempts += 1;
      if (shellAttempts < 40) setTimeout(ensureShell, 120);
      return;
    }

    // One visible registry owner: keep the real search/filter toolbar and the
    // real #dataTable. The old clinical/full switch was a second UI laid over
    // the same registry and is intentionally removed.
    document.getElementById('registryViewToolbar')?.remove();
    panel.id = 'registryFilterPanel';
    panel.classList.add('registry-filter-panel-unified');
    if (panel.nextElementSibling !== tableWrap) tableWrap.before(panel);
    document.documentElement.dataset.registryUxView = 'full';
    document.documentElement.dataset.registryFiltersOpen = 'true';
  }

  function setView() {
    document.documentElement.dataset.registryUxView = 'full';
    document.documentElement.dataset.registryFiltersOpen = 'true';
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, 'full');
      localStorage.setItem(FILTER_STORAGE_KEY, 'true');
    } catch {}
    lastGeometry = '';
    schedule();
  }

  function bindControls() {`,
    'canonical table shell ownership',
  );
}

// Build composition may already have rewritten start(), so do not depend on one
// exact historical block. Freeze any surviving assignments instead.
js = js.replace(/document\.documentElement\.dataset\.registryUxView\s*=\s*storedView;/g, "document.documentElement.dataset.registryUxView = 'full';");
js = js.replace(/document\.documentElement\.dataset\.registryFiltersOpen\s*=\s*String\(storedFilters\);/g, "document.documentElement.dataset.registryFiltersOpen = 'true';");

if (js.includes('tableWrap.before(replacement)')) throw new Error('Legacy registry view toolbar can still be mounted.');
if (/function\s+buildToolbar\b/.test(js) || js.includes('Fokus klinik') || js.includes('Tabela e plotë')) {
  throw new Error('Legacy clinical/full toolbar source still exists in the canonical runtime.');
}
if (!js.includes("const currentView = () => 'full';")) throw new Error('Canonical full-table mode was not frozen.');
fs.writeFileSync(JS_FILE, js, 'utf8');

let css = read(CSS_FILE);
const canonicalCss = `/* ${RELEASE} — one visible registry table owner. */
html.medindex-tailadmin[data-mi-page="barnat"] body #registryViewToolbar.registry-view-toolbar-unified,
html.medindex-tailadmin[data-mi-page="barnat"] body #registryViewToolbar,
html.medindex-tailadmin[data-mi-page="barnat"] body .registry-view-toolbar-unified {
  display:none!important;
}`;
// This guard must be the LAST table-view rule in the stylesheet. The legacy
// stylesheet contains an equally specific `display:flex!important`; prepending
// this block made the old rule win the cascade even though the JS normally
// removed the toolbar. Keeping the canonical guard last also protects stale DOM
// restored from BFCache/service-worker transitions.
if (!css.trimEnd().endsWith(canonicalCss)) {
  css = `${css.trimEnd()}\n\n${canonicalCss}\n`;
}
fs.writeFileSync(CSS_FILE, css, 'utf8');

let html = read(HTML_FILE);
html = html.replace(/data-registry-ux-view="(?:clinical|full)"/, 'data-registry-ux-view="full"');
html = html.replace(/registry-unified-table\.js\?v=[^"&]+/g, `registry-unified-table.js?v=${RELEASE}`);
fs.writeFileSync(HTML_FILE, html, 'utf8');

console.log('Canonical registry owner restored: one main table, no clinical/full duplicate toolbar, coherent JS/CSS release, and the hide guard owns the final CSS cascade.');
