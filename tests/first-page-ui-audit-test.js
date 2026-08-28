const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const tableToolsCss = read('registry-table-tools.css');
function consolidatedSection(name) {
  const marker = `/* ===== consolidated from ${name} ===== */`;
  const start = tableToolsCss.indexOf(marker);
  assert.ok(start >= 0, `final registry CSS is missing consolidated section: ${name}`);
  const next = tableToolsCss.indexOf('/* ===== consolidated from ', start + marker.length);
  const canonical = tableToolsCss.indexOf('/* ===== canonical final layer:', start + marker.length);
  const candidates = [next, canonical].filter(value => value > start);
  const end = candidates.length ? Math.min(...candidates) : tableToolsCss.length;
  return tableToolsCss.slice(start, end);
}
const css = consolidatedSection('first-page-clinical.css');
const frozenCss = consolidatedSection('registry-frozen-columns.css');
const touchCss = consolidatedSection('registry-touch-targets.css');
const js = read('first-page-clinical.js');
const loader = read('first-page-style-loader.js');
const offlineManifest = read('scripts/patch-offline-shell-manifest.js');
const headerSource = read('app-parts/part-02.txt');
const rowSource = read('app-parts/part-03.txt') + read('app-parts/part-04.txt');

assert.doesNotMatch(html, /first-page-clinical\.css/, 'Retired first-page CSS must not be requested separately.');
assert.doesNotMatch(html, /registry-frozen-columns\.css/, 'Retired frozen-column CSS must not be requested separately.');
assert.match(html, /first-page-style-loader\.js\?v=single-css-v1/);
assert.match(html, /registry-table-tools\.css\?v=20260820-3/);
assert.match(html, /first-page-clinical\.js\?v=20260731-1/);
const staticStylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
const professionalCssIndex = staticStylesheets.findIndex(href => /tailadmin-professional\.css/.test(href));
assert.ok(professionalCssIndex >= 0, 'The shared professional TailAdmin stylesheet must be present.');
const postProfessionalStyles = staticStylesheets.slice(professionalCssIndex + 1);
assert.ok(
  postProfessionalStyles.every(href => /^registry-table-tools\.css(?:\?|$)/.test(href)),
  `Only the generated registry table-tools stylesheet may follow shared professional TailAdmin CSS; found ${postProfessionalStyles.join(', ')}`,
);
assert.ok(
  html.indexOf('form-picker-clinical.js') < html.indexOf('first-page-clinical.js'),
  'The first-page runtime must enhance the completed pharmaceutical form picker.'
);
assert.match(loader, /VERSION = 'first-page-style-loader-single-css-v1'/, 'First-page style owner must expose the single-CSS release.');
assert.match(loader, /registry-table-tools\\.css/, 'First-page loader must verify the final registry CSS authority.');
assert.doesNotMatch(loader, /createElement\\(['"]link/, 'First-page loader must not create another stylesheet.');
assert.doesNotMatch(loader, /first-page-clinical\\.css|registry-frozen-columns\\.css/, 'Retired stylesheet URLs must not return.');
assert.match(loader, /dataset\\.firstPageStyleLoader/, 'The active first-page style release must remain observable in browser audits.');
assert.match(loader, /medindex:tailadmin-ready/);
assert.doesNotMatch(offlineManifest, /registry-frozen-columns\.css/, 'Offline manifest must not resurrect frozen-column CSS.');
assert.match(offlineManifest, /registry-table-tools\.css/, 'Offline manifest must cache the final registry CSS authority.');

for (const marker of [
  'registry-overview',
  'registry-status-strip',
  'registry-toolbar-secondary',
  'registry-search-shell',
  'registry-table-bar',
  'registry-result-count',
  'registry-selection-control',
  'registry-sort-trigger',
  'has-horizontal-scroll',
  'html[data-theme=dark]',
  '@media(max-width:820px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)',
]) {
  assert.ok(css.includes(marker), `first-page clinical CSS is missing ${marker}`);
}

for (const marker of [
  'MedIndex registry frozen-column cascade',
  '[data-registry-column-key="number"]',
  '[data-column-key="Nr rendor"]',
  '[data-registry-column-key="prescription-label"]',
  '[data-column-key="Si të shënohet në recetë"]',
  '[data-registry-column-key="active-substance"]',
  '[data-column-key="Substanca aktive"]',
  '[data-registry-column-key="select"]',
  '[data-registry-column-key="trade-name"]',
  'left:var(--registry-frozen-prescription-left,68px)!important',
]) {
  assert.ok(frozenCss.includes(marker), `final frozen-column CSS is missing ${marker}`);
}
assert.match(
  frozenCss,
  /\[data-registry-column-key="select"\][\s\S]*\[data-registry-column-key="trade-name"\][\s\S]*\[data-registry-column-key="active-substance"\][\s\S]*position:relative!important;[\s\S]*left:auto!important;/,
  'Selection, trade-name and active-substance columns must be explicitly released from legacy pinning.',
);
assert.match(
  frozenCss,
  /\[data-registry-column-key="number"\][\s\S]*position:sticky!important;[\s\S]*left:0!important;/,
  'Nr must be the first frozen data column.',
);
assert.match(
  frozenCss,
  /\[data-registry-column-key="prescription-label"\][\s\S]*position:sticky!important;[\s\S]*left:var\(--registry-frozen-prescription-left,68px\)!important/,
  'Prescription notation must be the second frozen data column.',
);
assert.doesNotMatch(frozenCss, /data-registry-column-key="active-substance"[^}]*position:sticky/i, 'Substanca aktive must scroll normally in the final cascade.');

/* The final accessibility layer owns interactive target size and the compact
   mobile panel radius. Guard the source values so later cascade patches cannot
   silently re-introduce the 30px preview target or the off-scale 15px radius. */
assert.match(touchCss, /--mi-touch:44px/, 'Registry touch contract must remain 44px.');
assert.match(
  touchCss,
  /\.registry-cell-preview-trigger\s*\{[\s\S]*width:var\(--mi-touch\)!important;[\s\S]*min-width:var\(--mi-touch\)!important;[\s\S]*height:var\(--mi-touch\)!important;[\s\S]*min-height:var\(--mi-touch\)!important;/,
  'Cell preview must expose the full 44px touch target in the final cascade.',
);
assert.match(
  touchCss,
  /@media\s*\(max-width:760px\)[\s\S]*:is\(\.form-panel,\.col-panel\)\s*\{[\s\S]*border-radius:16px!important;/,
  'Mobile floating panels must stay on the 8/12/16 radius scale.',
);

for (const marker of [
  'medindex:first-page-audit-ready',
  'Kërko në regjistër',
  'Pastro filtrat',
  'setColumnSemantics',
  'syncPanelState',
  'aria-expanded',
  'Alt + S',
  'Regjistri i barnave me emër tregtar',
  'registryScrollHelp',
  'has-horizontal-scroll',
  'countBadge.dataset.total',
  'MutationObserver',
]) {
  assert.ok(js.includes(marker), `first-page clinical runtime is missing ${marker}`);
}

assert.match(tableToolsCss, /registry-legacy-toolbar-hidden-v2/, 'Retired toolbar controls need an explicit final visibility contract.');
for (const control of ['#statusFilter', '#pageSize', '.selection-badge', '#protocolsBtn']) {
  assert.ok(tableToolsCss.includes(control), `Retired toolbar control must stay hidden: ${control}`);
}

assert.doesNotMatch(js, /fetch\s*\(/, 'The visual audit layer must not fetch or replace registry data.');
assert.doesNotMatch(js, /\/api\//, 'The visual audit layer must remain frontend-only.');
assert.doesNotMatch(js, /innerHTML\s*=\s*[^;]*(?:RAW|DRUG_DATA_PARTS)/, 'The visual layer must not render a substitute dataset.');
assert.doesNotMatch(loader, /fetch\s*\(/, 'The stylesheet loader must not perform network data requests.');
assert.doesNotMatch(css, /nth-child\(2\)\{position:sticky/, 'Trade-name pinning must not depend on a dynamic column index.');
assert.doesNotMatch(frozenCss, /data-registry-column-key="trade-name"[^}]*position:sticky/i, 'Emri tregtar must never become a frozen column in the final cascade.');
assert.doesNotMatch(frozenCss, /data-registry-column-key="select"[^}]*position:sticky/i, 'Prescription selection must scroll normally in the final cascade.');
assert.doesNotMatch(css, /(?:linear|radial)-gradient|backdrop-filter:\s*blur/, 'The compact registry workspace must not use gradients or glass effects.');
assert.match(css, /\.registry-toolbar\{[\s\S]*position:sticky!important;[\s\S]*grid-template-columns:minmax\(300px,1fr\) auto!important;/, 'The working toolbar must stay compact and sticky on desktop.');
assert.match(css, /#dataTable thead th\{[\s\S]*background:#f9fafb!important;[\s\S]*text-transform:none!important;/, 'The table header must use a neutral sentence-case treatment.');
for (const pageSize of ['50', '100', '250', '500']) {
  assert.match(html, new RegExp(`<option value="${pageSize}">${pageSize} / faqe</option>`), `Registry must preserve the ${pageSize}-row page-size option.`);
}
assert.match(headerSource, /sortButton\.className = 'registry-sort-trigger'/, 'Sortable headers need native keyboard-operable buttons.');
assert.match(headerSource, /setAttribute\('aria-sort'/, 'The active sort direction must be exposed to assistive technology.');
assert.match(headerSource, /th\.dataset\.columnKey = col\.key/, 'Headers need stable column keys.');
assert.match(rowSource, /data-column-key="' \+ columnKey \+ '"/, 'Cells need stable column keys.');
assert.match(rowSource, /registry-selection-control/, 'Row selection needs a 44px hit target.');

console.log('First-page UI: retired toolbar controls hidden, final Nr + prescription-notation freeze, touch targets and mobile radius audit passed.');
