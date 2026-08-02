'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Favorites = require('../icd-favorites.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const browser = read('icd-favorites.js');
const styles = read('icd-favorites.css');
const workflow = read('.github/workflows/physician-browser-audit.yml');

assert.equal(Favorites.VERSION, 'icd-favorites-v1');
assert.equal(Favorites.STORAGE_KEY, 'medindex_icd_favorites_v1');
assert.equal(Favorites.MAX_ITEMS, 24);
assert.equal(Favorites.MAX_AGE_MS, 365 * 24 * 60 * 60 * 1000);
assert.equal(Favorites.normalizeCode(' a00.1 '), 'A00.1');

const now = Date.UTC(2026, 7, 2, 12, 0, 0);
const category = Favorites.normalizeItem({
  code:'I10', level:'category', albanianDraft:'Hipertensioni esencial', englishTitle:'Essential hypertension',
  translationStatus:'standardized', savedAt:now,
}, now);
assert.equal(category.code, 'I10');
assert.equal(category.level, 'category');
assert.equal(category.displayTitle, 'Hipertensioni esencial');

const subcategory = Favorites.normalizeItem({ code:'A00.1', level:'subcategory', displayTitle:'Kolera nga Vibrio cholerae', savedAt:now }, now);
assert.equal(subcategory.code, 'A00.1');
assert.equal(Favorites.normalizeItem({ code:'I', level:'chapter' }, now), null);
assert.equal(Favorites.normalizeItem({ code:'A00-A09', level:'block' }, now), null);
assert.equal(Favorites.normalizeItem({ code:'not-a-code', level:'category' }, now), null);

const duplicatePayload = JSON.stringify({
  version:1,
  items:[
    { ...category, displayTitle:'Vjetër', savedAt:now - 5000 },
    { ...category, displayTitle:'Më i ri', savedAt:now - 1000 },
    subcategory,
  ],
});
const deduplicated = Favorites.parsePayload(duplicatePayload, now);
assert.equal(deduplicated.length, 2);
assert.equal(deduplicated.find(item => item.code === 'I10').displayTitle, 'Më i ri');

const expired = Favorites.parsePayload({
  items:[{ ...category, savedAt:now - Favorites.MAX_AGE_MS - 1 }],
}, now);
assert.deepEqual(expired, []);

const many = Array.from({ length:30 }, (_, index) => ({
  code:`A${String(index).padStart(2, '0')}`,
  level:'category',
  displayTitle:`Kodi ${index}`,
  savedAt:now - index,
}));
const bounded = Favorites.parsePayload(many, now);
assert.equal(bounded.length, 24);
assert.equal(bounded[0].code, 'A00');
assert.equal(bounded.at(-1).code, 'A23');

let toggled = Favorites.toggleItem([], category, now);
assert.equal(toggled.added, true);
assert.equal(toggled.removed, false);
assert.equal(toggled.items.length, 1);
assert.equal(Favorites.contains(toggled.items, 'i10'), true);
toggled = Favorites.toggleItem(toggled.items, category, now + 1);
assert.equal(toggled.added, false);
assert.equal(toggled.removed, true);
assert.equal(toggled.items.length, 0);

const serialized = Favorites.serializePayload([{ ...category, patientName:'Test', diagnosisText:'Sensitive' }], now);
assert.doesNotMatch(serialized, /patientName|diagnosisText|Sensitive/);
assert.match(serialized, /"code":"I10"/);

for (const marker of [
  'icd-favorites.css?v=icd-favorites-v1',
  'id="icdFavoritesToggle"',
  'id="icdFavoritesPanel"',
  'id="icdFavoritesList"',
  'id="icdFavoritesStatus"',
  'icd-favorites.js?v=icd-favorites-v1',
]) assert.ok(html.includes(marker), `ICD favorites UI missing ${marker}`);
assert.ok(
  html.indexOf('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1') < html.indexOf('icd-favorites.js?v=icd-favorites-v1'),
  'Favorites must enhance the already-created ICD detail and prescription workflow.',
);

for (const marker of [
  'MAX_ITEMS = 24', 'MAX_AGE_MS', 'VALID_LEVELS', 'CODE_PATTERN',
  'localStorage', 'medindex:icd-favorites-changed', 'medindex:icd-open-detail',
  'Vetëm kategoritë dhe nënkategoritë mund të ruhen',
]) assert.ok(browser.includes(marker), `Favorites runtime missing ${marker}`);
for (const marker of [
  '.icd-favorites-panel', '.icd-favorite-item', '.icd-favorite-action',
  '@media(max-width:620px)', 'html[data-theme="dark"]', '@media(forced-colors:active)',
]) assert.ok(styles.includes(marker), `Favorites styling missing ${marker}`);
assert.doesNotMatch(browser, /patient(Name|Id)|diagnosisText|prescriptionDraft/i);
assert.doesNotMatch(browser, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(styles, /https?:\/\//);
assert.ok(workflow.includes('tests/icd-favorites-browser.spec.js'), 'Physician browser audit must run the ICD favorites workflow.');

console.log('Bounded, diagnosis-safe ICD favorites and quick-access contracts passed.');
