'use strict';

const assert = require('node:assert/strict');
const search = require('../emergency-search-core-v8.js');

const fixtures = [
  {
    _id:'ana',
    title:'Anafilaksia',
    aliases:['Reaksion anafilaktik'],
    searchAliases:['reaksion alergjik i rëndë','allergic reaction'],
    abbreviations:['ANA'],
    icdCodes:['T78.2'],
    category:'Alergologji',
    signatureSymptoms:['urtikarie','dispne','hipotension','edemë e rrugëve të frymëmarrjes'],
    summary:'Reaksion alergjik akut me urtikarie, dispne dhe hipotension.',
    redFlags:['Hipotension', 'Dispne', 'Stridor'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'hypo',
    title:'Hipoglikemia e rëndë',
    aliases:['Hipoglikemi','sheqer i ulët'],
    searchAliases:['low blood sugar'],
    icdCodes:['E16.2'],
    category:'Endokrinologji',
    chiefComplaints:['konfuzion','djersitje','humbje e vetëdijes'],
    summary:'Sheqer i ulët në gjak me konfuzion, djersitje ose humbje të vetëdijes.',
    redFlags:['Konfuzion', 'Pa vetëdije'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'stemi',
    title:'STEMI',
    aliases:['Infarkt akut me ST elevim'],
    searchAliases:['infarkt me ST elevim','heart attack ST elevation'],
    abbreviations:['IAM-ST'],
    icdCodes:['I21.3'],
    category:'Kardiologji',
    signatureSymptoms:['dhimbje gjoksi','dhimbje retrosternale','ST elevim'],
    summary:'Dhimbje gjoksi me ndryshime akute ST elevim në EKG.',
    redFlags:['Dhimbje gjoksi', 'ST elevim'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'status',
    title:'Status epilepticus',
    aliases:['Kriza epileptike e zgjatur'],
    searchAliases:['konvulsione të zgjatura'],
    category:'Neurologji',
    signatureSymptoms:['konvulsione','pa rikthim të vetëdijes'],
    summary:'Konvulsione të zgjatura ose të përsëritura pa rikthim të vetëdijes.',
    redFlags:['Konvulsione të zgjatura', 'Pa vetëdije'],
    triageLevel:'critical',
    reviewStatus:'verified',
  },
  {
    _id:'asthma',
    title:'Astma akute e rëndë',
    aliases:['Sulm i rëndë i astmës'],
    searchAliases:['severe asthma attack'],
    category:'Pulmologji',
    signatureSymptoms:['dispne','wheezing','fishkëllimë'],
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
  ['reaksion alergjik i rëndë', 'ana'],
  ['urtikarie hipotension dispne', 'ana'],
  ['allergic reaction hypotension', 'ana'],
  ['IAM-ST', 'stemi'],
  ['dhimbje retrosternale ST elevim', 'stemi'],
  ['I21.3', 'stemi'],
  ['sheqer ulët konfuzion', 'hypo'],
  ['pacienti spo reagon sheqeri 1.9', 'hypo'],
  ['konvulsione zgjatura', 'status'],
  ['dispne wheezing', 'asthma'],
];

hitAt1Cases.forEach(([query, expected]) => {
  const result = top(query);
  assert.ok(result, `Expected a result for: ${query}`);
  assert.equal(result.item._id, expected, `Wrong top result for: ${query}`);
});

assert.equal(top('Anafilaksia').strength, 'exact', 'Exact diagnosis should remain exact.');
assert.equal(top('T78.2').strength, 'exact', 'Exact ICD should remain exact.');
assert.equal(top('IAM-ST').strength, 'exact', 'Curated abbreviation should be an exact identity match.');
assert.equal(top('anaflaksi').strength, 'strong', 'A close diagnosis typo should be a strong search match, not diagnostic confidence.');
assert.equal(top('urtikarie hipotension dispne').strength, 'strong', 'High-coverage signature symptoms should be a strong search match.');
assert.ok(top('urtikarie hipotension dispne').coverage >= .67, 'Multi-symptom result should expose query coverage.');

assert.deepEqual(ids('skuqje thonjsh kronike pa lidhje'), [], 'Unrelated query must not produce a forced emergency result.');
assert.deepEqual(ids('numri i telefonit te pacientit'), [], 'Administrative/patient-identifying text must not map to a clinical emergency.');

const rescue = search.suggestPrepared(prepared, 'anafilaksiaa', {limit:3});
assert.equal(rescue[0]?.item?._id, 'ana', 'Typo rescue should suggest the nearby diagnosis title.');
assert.equal(rescue[0]?.reason, 'Drejtshkrim i afërt');
assert.deepEqual(search.suggestPrepared(prepared, 'tekst palidhur krejt', {limit:3}), [], 'Typo rescue must fail closed on unrelated text.');
assert.deepEqual(search.suggestPrepared(prepared, 'I21.8', {limit:3}), [], 'ICD-like strings must never be typo-rescued into another code.');

const abusiveUsage = {
  asthma:{count:999,lastAt:1_800_000_000_000},
  status:{count:999,lastAt:1_800_000_000_000},
};
assert.equal(top('Anafilaksia', abusiveUsage).item._id, 'ana', 'Personal usage must never override an exact diagnosis.');
assert.equal(top('T78.2', abusiveUsage).item._id, 'ana', 'Personal usage must never override an exact ICD.');

const popularityFixture = fixtures.map(item => item._id === 'asthma' ? {...item, searchPopularity:9999} : item);
assert.equal(search.rank(popularityFixture, 'Anafilaksia')[0]?.item?._id, 'ana', 'Global popularity must remain a small tie-breaker and never override exact identity.');

const hitAt1 = hitAt1Cases.filter(([query, expected]) => top(query)?.item?._id === expected).length / hitAt1Cases.length;
assert.equal(hitAt1, 1, 'Curated physician search benchmark must keep 100% Hit@1.');

const started = process.hrtime.bigint();
for (let i = 0; i < 250; i += 1) {
  for (const [query] of hitAt1Cases) search.rankPrepared(prepared, query, {}, {limit:7, now:1_800_000_000_000});
}
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
assert.ok(elapsedMs < 1000, `Preindexed deterministic benchmark should remain comfortably sub-second in CI; got ${elapsedMs.toFixed(1)}ms.`);

console.log(`Emergency search quality v11 passed: Hit@1 ${(hitAt1 * 100).toFixed(0)}% across ${hitAt1Cases.length} curated queries; 3250 lookups in ${elapsedMs.toFixed(1)}ms.`);
