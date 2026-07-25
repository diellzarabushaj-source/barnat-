const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('first-page-clinical.css');
const js = read('first-page-clinical.js');

assert.match(html, /first-page-clinical\.css\?v=20260725-1/);
assert.match(html, /first-page-clinical\.js\?v=20260725-1/);
assert.ok(
  html.indexOf('tailadmin-professional.css') < html.indexOf('first-page-clinical.css'),
  'The audited page layer must load after the shared professional shell.'
);
assert.ok(
  html.indexOf('form-picker-clinical.js') < html.indexOf('first-page-clinical.js'),
  'The first-page runtime must enhance the completed pharmaceutical form picker.'
);

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

console.log('First-page doctor-style UI audit passed.');
