const assert = require('node:assert/strict');
const Search = require('../lib/icd-search-engine.js');

const nodes = [
  { code:'IX', level:'chapter', chapter:'IX', block:'', parentCode:'', englishTitle:'Diseases of the circulatory system', albanianDraft:'Sëmundjet e sistemit të qarkullimit', displayTitle:'Sëmundjet e sistemit të qarkullimit' },
  { code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX', englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive', displayTitle:'Sëmundjet hipertensive' },
  { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)', displayTitle:'Hipertensioni esencial (primar)' },
  { code:'XVIII', level:'chapter', chapter:'XVIII', block:'', parentCode:'', englishTitle:'Symptoms, signs and abnormal clinical and laboratory findings', albanianDraft:'Simptomat, shenjat dhe gjetjet jonormale klinike dhe laboratorike', displayTitle:'Simptomat, shenjat dhe gjetjet jonormale klinike dhe laboratorike' },
  { code:'R50-R69', level:'block', chapter:'XVIII', block:'R50-R69', parentCode:'XVIII', englishTitle:'General symptoms and signs', albanianDraft:'Simptoma dhe shenja të përgjithshme', displayTitle:'Simptoma dhe shenja të përgjithshme' },
  { code:'R51', level:'category', chapter:'XVIII', block:'R50-R69', parentCode:'R50-R69', englishTitle:'Headache', albanianDraft:'Dhimbje koke', displayTitle:'Dhimbje koke' },
  { code:'R07.4', level:'subcategory', chapter:'XVIII', block:'R00-R09', parentCode:'R07', englishTitle:'Chest pain, unspecified', albanianDraft:'Dhimbje gjoksi, e paspecifikuar', displayTitle:'Dhimbje gjoksi, e paspecifikuar' },
  { code:'I21', level:'category', chapter:'IX', block:'I20-I25', parentCode:'I20-I25', englishTitle:'Acute myocardial infarction', albanianDraft:'Infarkt akut i miokardit', displayTitle:'Infarkt akut i miokardit' },
];

const dataset = { nodes };

function codes(query) {
  return Search.suggestDataset(dataset, query, { limit:12 }).rows.map(node => node.code);
}

let result = Search.suggestDataset(dataset, 'I10', { limit:12 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.rows[0].searchMatch.type, 'code-exact');
assert.equal(result.rows[0].searchMatch.group, 'exact');
assert.ok(result.groups.some(group => group.id === 'broader'));
assert.ok(result.rows.some(node => node.code === 'I10-I15' && node.searchMatch.group === 'broader'));

result = Search.suggestDataset(dataset, 'tension i lartë', { limit:12 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.rows[0].searchMatch.type, 'synonym-sq');
assert.equal(result.interpretedAs, 'hypertension');

result = Search.suggestDataset(dataset, 'hipertensjon', { limit:12 });
assert.equal(result.rows[0].code, 'I10');
assert.equal(result.rows[0].searchMatch.type, 'fuzzy-sq');
assert.equal(result.rows[0].searchMatch.label, 'Gabim shkrimi i korrigjuar');

result = Search.suggestDataset(dataset, 'dhimbje koke', { limit:12 });
assert.equal(result.rows[0].code, 'R51');
assert.equal(result.rows[0].searchMatch.type, 'title-sq-exact');

result = Search.suggestDataset(dataset, 'hyperten*', { limit:12 });
assert.ok(result.rows.some(node => node.code === 'I10'));
assert.ok(result.rows.some(node => node.searchMatch.type === 'wildcard' || node.searchMatch.type === 'title-en-prefix'));

assert.deepEqual(codes('dhimbje gjoksi')[0], 'R07.4', 'Symptom search must prefer the symptom code.');
assert.ok(!codes('dhimbje gjoksi').includes('I21'), 'The search layer must not infer myocardial infarction from chest pain.');

assert.equal(Search.boundedDistance('hipertensjon', 'hipertension', 2), 1);
assert.equal(Search.normalize('Tension i Lartë'), 'tension i larte');
assert.ok(Search.aliasExpansions('djegie urine').some(item => item.targets.includes('dysuria')));
assert.match(Search.suggestDataset(dataset, 'I10').safetyNote, /nuk vendosin diagnozë/i);

console.log('Advanced Albanian ICD search, typo tolerance, hierarchy grouping and safety tests passed.');
