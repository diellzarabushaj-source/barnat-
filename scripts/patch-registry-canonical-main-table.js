'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const JS_FILE = path.join(ROOT, 'registry-unified-table.js');
const CSS_FILE = path.join(ROOT, 'registry-unified-table.css');
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

let js = read(JS_FILE);

js = replaceOnce(
  js,
  "const VERSION = 'registry-unified-table-20260801-1';",
  `const VERSION = '${RELEASE}';`,
  'registry unified release marker',
);

// The user-facing registry has one canonical table. The previous controller
// defaulted to a second “clinical focus” projection and could therefore make the
// same page look like a different registry after reload/account restore.
js = replaceOnce(
  js,
  "    'select', 'number', 'trade-name', 'active-substance', 'atc', 'drug-class', 'use',",
  "    'select', 'number', 'active-substance', 'trade-name', 'atc', 'drug-class', 'use',",
  'canonical Nr → active substance → trade name order',
);

js = replaceOnce(
  js,
  "  const currentView = () => document.documentElement.dataset.registryUxView === 'full' ? 'full' : 'clinical';\n  const currentOrder = () => currentView() === 'full' ? FULL_ORDER : CLINICAL_ORDER;",
  "  const currentView = () => 'full';\n  const currentOrder = () => FULL_ORDER;",
  'single canonical registry view',
);

js = replaceOnce(
  js,
  "    if (currentView() === 'clinical') CLINICAL_BASE_KEYS.forEach(key => required.add(key));\n",
  "",
  'remove clinical-only synthetic columns',
);

js = replaceOnce(
  js,
  "    if (currentView() === 'clinical' && !CLINICAL_ORDER.includes(key)) return false;\n",
  "",
  'remove clinical projection visibility filter',
);

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

    // Never mount a second table/view switch above the real registry. The
    // existing registry toolbar + #dataTable remain the only visible owner.
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

js = replaceRegexOnce(
  js,
  /  function start\(\) \{\n    let storedView = 'clinical';\n    let storedFilters = false;\n    try \{\n      storedView = localStorage\.getItem\(VIEW_STORAGE_KEY\) === 'full' \? 'full' : 'clinical';\n      storedFilters = localStorage\.getItem\(FILTER_STORAGE_KEY\) === 'true';\n    \} catch \{\}\n    document\.documentElement\.dataset\.registryUxView = storedView;\n    document\.documentElement\.dataset\.registryFiltersOpen = String\(storedFilters\);/,
  `  function start() {
    document.documentElement.dataset.registryUxView = 'full';
    document.documentElement.dataset.registryFiltersOpen = 'true';
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, 'full');
      localStorage.setItem(FILTER_STORAGE_KEY, 'true');
    } catch {}`,
  'canonical startup mode',
);

// The old toolbar can still exist in source for backwards API compatibility, but
// it must never be mounted or become visible. Its first-number parsing was also
// the exact reason “1 barna” appeared when the real count was a range such as
// 1–50 from the canonical pager.
if (js.includes('tableWrap.before(replacement)')) {
  throw new Error('Legacy registry view toolbar can still be mounted.');
}
if (!js.includes("const currentView = () => 'full';")) {
  throw new Error('Canonical full-table mode was not frozen.');
}
fs.writeFileSync(JS_FILE, js, 'utf8');

let css = read(CSS_FILE);
const canonicalCss = `/* ${RELEASE} — one visible registry table owner. */
html.medindex-tailadmin[data-mi-page="barnat"] body #registryViewToolbar,
html.medindex-tailadmin[data-mi-page="barnat"] body .registry-view-toolbar-unified {
  display:none!important;
}
`;
if (!css.includes(RELEASE)) css = canonicalCss + '\n' + css;
fs.writeFileSync(CSS_FILE, css, 'utf8');

let html = read(HTML_FILE);
html = html.replace('data-registry-ux-view="clinical"', 'data-registry-ux-view="full"');
html = html.replace(/registry-unified-table\.css\?v=[^"&]+/g, `registry-unified-table.css?v=${RELEASE}`);
html = html.replace(/registry-unified-table\.js\?v=[^"&]+/g, `registry-unified-table.js?v=${RELEASE}`);
fs.writeFileSync(HTML_FILE, html, 'utf8');

console.log('Canonical registry owner restored: one main table, full canonical columns, no clinical/full duplicate view, coherent JS/CSS release.');
