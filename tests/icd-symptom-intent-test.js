'use strict';

const assert = require('node:assert/strict');
const SymptomIntent = require('../lib/icd-symptom-intent.js');
const Handler = require('../lib/icd-advanced-handler.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

function intent(query, expectedId) {
  const result = SymptomIntent.intentPayload(query);
  assert.ok(result, `Expected symptom intent for: ${query}`);
  assert.equal(result.id, expectedId, `Unexpected symptom intent for: ${query}`);
  assert.equal(result.diagnosticDecision, false);
  assert.equal(result.probability, false);
  return result;
}

let result = intent('dairre', 'diarrhea');
assert.ok(result.match_type.startsWith('fuzzy-') || result.match_type === 'exact');
assert.equal(result.symptom_code, 'R19.7');
assert.equal(result.candidates[0].code, 'A09');

result = intent('vjelje', 'nausea-vomiting');
assert.equal(result.symptom_code, 'R11');

result = intent('kokdhimbje', 'headache');
assert.equal(result.symptom_code, 'R51');

result = intent('probleme me unaza', 'back-pain');
assert.equal(result.symptom_code, 'M54');
assert.ok(result.candidates.some(item => item.code === 'M47'));
assert.ok(result.candidates.some(item => item.code === 'M51'));

result = intent('veshtirsi ne frymemarrje', 'dyspnea');
assert.equal(result.symptom_code, 'R06.0');
assert.ok(result.candidates.some(item => item.code === 'I26' && item.urgent));

assert.equal(SymptomIntent.intentPayload('I10'), null, 'ICD code input must not be treated as symptom intent.');
assert.equal(SymptomIntent.intentPayload('a'), null, 'Very short input must not activate symptom intent.');

const dataset = {
  nodes:[
    { code:'A09', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Other gastroenteritis and colitis of infectious and unspecified origin', albanianDraft:'Gastroenterit dhe kolit me origjinë infektive ose të paspecifikuar', latinTitle:'', displayTitle:'Gastroenterit dhe kolit', sourceRow:1 },
    { code:'K52', level:'category', chapter:'XI', block:'K50-K52', parentCode:'K50-K52', englishTitle:'Other noninfective gastroenteritis and colitis', albanianDraft:'Gastroenterit dhe kolit jo-infektiv', latinTitle:'', displayTitle:'Gastroenterit dhe kolit jo-infektiv', sourceRow:2 },
    { code:'K58', level:'category', chapter:'XI', block:'K55-K64', parentCode:'K55-K64', englishTitle:'Irritable bowel syndrome', albanianDraft:'Sindroma e zorrës së irrituar', latinTitle:'', displayTitle:'Sindroma e zorrës së irrituar', sourceRow:3 },
    { code:'R19.7', level:'subcategory', chapter:'XVIII', block:'R10-R19', parentCode:'R19', englishTitle:'Diarrhoea, unspecified', albanianDraft:'Diarre, e paspecifikuar', latinTitle:'', displayTitle:'Diarre, e paspecifikuar', sourceRow:4 },
  ],
};
FullIcd.attachIndexes(dataset);

const diarrhea = SymptomIntent.intentPayload('dairre');
const rows = Handler._test.symptomDifferentialRows(dataset, diarrhea);
assert.deepEqual(rows.map(row => row.code), ['A09','K52','K58']);
assert.equal(rows[0].searchMatch.field, 'symptom');
assert.equal(rows[0].searchMatch.type, 'symptom-differential');
assert.equal(rows[0].symptomRelation.intentId, 'diarrhea');
assert.equal(rows[0].symptomRelation.retrievalWeight, 1);

const baseRows = [
  { code:'R19.7', searchMatch:{ field:'sq' } },
  { code:'A09', searchMatch:{ field:'sq' } },
];
const merged = Handler._test.mergeSymptomRows(baseRows, rows, 8);
assert.deepEqual(merged.map(row => row.code), ['A09','K52','K58','R19.7']);
assert.equal(new Set(merged.map(row => row.code)).size, merged.length, 'Differential merge must deduplicate ICD codes.');

console.log('ICD symptom intent, typo matching, differential retrieval and safety semantics passed.');
