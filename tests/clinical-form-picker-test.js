const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('form-picker-clinical.css');
const js = read('form-picker-clinical.js');

assert.match(html, /form-picker-clinical\.css\?v=20260725-1/);
assert.match(html, /form-picker-clinical\.js\?v=20260725-1/);
assert.ok(html.indexOf('ui-enhancements.js?v=20260724-1') < html.indexOf('form-picker-clinical.js?v=20260725-1'));
new Function(js);

for (const category of [
  'TABLETA & PILULA', 'KAPSULA', 'SHURUPE & SOLUCIONE ORALE',
  'AMPULA, INJEKSIONE & INFUZIONE', 'KREMRA, XHEL & POMADA',
  'PIKA PËR SY, VESHË & HUNDË', 'SPREJ & INHALIM', 'PLUHUR & GRANULA',
  'SUPOZITORË & FORMA VAGINALE', 'FORMA TË TJERA SPECIALE'
]) assert.ok(js.includes(category), `Missing category ${category}`);

for (const abbreviation of ['Tab.', 'Caps.', 'Sir. / Sol.', 'Amp. / Inf.', 'Krem. / Ung.', 'Gtt.', 'Spray / Inh.', 'Pulv. / Gran.', 'Supp.']) {
  assert.ok(js.includes(abbreviation), `Missing prescription abbreviation ${abbreviation}`);
}

assert.equal((js.match(/color:'#[0-9a-f]{6}'/gi) || []).length, 10, 'All ten categories must preserve an explicit colour');
assert.match(js, /MutationObserver/);
assert.match(js, /ArrowDown/);
assert.match(js, /Escape/);
assert.match(js, /aria-expanded/);
assert.doesNotMatch(js, /fetch\(|\/api\//, 'Visual form picker must not touch the backend');

for (const selector of [
  '.form-category-icon', '.form-category-copy', '.form-category-count',
  '.form-option-label', '.form-option-short', '.form-item-sub.is-group-end'
]) assert.ok(css.includes(selector), `Missing clinical picker style ${selector}`);

assert.match(css, /border-left:4px solid var\(--form-accent\)/);
assert.match(css, /@media\(max-width:720px\)/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(css, /@media\(forced-colors:active\)/);
assert.doesNotMatch(css, /https?:\/\//, 'The form picker must not load external assets');

console.log('Clinical pharmaceutical-form picker audit passed.');
