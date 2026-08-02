'use strict';

const assert = require('node:assert/strict');
const Health = require('../lib/icd-health-audit.js');

const coreNodes = [
  { code:'I', level:'chapter', chapter:'I', block:'', parentCode:'', englishTitle:'Certain infectious and parasitic diseases', albanianDraft:'Sëmundje infektive dhe parazitare', displayTitle:'Sëmundje infektive dhe parazitare' },
  { code:'IX', level:'chapter', chapter:'IX', block:'', parentCode:'', englishTitle:'Diseases of the circulatory system', albanianDraft:'Sëmundjet e sistemit të qarkullimit', displayTitle:'Sëmundjet e sistemit të qarkullimit' },
  { code:'XVIII', level:'chapter', chapter:'XVIII', block:'', parentCode:'', englishTitle:'Symptoms, signs and abnormal findings', albanianDraft:'Simptomat dhe shenjat', displayTitle:'Simptomat dhe shenjat' },
  { code:'A00-A09', level:'block', chapter:'I', block:'A00-A09', parentCode:'I', englishTitle:'Intestinal infectious diseases', albanianDraft:'Sëmundjet infektive të zorrëve', displayTitle:'Sëmundjet infektive të zorrëve' },
  { code:'I10-I15', level:'block', chapter:'IX', block:'I10-I15', parentCode:'IX', englishTitle:'Hypertensive diseases', albanianDraft:'Sëmundjet hipertensive', displayTitle:'Sëmundjet hipertensive' },
  { code:'I20-I25', level:'block', chapter:'IX', block:'I20-I25', parentCode:'IX', englishTitle:'Ischaemic heart diseases', albanianDraft:'Sëmundjet ishemike të zemrës', displayTitle:'Sëmundjet ishemike të zemrës' },
  { code:'R00-R09', level:'block', chapter:'XVIII', block:'R00-R09', parentCode:'XVIII', englishTitle:'Symptoms involving circulatory and respiratory systems', albanianDraft:'Simptoma të qarkullimit dhe frymëmarrjes', displayTitle:'Simptoma të qarkullimit dhe frymëmarrjes' },
  { code:'A00', level:'category', chapter:'I', block:'A00-A09', parentCode:'A00-A09', englishTitle:'Cholera', albanianDraft:'Kolera', displayTitle:'Kolera' },
  { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential (primary) hypertension', albanianDraft:'Hipertensioni esencial (primar)', displayTitle:'Hipertensioni esencial (primar)' },
  { code:'I21', level:'category', chapter:'IX', block:'I20-I25', parentCode:'I20-I25', englishTitle:'Acute myocardial infarction', albanianDraft:'Infarkt akut i miokardit', displayTitle:'Infarkt akut i miokardit' },
  { code:'R07', level:'category', chapter:'XVIII', block:'R00-R09', parentCode:'R00-R09', englishTitle:'Pain in throat and chest', albanianDraft:'Dhimbje në fyt dhe gjoks', displayTitle:'Dhimbje në fyt dhe gjoks' },
  { code:'A00.1', level:'subcategory', chapter:'I', block:'A00-A09', parentCode:'A00', englishTitle:'Cholera due to Vibrio cholerae 01, biovar eltor', albanianDraft:'Kolera nga Vibrio cholerae 01, biovar eltor', displayTitle:'Kolera nga Vibrio cholerae 01, biovar eltor' },
  { code:'R07.4', level:'subcategory', chapter:'XVIII', block:'R00-R09', parentCode:'R07', englishTitle:'Chest pain, unspecified', albanianDraft:'Dhimbje gjoksi, e paspecifikuar', displayTitle:'Dhimbje gjoksi, e paspecifikuar' },
];

const fillerCount = Health.EXPECTED_COUNTS.total - coreNodes.length;
const nodes = coreNodes.concat(Array.from({ length:fillerCount }, (_, index) => ({
  code:`XTEST${index}`,
  level:'subcategory',
  chapter:'XXII',
  block:'U00-U49',
  parentCode:'U00',
  englishTitle:`Synthetic audit filler ${index}`,
  albanianDraft:`Rresht testues ${index}`,
  displayTitle:`Rresht testues ${index}`,
})));
const dataset = {
  version:'ICD-10-WHO 2019',
  sourceSpreadsheetId:'sheet-test',
  counts:{ ...Health.EXPECTED_COUNTS },
  nodes,
};

const counts = Health.countAudit(dataset);
assert.equal(counts.complete, true);
assert.equal(counts.actual.nodeArray, 12542);
assert.deepEqual(counts.mismatches, []);

const probes = Health.searchAudit(dataset);
assert.equal(probes.total, 5);
assert.equal(probes.passed, 5);
assert.equal(probes.healthy, true);
assert.equal(probes.probes.find(item => item.id === 'compact-code').firstCode, 'A00.1');
assert.equal(probes.probes.find(item => item.id === 'compact-block').firstCode, 'I10-I15');
assert.equal(probes.probes.find(item => item.id === 'clinical-synonym').firstCode, 'I10');
assert.equal(probes.probes.find(item => item.id === 'typo-tolerance').firstCode, 'I10');
assert.match(probes.probes.find(item => item.id === 'symptom-code').firstCode, /^R07/);
assert.equal(probes.probes.find(item => item.id === 'symptom-code').forbiddenCodes.includes('I21'), true);
assert.equal(probes.diagnosticDecision, false);

const firstAudit = Health.auditDataset(dataset);
const secondAudit = Health.auditDataset(dataset);
assert.equal(firstAudit, secondAudit, 'Dataset audit must be cached by dataset identity.');
assert.equal(firstAudit.healthy, true);

const now = Date.parse('2026-08-02T09:30:00.000Z');
const loadedAt = '2026-08-02T09:29:55.000Z';
const live = Health.healthFromLoaded({
  data:dataset,
  stale:false,
  loadedAt,
  sourceRevision:'abcdefghijklmnopqrst',
  csvBytes:4106422,
  fetchMs:321,
  buildMs:87,
}, {
  type:'google-sheet', status:'live', visibility:'public-link', spreadsheetId:'sheet-test',
  sheetName:'ICD-10 EN-SQ', sheetGid:329283560, loadedAt, csvBytes:4106422,
  revision:'abcdefghijklmnopqrst', fetchMs:321, buildMs:87,
}, now);
assert.equal(live.state.code, 'healthy');
assert.equal(live.hierarchy.complete, true);
assert.equal(live.search.passed, 5);
assert.equal(live.source.ageMs, 5000);
assert.equal(live.source.revision, 'abcdefghijklmnopqrst');

const stale = Health.healthFromLoaded({ data:dataset, stale:true, loadedAt }, { status:'stale', loadedAt }, now);
assert.equal(stale.state.code, 'stale');
assert.equal(stale.source.status, 'stale');

const incompleteDataset = { ...dataset, counts:{ ...dataset.counts, total:12541 }, nodes:nodes.slice(0, -1) };
const incomplete = Health.healthFromLoaded({ data:incompleteDataset, stale:false, loadedAt }, { status:'live', loadedAt }, now);
assert.equal(incomplete.state.code, 'warning');
assert.equal(incomplete.hierarchy.complete, false);

const unavailable = Health.unavailableHealth(new Error('Google Sheet timeout'), now);
assert.equal(unavailable.available, false);
assert.equal(unavailable.state.code, 'error');
assert.match(unavailable.error, /timeout/);
assert.equal(unavailable.search.total, 5);

console.log('ICD production source integrity, clinical probes, cache and failure isolation passed.');
