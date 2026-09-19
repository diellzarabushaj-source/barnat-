'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Search = require('../lib/icd-search-engine-v3.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'icd.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'icd-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'icd-v2.js'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'lib/icd-advanced-handler.js'), 'utf8');

assert.match(html, /id="icdSearchBox"[^>]*role="combobox"/);
assert.match(html, /id="icdSuggestions"[^>]*role="listbox"/);
assert.match(html, /aria-autocomplete="list"/);
assert.match(html, /Kërko ICD, diagnozë, Latin, English/);
assert.match(html, /id="icdSearchClear"/);
assert.match(html, /Mjekësi familjare/);
assert.match(html, /Urgjenca QKMF/);
const quickButtons = [...html.matchAll(/<button type="button" class="icd-quick-chip([^"]*)" data-search-example="([^"]+)"/g)];
assert.equal(quickButtons.length, 50, 'QKMF quick rails must contain exactly 50 shortcuts.');
assert.equal(quickButtons.filter(match => match[1].includes('is-urgent')).length, 25, 'Urgency rail must contain exactly 25 red shortcuts.');
assert.equal(new Set(quickButtons.map(match => match[2])).size, 50, 'QKMF shortcut ICD codes must be unique.');

assert.match(css, /\.icd-search-stage\{/);
assert.match(css, /\.icd-suggestions\{/);
assert.match(css, /\.icd-suggestion-row\.is-active/);
assert.match(css, /\.icd-suggestion-copy \.icd-suggestion-translation/);
assert.match(css, /\.icd-search-clear\{/);
assert.match(css, /\.icd-quick-group\.is-urgent/);
assert.match(css, /\.icd-quick-chip\.is-urgent/);
assert.match(css, /\.icd-quick-scroll\{/);
assert.match(css, /@media\(max-width:760px\)/);

assert.match(js, /const suggestionCache = new Map\(\)/);
assert.match(js, /SUGGESTION_CACHE_LIMIT = 120/);
assert.match(js, /SEARCH_NETWORK_DELAY_MS = 25/);
assert.match(js, /aria-activedescendant/);
assert.match(js, /event\.key === 'ArrowDown'/);
assert.match(js, /event\.key === 'Enter'/);
assert.match(js, /cacheMode = 'no-store'/);
assert.match(js, /controller\.signal, 'default'/);
assert.match(js, /function suggestionTranslations\(node\)/);
assert.match(js, /lang:'EN'/);
assert.match(js, /lang:'LA'/);
assert.match(js, /icd-suggestion-translation/);
assert.match(js, /Kategoritë kryesore/);
assert.match(js, /Nënkategoritë/);
assert.match(js, /sv:'instant-v6'/);
assert.match(js, /params\.set\('advanced', '1'\)/);
assert.match(js, /function localCategoryPreview\(query, limit = 8\)/);
assert.match(js, /function warmSearchSeed\(\)/);
assert.match(js, /requestIdleCallback/);
assert.match(js, /function setActiveSuggestion\(index\)/);
assert.match(js, /event\.key === '\/'/);

assert.match(handler, /clinical-ranking-v6/);
assert.match(handler, /trigram-candidate-index/);
assert.match(handler, /category-first/);
assert.match(handler, /latin-parent-fallback/);
assert.match(handler, /MAX_PAYLOAD_CACHE = 240/);
assert.match(handler, /function seedPayload\(dataset, loaded = \{\}\)/);
assert.match(handler, /category-seed/);

const target = {
  code:'I10',
  level:'category',
  chapter:'IX',
  block:'I10-I15',
  parentCode:'I10-I15',
  englishTitle:'Essential (primary) hypertension',
  albanianDraft:'Hipertensioni esencial primar',
  latinTitle:'Hypertensio arterialis essentialis primaria',
  displayTitle:'Hipertensioni esencial primar',
  terminologyAliases:['tensioni i lartë'],
  searchText:'i10 hipertensioni esencial primar essential primary hypertension hypertensio arterialis essentialis primaria tensioni i larte',
  sourceRow:1,
};
const noise = Array.from({ length:1800 }, (_, index) => ({
  code:`Q${String(index % 100).padStart(2, '0')}.${index}`,
  level:'subcategory',
  chapter:'XVII',
  block:'Q00-Q99',
  parentCode:'Q00',
  englishTitle:`Synthetic unrelated condition ${index}`,
  albanianDraft:`Gjendje sintetike e palidhur ${index}`,
  latinTitle:`Conditio synthetica ${index}`,
  displayTitle:`Gjendje sintetike e palidhur ${index}`,
  searchText:`synthetic unrelated condition gjendje sintetike conditio ${index}`,
  sourceRow:index + 2,
}));
const dataset = { nodes:[target, ...noise] };
FullIcd.attachIndexes(dataset);

const candidates = Search.indexedCandidateNodes(dataset, 'hipertensoin');
assert.ok(candidates.length < dataset.nodes.length / 4, `candidate set should be narrow, got ${candidates.length}`);
let result = Search.suggestDataset(dataset, 'hipertensoin', { limit:8 });
assert.equal(result.rows[0].code, 'I10');
assert.ok(result.rows[0].searchMatch.type.startsWith('fuzzy-'));

result = Search.suggestDataset(dataset, 'Hypertensio arterials esentialis', { limit:8 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.rows[0].searchMatch.field, 'la');

result = Search.suggestDataset(dataset, 'I1O', { limit:8 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.normalizedCode, 'I10');

assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('J81'), 'Oedema pulmonum');
assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('J68.1'), 'Oedema pulmonis chemicale, gasogenes, fumogenes et vaporogenes');
assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('S06.1'), 'Oedema cerebri traumaticum');
assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('O10-O16'), 'Oedema, proteinuria et hypertonia in graviditate, partu et puerperio');
assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('J10.1'), 'Influenza cum symptomatis respiratoriis aliis, virus influenzae aliud identificatum');
assert.equal(FullIcd.LATIN_TITLE_BY_CODE.get('J11.1'), 'Influenza cum symptomatis respiratoriis aliis, virus non identificatum');

const fluDataset = {
  nodes:[
    { code:'J10', level:'category', chapter:'X', block:'J09-J18', parentCode:'J09-J18', englishTitle:'Influenza due to other identified influenza virus', albanianDraft:'Gripi nga virus tjetër i identifikuar i gripit', latinTitle:'Influenza, virus influencae aliud identificatum', displayTitle:'Gripi nga virus tjetër i identifikuar i gripit', sourceRow:1 },
    { code:'J11', level:'category', chapter:'X', block:'J09-J18', parentCode:'J09-J18', englishTitle:'Influenza, virus not identified', albanianDraft:'Gripi, virusi i paidentifikuar', latinTitle:'Influenza, virus non identificatum', displayTitle:'Gripi, virusi i paidentifikuar', sourceRow:2 },
    { code:'J10.0', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J10', englishTitle:'Influenza with pneumonia, other influenza virus identified', albanianDraft:'Grip me pneumoni, virus tjetër i gripit i identifikuar', latinTitle:'Influenza cum pneumonia, virus influencae aliud identificatum', displayTitle:'Grip me pneumoni, virus tjetër i gripit i identifikuar', sourceRow:3 },
    { code:'J10.1', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J10', englishTitle:'Influenza with other respiratory manifestations, other influenza virus identified', albanianDraft:'Grip me manifestime të tjera respiratore', latinTitle:'Influenza cum symptomatis respiratoriis aliis, virus influenzae aliud identificatum', displayTitle:'Grip me manifestime të tjera respiratore', sourceRow:4 },
    { code:'J10.8', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J10', englishTitle:'Influenza with other manifestations, other influenza virus identified', albanianDraft:'Grip me manifestime të tjera', latinTitle:'Influenza cum symptomatis aliis, virus influenzae aliud identificatum', displayTitle:'Grip me manifestime të tjera', sourceRow:5 },
    { code:'J11.0', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J11', englishTitle:'Influenza with pneumonia, virus not identified', albanianDraft:'Grip me pneumoni, virus i paidentifikuar', latinTitle:'Influenza cum pneumonia, virus non identificatum', displayTitle:'Grip me pneumoni, virus i paidentifikuar', sourceRow:6 },
    { code:'J11.1', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J11', englishTitle:'Influenza with other respiratory manifestations, virus not identified', albanianDraft:'Grip me manifestime të tjera respiratore, virus i paidentifikuar', latinTitle:'Influenza cum symptomatis respiratoriis aliis, virus non identificatum', displayTitle:'Grip me manifestime të tjera respiratore, virus i paidentifikuar', sourceRow:7 },
    { code:'J11.8', level:'subcategory', chapter:'X', block:'J09-J18', parentCode:'J11', englishTitle:'Influenza with other manifestations, virus not identified', albanianDraft:'Grip me manifestime të tjera, virus i paidentifikuar', latinTitle:'Influenza cum symptomatis aliis, virus non identificatum', displayTitle:'Grip me manifestime të tjera, virus i paidentifikuar', sourceRow:8 },
  ],
};
FullIcd.attachIndexes(fluDataset);
const flu = Search.suggestDataset(fluDataset, 'gripi', { limit:10 });
const fluCodes = flu.rows.map(row => row.code);
assert.deepEqual(fluCodes.slice(0, 2), ['J10', 'J11'], 'Broad flu search must show the three-character categories first.');
const firstFluSubcategory = flu.rows.findIndex(row => row.level === 'subcategory');
assert.ok(firstFluSubcategory >= 2, 'Subcategories must follow the main categories.');
assert.ok(fluCodes.indexOf('J10.1') > fluCodes.indexOf('J11'), 'J10 subcodes must come after J10/J11 categories.');

const exactChild = Search.suggestDataset(fluDataset, 'J10.1', { limit:10 });
assert.equal(exactChild.rows[0].code, 'J10.1', 'Exact code intent must still win over category-first text ordering.');

const parentLatinDataset = {
  nodes:[
    { code:'Z99', level:'category', chapter:'XXI', block:'Z90-Z99', parentCode:'Z90-Z99', englishTitle:'Parent', albanianDraft:'Prindi', latinTitle:'Categoria Latina', displayTitle:'Prindi', sourceRow:1 },
    { code:'Z99.1', level:'subcategory', chapter:'XXI', block:'Z90-Z99', parentCode:'Z99', englishTitle:'Child', albanianDraft:'Fëmija', latinTitle:'', displayTitle:'Fëmija', sourceRow:2 },
  ],
};
FullIcd.attachIndexes(parentLatinDataset);
const parentLatinCompact = require('../lib/icd-advanced-handler.js')._test.compactNode(parentLatinDataset.nodes[1], parentLatinDataset);
assert.equal(parentLatinCompact.latinTitle, '');
assert.equal(parentLatinCompact.latinParentCode, 'Z99');
assert.equal(parentLatinCompact.latinParentTitle, 'Categoria Latina');

console.log('ICD hierarchy-first UI, EN+LA autocomplete, indexed multilingual search and typo correction passed.');
