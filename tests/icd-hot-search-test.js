'use strict';

const assert = require('node:assert/strict');
const Hot = require('../data/icd-qkmf-hot-search-v1.json');
const Handler = require('../lib/icd-advanced-handler.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

assert.equal(Hot.version, 1);
assert.equal(Hot.rows.length, 72);
assert.equal(Hot.rows.filter(row => row.urgent).length, 25);
assert.equal(new Set(Hot.rows.map(row => row.code)).size, 72);
for (const code of ['I10','E11','J10','J11','R19.7','R11','R51','R42','M47','M51','I21','R06.0']) {
  const row = Hot.rows.find(item => item.code === code);
  assert.ok(row, `Missing hot-search code ${code}`);
  assert.ok(Array.isArray(row.aliases) && row.aliases.length >= 1, `Missing aliases for ${code}`);
}

const dataset = {
  version:'test',
  sourceSpreadsheetId:'test',
  counts:{ total:7, categories:5, subcategories:2 },
  quality:{},
  nodes:[
    { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial primar', latinTitle:'Hypertensio arterialis essentialis primaria', displayTitle:'Hipertensioni esencial primar', sourceRow:1 },
    { code:'R51', level:'category', chapter:'XVIII', block:'R50-R69', parentCode:'R50-R69', englishTitle:'Headache', albanianDraft:'Dhimbje koke', latinTitle:'Cephalalgia', displayTitle:'Dhimbje koke', sourceRow:2 },
    { code:'R19.7', level:'subcategory', chapter:'XVIII', block:'R10-R19', parentCode:'R19', englishTitle:'Diarrhoea, unspecified', albanianDraft:'Diarre, e paspecifikuar', latinTitle:'', displayTitle:'Diarre, e paspecifikuar', sourceRow:3 },
    { code:'A09', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Other gastroenteritis and colitis of infectious and unspecified origin', albanianDraft:'Gastroenterit dhe kolit', latinTitle:'', displayTitle:'Gastroenterit dhe kolit', sourceRow:4 },
    { code:'K52', level:'category', chapter:'XI', block:'K50-K52', parentCode:'K50-K52', englishTitle:'Other noninfective gastroenteritis and colitis', albanianDraft:'Gastroenterit dhe kolit jo-infektiv', latinTitle:'', displayTitle:'Gastroenterit dhe kolit jo-infektiv', sourceRow:5 },
    { code:'K58', level:'category', chapter:'XI', block:'K55-K64', parentCode:'K55-K64', englishTitle:'Irritable bowel syndrome', albanianDraft:'Sindroma e zorrës së irrituar', latinTitle:'', displayTitle:'Sindroma e zorrës së irrituar', sourceRow:6 },
    { code:'R19', level:'category', chapter:'XVIII', block:'R10-R19', parentCode:'R10-R19', englishTitle:'Other symptoms involving digestive system', albanianDraft:'Simptoma të tjera të sistemit tretës', latinTitle:'', displayTitle:'Simptoma të tjera të sistemit tretës', sourceRow:7 },
  ],
};
FullIcd.attachIndexes(dataset);

const hot = Handler._test.hotPayload(dataset, {
  sourceRevision:'test-revision', stale:false, loadedAt:Date.now(), csvBytes:100, fetchMs:1, buildMs:1,
});

assert.equal(hot.kind, 'qkmf-hot-search');
assert.equal(hot.meta.search.engine, 'clinical-ranking-v8');
assert.ok(hot.meta.search.supports.includes('qkmf-hot-cache'));
assert.ok(hot.meta.search.supports.includes('zero-network-common-preview'));
assert.ok(hot.quick.some(item => item.code === 'I10'));
assert.ok(hot.quick.some(item => item.code === 'R51'));
assert.ok(hot.quick.some(item => item.code === 'R19.7'));

const diarrhea = hot.symptoms.find(item => item.id === 'diarrhea');
assert.ok(diarrhea);
assert.equal(diarrhea.symptom_code, 'R19.7');
assert.deepEqual(diarrhea.candidates.map(row => row.code), ['A09','K52','K58']);
assert.ok(diarrhea.candidates.every(row => row.searchMatch?.field === 'symptom'));

console.log('QKMF hot-search data, one-shot backend payload and zero-network seed contract passed.');
