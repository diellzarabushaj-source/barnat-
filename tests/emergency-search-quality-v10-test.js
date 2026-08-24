'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const search = require('../emergency-search-core-v8.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const fixtures = [
  {
    _id:'ana',
    title:'Anafilaksia',
    aliases:['Reaksion anafilaktik'],
    icdCodes:['T78.2'],
    category:'Alergologji',
    summary:'Reaksion alergjik akut me urtikarie, dispne dhe hipotension.',
    redFlags:['Hipotension', 'Dispne', 'Stridor'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'hypo',
    title:'Hipoglikemia e rëndë',
    aliases:['Hipoglikemi'],
    icdCodes:['E16.2'],
    category:'Endokrinologji',
    summary:'Sheqer i ulët në gjak me konfuzion, djersitje ose humbje të vetëdijes.',
    redFlags:['Konfuzion', 'Pa vetëdije'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'stemi',
    title:'STEMI',
    aliases:['Infarkt akut me ST elevim'],
    icdCodes:['I21.3'],
    category:'Kardiologji',
    summary:'Dhimbje gjoksi me ndryshime akute ST elevim në EKG.',
    redFlags:['Dhimbje gjoksi', 'ST elevim'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'status',
    title:'Status epilepticus',
    aliases:['Kriza epileptike e zgjatur'],
    category:'Neurologji',
    summary:'Konvulsione të zgjatura ose të përsëritura pa rikthim të vetëdijes.',
    redFlags:['Konvulsione të zgjatura', 'Pa vetëdije'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'asthma',
    title:'Astma akute e rëndë',
    aliases:['Sulm i rëndë i astmës'],
    category:'Pulmologji',
    summary:'Dispne, fishkëllimë dhe vështirësi e rëndë në frymëmarrje.',
    redFlags:['Dispne e rëndë'],
    triageLevel:'very-urgent',
    reviewStatus:'verified',
  },
];

const prepared = search.prepare(fixtures);
const top = (query, usage = {}) => search.rankPrepared(prepared, query, usage, {limit:7, now:1_800_000_000_000})[0];
const ids = query => search.rankPrepared(prepared, query, {}, {limit:7, now:1_800_000_000_000}).map(result => result.item._id);

const hitAt1Cases = [
  ['Anafilaksia', 'ana'],
  ['T78.2', 'ana'],
  ['anaflaksi', 'ana'],
  ['urtikarie hipotension dispne', 'ana'],
  ['dhimbje gjoksi st elevim', 'stemi'],
  ['sheqer ulët konfuzion', 'hypo'],
  ['konvulsione zgjatura', 'status'],
];

hitAt1Cases.forEach(([query, expected]) => {
  const result = top(query);
  assert.ok(result, `Expected a result for: ${query}`);
  assert.equal(result.item._id, expected, `Wrong top result for: ${query}`);
});

assert.equal(top('Anafilaksia').strength, 'exact', 'Exact diagnosis should be classified as exact match strength.');
assert.equal(top('T78.2').strength, 'exact', 'Exact ICD should be classified as exact match strength.');
assert.equal(top('anaflaksi').strength, 'strong', 'A close diagnosis typo should be a strong search match, not diagnostic confidence.');
assert.equal(top('urtikarie hipotension dispne').strength, 'strong', 'A high-coverage multi-symptom match should be strong.');
assert.ok(top('urtikarie hipotension dispne').coverage >= .67, 'Multi-symptom result should expose query coverage.');

assert.deepEqual(ids('skuqje thonjsh kronike pa lidhje'), [], 'Unrelated query must not produce a false confident match.');

const abusiveUsage = {
  asthma:{count:999,lastAt:1_800_000_000_000},
  status:{count:999,lastAt:1_800_000_000_000},
};
assert.equal(top('Anafilaksia', abusiveUsage).item._id, 'ana', 'Personal usage must never override an exact diagnosis.');
assert.equal(top('T78.2', abusiveUsage).item._id, 'ana', 'Personal usage must never override an exact ICD.');

const symptomRuntime = read('emergency-symptom-chips-v9.js');
assert.match(symptomRuntime, /engine\.prepare\(corpus\)/, 'Symptom shortcuts must prepare the corpus once per dataset.');
assert.match(symptomRuntime, /engine\.rankPrepared\(prepared/, 'Symptom availability must reuse the prepared index.');
assert.match(symptomRuntime, /if \(writing \|\| !selected\.size\) return;/, 'Normal typing must bypass symptom-chip recomputation.');
assert.doesNotMatch(symptomRuntime, /engine\.rank\(corpus/, 'Symptom shortcuts must not rebuild the index for every candidate.');

const searchUi = read('emergency-smart-search-v8.js');
assert.match(searchUi, /data-ck-v8-strength/, 'Search results must expose neutral match strength.');
assert.match(searchUi, /Nuk është diagnozë automatike/, 'Search UI must keep the non-diagnostic safety disclaimer.');

const hitAt1 = hitAt1Cases.filter(([query, expected]) => top(query)?.item?._id === expected).length / hitAt1Cases.length;
assert.equal(hitAt1, 1, 'Curated emergency search benchmark must keep 100% Hit@1.');

console.log(`Emergency search quality v10 passed: Hit@1 ${(hitAt1 * 100).toFixed(0)}% across ${hitAt1Cases.length} curated queries; hot-path guards passed.`);
