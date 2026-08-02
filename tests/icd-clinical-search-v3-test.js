'use strict';

const assert = require('node:assert/strict');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Search = require('../lib/icd-search-engine-v3.js');
const Handler = require('../lib/icd-advanced-handler.js');

const nodes = [
  { code:'I', level:'chapter', chapter:'I', block:'', parentCode:'', englishTitle:'Certain infectious and parasitic diseases', albanianDraft:'Sëmundje të caktuara infektive dhe parazitare', displayTitle:'Sëmundje të caktuara infektive dhe parazitare', sourceRow:1 },
  { code:'A00-A09', level:'block', chapter:'I', block:'A00-A09', parentCode:'I', englishTitle:'Intestinal infectious diseases', albanianDraft:'Sëmundjet infektive të zorrëve', displayTitle:'Sëmundjet infektive të zorrëve', sourceRow:2 },
  { code:'A00', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Cholera', albanianDraft:'Kolera', displayTitle:'Kolera', sourceRow:3 },
  { code:'A00.1', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00', englishTitle:'Cholera due to Vibrio cholerae 01, biovar eltor', albanianDraft:'Kolera nga Vibrio cholerae 01, biovar eltor', displayTitle:'Kolera nga Vibrio cholerae 01, biovar eltor', sourceRow:4 },
  { code:'IX', level:'chapter', chapter:'IX', block:'', parentCode:'', englishTitle:'Diseases of the circulatory system', albanianDraft:'Sëmundjet e sistemit të qarkullimit', displayTitle:'Sëmundjet e sistemit të qarkullimit', sourceRow:5 },
  { code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX', englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive', displayTitle:'Sëmundjet hipertensive', sourceRow:6 },
  { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)', displayTitle:'Hipertensioni esencial (primar)', terminologyAliases:['tensioni i lartë', 'shtypja e lartë e gjakut'], sourceRow:7 },
  { code:'XVIII', level:'chapter', chapter:'XVIII', block:'', parentCode:'', englishTitle:'Symptoms, signs and abnormal findings', albanianDraft:'Simptomat, shenjat dhe gjetjet jonormale', displayTitle:'Simptomat, shenjat dhe gjetjet jonormale', sourceRow:8 },
  { code:'R00-R09', level:'block', chapter:'XVIII', block:'R00-R09', parentCode:'XVIII', englishTitle:'Symptoms involving the circulatory and respiratory systems', albanianDraft:'Simptoma të sistemit qarkullues dhe respirator', displayTitle:'Simptoma të sistemit qarkullues dhe respirator', sourceRow:9 },
  { code:'R07', level:'category', chapter:'XVIII', block:'R00-R09', parentCode:'R00-R09', englishTitle:'Pain in throat and chest', albanianDraft:'Dhimbje në fyt dhe gjoks', displayTitle:'Dhimbje në fyt dhe gjoks', sourceRow:10 },
  { code:'R07.4', level:'subcategory', chapter:'XVIII', block:'R00-R09', parentCode:'R07', englishTitle:'Chest pain, unspecified', albanianDraft:'Dhimbje gjoksi, e paspecifikuar', displayTitle:'Dhimbje gjoksi, e paspecifikuar', sourceRow:11 },
  { code:'I21', level:'category', chapter:'IX', block:'I20-I25', parentCode:'I20-I25', englishTitle:'Acute myocardial infarction', albanianDraft:'Infarkt akut i miokardit', displayTitle:'Infarkt akut i miokardit', sourceRow:12 },
];
const dataset = {
  version:'ICD-10-WHO 2019',
  sourceSpreadsheetId:'test',
  counts:{ chapter:3, block:3, category:4, subcategory:2, total:nodes.length },
  quality:{ publicationReady:false },
  nodes,
};
FullIcd.attachIndexes(dataset);

assert.deepEqual(Search.canonicalCodeQuery('A001'), {
  raw:'A001', canonical:'A00.1', key:'A001', codeLike:true, normalized:true,
});
assert.equal(Search.canonicalCodeQuery('a00 1').canonical, 'A00.1');
assert.equal(Search.canonicalCodeQuery('I10I15').canonical, 'I10-I15');
assert.equal(Search.canonicalCodeQuery('I10-I15').normalized, false);
assert.equal(Search.canonicalCodeQuery('hipertension').codeLike, false);

let result = Search.suggestDataset(dataset, 'A001', { limit:12 });
assert.equal(result.rows[0].code, 'A00.1');
assert.equal(result.rows[0].searchMatch.type, 'code-normalized');
assert.equal(result.rows[0].searchMatch.label, 'Kodi i normalizuar');
assert.equal(result.interpretedAs, 'A00.1');
assert.equal(result.interpretationType, 'code-normalized');
assert.equal(result.normalizedCode, 'A00.1');
assert.ok(result.rows.some(node => node.code === 'A00' && node.searchMatch.group === 'broader'));

result = Search.suggestDataset(dataset, 'A00.1', { limit:12 });
assert.equal(result.rows[0].code, 'A00.1');
assert.equal(result.rows[0].searchMatch.type, 'code-exact');
assert.equal(result.interpretedAs, '');

result = Search.suggestDataset(dataset, 'I10I15', { limit:12 });
assert.equal(result.rows[0].code, 'I10-I15');
assert.equal(result.rows[0].searchMatch.type, 'code-normalized');
assert.equal(result.interpretedAs, 'I10-I15');

result = Search.suggestDataset(dataset, 'tensioni i lartë', { limit:12 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.rows[0].searchMatch.type, 'editorial-alias-exact');
assert.equal(result.rows[0].searchMatch.label, 'Term klinik i saktë');

const chestCodes = Search.suggestDataset(dataset, 'dhimbje gjoksi', { limit:12 }).rows.map(node => node.code);
assert.equal(chestCodes[0], 'R07.4');
assert.ok(!chestCodes.includes('I21'), 'Symptom search must not infer myocardial infarction.');

const compact = Handler._test.compactNode(nodes[3], dataset);
assert.deepEqual(compact.breadcrumb.map(item => item.code), ['I', 'A00-A09', 'A00']);
assert.equal(compact.breadcrumb[1].title, 'Sëmundjet infektive të zorrëve');

const cacheOwner = {};
let builds = 0;
const first = Handler._test.cachedPayload(cacheOwner, 'suggest|a001', () => ({ id:++builds }));
const second = Handler._test.cachedPayload(cacheOwner, 'suggest|a001', () => ({ id:++builds }));
assert.equal(first, second);
assert.equal(builds, 1);
for (let index = 0; index < 140; index += 1) {
  Handler._test.cachedPayload(cacheOwner, `q-${index}`, () => ({ index }));
}
assert.ok(Handler._test.payloadCache(cacheOwner).size <= 120);

const suggestion = Handler._test.suggestionPayload(dataset, { q:'A00 1' }, {
  sourceRevision:'test-revision', stale:false, loadedAt:Date.now(), csvBytes:100, fetchMs:1, buildMs:1,
});
assert.equal(suggestion.rows[0].code, 'A00.1');
assert.equal(suggestion.meta.search.engine, 'clinical-ranking-v3');
assert.ok(suggestion.meta.search.supports.includes('normalized-code'));
assert.ok(suggestion.meta.search.supports.includes('breadcrumbs'));

console.log('Normalized ICD codes, editorial aliases, breadcrumbs and bounded search cache passed.');
