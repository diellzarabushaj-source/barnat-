const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('first-page-clinical.css');
const js = read('first-page-clinical.js');
const loader = read('first-page-style-loader.js');

assert.match(html, /rel="preload" href="first-page-clinical\.css\?v=20260725-1" as="style"/);
assert.match(html, /first-page-style-loader\.js\?v=20260725-1/);
assert.match(html, /first-page-clinical\.js\?v=20260725-1/);
const staticStylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
assert.match(staticStylesheets.at(-1), /tailadmin-professional\.css/, 'The shared professional TailAdmin CSS must remain the final static stylesheet.');
assert.ok(
  html.indexOf('form-picker-clinical.js') < html.indexOf('first-page-clinical.js'),
  'The first-page runtime must enhance the completed pharmaceutical form picker.'
);
assert.match(loader, /document\.head\.appendChild\(link\)/);
assert.match(loader, /first-page-clinical\.css\?v=20260725-1/);
assert.match(loader, /medindex:tailadmin-ready/);

for (const marker of [
  'registry-overview',
  'registry-toolbar-secondary',
  'registry-search-shell',
  'registry-table-bar',
  'registry-result-count',
  'Pin the identifying columns',
  'html[data-theme=dark]',
  '@media(max-width:720px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)',
]) {
  assert.ok(css.includes(marker), `first-page clinical CSS is missing ${marker}`);
}

for (const marker of [
  'medindex:first-page-audit-ready',
  'Kërko në regjistër',
  'Pastro filtrat',
  'setColumnSemantics',
  'syncPanelState',
  'aria-expanded',
  'Alt + S',
  'Regjistri i barnave me emër tregtar',
  'MutationObserver',
]) {
  assert.ok(js.includes(marker), `first-page clinical runtime is missing ${marker}`);
}

assert.doesNotMatch(js, /fetch\s*\(/, 'The visual audit layer must not fetch or replace registry data.');
assert.doesNotMatch(js, /\/api\//, 'The visual audit layer must remain frontend-only.');
assert.doesNotMatch(js, /innerHTML\s*=\s*[^;]*(?:RAW|DRUG_DATA_PARTS)/, 'The visual layer must not render a substitute dataset.');
assert.doesNotMatch(loader, /fetch\s*\(/, 'The stylesheet loader must not perform network data requests.');

console.log('First-page doctor-style UI audit passed.');
