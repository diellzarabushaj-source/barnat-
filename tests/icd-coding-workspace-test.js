'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const api = require('../icd-coding-workspace.js');

const html = read('icd.html');
const js = read('icd-coding-workspace.js');
const css = read('icd-coding-workspace.css');

assert.equal(api.normalizeCode('i'), 'I');
assert.equal(api.normalizeCode('xxii'), 'XXII');
assert.equal(api.normalizeCode('a00-a09'), 'A00-A09');
assert.equal(api.normalizeCode('a00'), 'A00');
assert.equal(api.normalizeCode('a00.1'), 'A00.1');
assert.equal(api.normalizeCode('A0'), '');
assert.equal(api.normalizeCode('<script>'), '');

const chapter = {
  code:'I', level:'chapter', displayTitle:'Sëmundje infektive dhe parazitare',
  englishTitle:'Certain infectious and parasitic diseases', childCount:20,
  translationStatus:'standardized',
};
const block = {
  code:'A00-A09', level:'block', displayTitle:'Sëmundjet infektive të zorrëve',
  englishTitle:'Intestinal infectious diseases', parentCode:'I', childCount:10,
  translationStatus:'standardized',
};
const category = {
  code:'A00', level:'category', albanianDraft:'Kolera', englishTitle:'Cholera',
  parentCode:'A00-A09', childCount:3, translationStatus:'verified',
};
const subcategory = {
  code:'A00.1', level:'subcategory', albanianDraft:'Kolera nga Vibrio cholerae 01, biovar eltor',
  englishTitle:'Cholera due to Vibrio cholerae 01, biovar eltor', parentCode:'A00',
  childCount:0, translationStatus:'machine-draft',
};

assert.equal(api.canCode(chapter), false);
assert.equal(api.canCode(block), false);
assert.equal(api.canCode(category), true);
assert.equal(api.canCode(subcategory), true);
assert.equal(api.diagnosisContext(chapter), null);
assert.equal(api.diagnosisContext(block), null);

assert.deepEqual(api.specificityInfo(chapter), {
  tone:'navigation',
  label:'Nivel navigues',
  note:'Zgjidh një kategori ose nënkategori për kodim diagnostik.',
});
assert.equal(api.specificityInfo(category).tone, 'review');
assert.match(api.specificityInfo(category).label, /3 nënkode/);
assert.equal(api.specificityInfo(subcategory).tone, 'specific');

const context = api.diagnosisContext(subcategory, 1700000000000);
assert.equal(context.code, 'A00.1');
assert.equal(context.level, 'subcategory');
assert.equal(context.selectedAt, 1700000000000);
assert.equal(context.source, 'medindex-icd-browser');
assert.equal(context.childCount, 0);

const resolved = api.normalizeResolved({
  ancestors:[chapter, block, category, category],
  node:subcategory,
});
assert.deepEqual(resolved.ancestors.map(item => item.code), ['I', 'A00-A09', 'A00']);
assert.equal(resolved.node.code, 'A00.1');

const copied = api.copyText(resolved);
for (const marker of [
  'ICD-10-WHO 2019',
  'Kodi: A00.1',
  'Niveli: Nënkategori',
  'Shqip:',
  'English:',
  'Statusi i termit: Draft automatik',
  'Hierarkia: I › A00-A09 › A00 › A00.1',
]) assert.ok(copied.includes(marker), `Copy output missing ${marker}`);
for (const forbidden of ['selectedAt', 'translationStatus', 'source:', 'sessionStorage', 'medindex_rx_']) {
  assert.ok(!copied.includes(forbidden), `Copy output leaked ${forbidden}`);
}

for (const marker of [
  'icd-coding-workspace.css?v=icd-coding-workspace-v1',
  'icd-coding-workspace.js?v=icd-coding-workspace-v1',
]) assert.ok(html.includes(marker), `icd.html missing ${marker}`);
assert.ok(html.indexOf('icd-coding-workspace.js') < html.indexOf('app-stability.js'));

for (const marker of [
  'Workspace klinik i kodimit',
  'data-mi-icd-workspace-primary',
  'data-mi-icd-workspace-secondary',
  'data-mi-icd-workspace-children',
  'medindex:icd-state',
  'medindex:icd-coding-workspace-ready',
  'DIAGNOSIS_CODE_PATTERN',
  'NAVIGATION_CODE_PATTERN',
]) assert.ok(js.includes(marker), `Workspace runtime missing ${marker}`);

for (const marker of [
  '.icd-coding-workspace',
  '.icd-coding-workspace-grid',
  '@media (max-width:520px)',
  '@media (forced-colors:active)',
  'prefers-reduced-motion',
]) assert.ok(css.includes(marker), `Workspace CSS missing ${marker}`);

assert.doesNotMatch(js, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(css, /https?:\/\//);
new Function(js);
console.log('ICD professional coding workspace contract passed.');
