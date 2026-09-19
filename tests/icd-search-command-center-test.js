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
assert.match(html, /data-search-example="hypertensio"/);
assert.match(html, /Kërko ICD, diagnozë, Latin, English/);

assert.match(css, /\.icd-search-stage\{/);
assert.match(css, /\.icd-suggestions\{/);
assert.match(css, /\.icd-suggestion-row\.is-active/);
assert.match(css, /\.icd-suggestion-copy \.icd-suggestion-translation/);
assert.match(css, /@media\(max-width:760px\)/);

assert.match(js, /const suggestionCache = new Map\(\)/);
assert.match(js, /SUGGESTION_CACHE_LIMIT = 80/);
assert.match(js, /setTimeout\(\(\) => void runSearch\(value\), 35\)/);
assert.match(js, /aria-activedescendant/);
assert.match(js, /event\.key === 'ArrowDown'/);
assert.match(js, /event\.key === 'Enter'/);
assert.match(js, /cacheMode = 'no-store'/);
assert.match(js, /controller\.signal, 'default'/);
assert.match(js, /function suggestionTranslations\(node\)/);
assert.match(js, /lang:'EN'/);
assert.match(js, /lang:'LA'/);
assert.match(js, /icd-suggestion-translation/);

assert.match(handler, /clinical-ranking-v4/);
assert.match(handler, /trigram-candidate-index/);
assert.match(handler, /MAX_PAYLOAD_CACHE = 240/);

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

console.log('ICD command-center UI, EN+LA autocomplete, indexed multilingual search and typo correction passed.');
