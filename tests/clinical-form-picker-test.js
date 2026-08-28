const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('registry-v2.css');
const js = read('registry-v2.js');

assert.match(html, /data-drx-app="registry-v2"/);
assert.match(html, /id="formPickerButton"/);
assert.match(html, /id="formPickerPanel"/);
assert.match(html, /id="formPickerSearch"/);
assert.match(html, /id="formPickerList"/);
assert.doesNotMatch(html, /form-picker-clinical\.(?:css|js)/);
assert.doesNotThrow(() => new Function(js));

for (const category of [
  'TABLETA & PILULA', 'KAPSULA', 'SHURUPE & SOLUCIONE ORALE',
  'AMPULA, INJEKSIONE & INFUZIONE', 'KREMRA, XHEL & POMADA',
  'PIKA PËR SY, VESHË & HUNDË', 'SPREJ & INHALIM', 'PLUHUR & GRANULA',
  'SUPOZITORË & FORMA VAGINALE', 'FORMA TË TJERA SPECIALE'
]) assert.ok(js.includes(category), `Missing category ${category}`);

for (const abbreviation of ['Tab.', 'Caps.', 'Sir. / Sol.', 'Amp. / Inf.', 'Krem. / Ung.', 'Gtt.', 'Spray / Inh.', 'Pulv. / Gran.', 'Supp.']) {
  assert.ok(js.includes(abbreviation), `Missing prescription abbreviation ${abbreviation}`);
}

for (const expected of [
  "source:'Tableta & pilula'", "forms:['Chewable tablet'", "source:'Kapsula'",
  "source:'Pika (sy, veshë, hundë)'", "source:'Sprej & Inhalim'"
]) assert.ok(js.includes(expected), `Missing picker taxonomy contract: ${expected}`);

assert.match(js, /FORM_ALIASES/);
assert.match(js, /ArrowDown/);
assert.match(js, /Escape/);
assert.match(js, /aria-selected/);
assert.match(js, /formExact/);
assert.match(js, /formCategory/);

for (const selector of [
  '.form-picker-panel', '.form-picker-search', '.form-picker-all',
  '.form-category-icon', '.form-category-copy', '.form-category-count',
  '.form-option-label', '.form-option-short'
]) assert.ok(css.includes(selector), `Missing Registry V2 picker style ${selector}`);

assert.match(css, /border-left:4px solid var\(--form-accent\)/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
assert.doesNotMatch(css, /!important/);
assert.doesNotMatch(css, /https?:\/\//);

console.log('Registry V2 grouped pharmaceutical-form picker audit passed.');
