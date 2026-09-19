'use strict';

const assert = require('node:assert/strict');
const Data = require('../data/icd-primary-care-action-v1.json');
const Handler = require('../lib/icd-advanced-handler.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

assert.equal(Data.version, 6);
assert.equal(Data.entries.length, 125);
assert.equal(new Set(Data.entries.map(entry => entry.code)).size, 125);

for (const code of Data.entries.map(entry => entry.code)) {
  const entry = Data.entries.find(item => item.code === code);
  assert.ok(entry, `Missing primary-care action entry for ${code}`);
  assert.ok(entry.working_diagnosis);
  assert.ok(entry.referral?.specialist);
  assert.ok(entry.referral?.goal);
  assert.ok(entry.referral?.note);
  assert.ok(Array.isArray(entry.anamnesis) && entry.anamnesis.length >= 3);
  assert.ok(Array.isArray(entry.exams) && entry.exams.length >= 3);
  assert.ok(entry.management);
  assert.ok(entry.summary);
}

const dataset = {
  version:'test',
  sourceSpreadsheetId:'test',
  counts:{ total:4, categories:3, subcategories:1 },
  quality:{},
  nodes:[
    { code:'M54', level:'category', chapter:'XIII', block:'M50-M54', parentCode:'M50-M54', englishTitle:'Dorsalgia', albanianDraft:'Dhimbje shpine', latinTitle:'Dorsalgia', displayTitle:'Dhimbje shpine', sourceRow:1 },
    { code:'M54.3', level:'subcategory', chapter:'XIII', block:'M50-M54', parentCode:'M54', englishTitle:'Sciatica', albanianDraft:'Ishialgji', latinTitle:'Ischialgia', displayTitle:'Ishialgji', sourceRow:2 },
    { code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15', englishTitle:'Essential hypertension', albanianDraft:'Hipertension esencial', latinTitle:'Hypertensio arterialis essentialis', displayTitle:'Hipertension esencial', sourceRow:3 },
    { code:'J06', level:'category', chapter:'X', block:'J00-J06', parentCode:'J00-J06', englishTitle:'Acute upper respiratory infections', albanianDraft:'Infeksion respirator akut', latinTitle:'', displayTitle:'Infeksion respirator akut', sourceRow:4 },
  ],
};
FullIcd.attachIndexes(dataset);

let payload = Handler._test.guidancePayload(dataset, { code:'I10' }, {
  sourceRevision:'test', stale:false, loadedAt:Date.now(), csvBytes:1, fetchMs:1, buildMs:1,
});
assert.equal(payload.available, true);
assert.equal(payload.inherited, false);
assert.equal(payload.guidance.code, 'I10');
assert.match(payload.guidance.working_diagnosis, /I10/);

payload = Handler._test.guidancePayload(dataset, { code:'M54.3' }, {
  sourceRevision:'test', stale:false, loadedAt:Date.now(), csvBytes:1, fetchMs:1, buildMs:1,
});
assert.equal(payload.available, true);
assert.equal(payload.inherited, false);
assert.equal(payload.inheritedFrom, '');
assert.equal(payload.guidance.code, 'M54.3');

payload = Handler._test.guidancePayload(dataset, { code:'M54.4' }, {
  sourceRevision:'test', stale:false, loadedAt:Date.now(), csvBytes:1, fetchMs:1, buildMs:1,
});
assert.equal(payload.available, true);
assert.equal(payload.inherited, true);
assert.equal(payload.inheritedFrom, 'M54');
assert.equal(payload.guidance.code, 'M54');

payload = Handler._test.guidancePayload(dataset, { code:'Z99.9' }, {
  sourceRevision:'test', stale:false, loadedAt:Date.now(), csvBytes:1, fetchMs:1, buildMs:1,
});
assert.equal(payload.available, false);
assert.equal(payload.guidance, null);

const indexPayload = Handler._test.guidanceListPayload(dataset, {
  sourceRevision:'test', stale:false, loadedAt:Date.now(), csvBytes:1, fetchMs:1, buildMs:1,
});
assert.equal(indexPayload.kind, 'primary-care-guidance-index');
assert.equal(indexPayload.total, 125);
assert.equal(indexPayload.items.length, 125);
const medicationEntries = Data.entries.filter(entry => entry.medications);
assert.equal(medicationEntries.length, 26);
for (const entry of medicationEntries) {
  assert.ok(Array.isArray(entry.medications.first_line) && entry.medications.first_line.length >= 1, `Medication first-line missing for ${entry.code}`);
  assert.ok(Array.isArray(entry.medications.alternatives), `Medication alternatives missing for ${entry.code}`);
  assert.ok(Array.isArray(entry.medications.avoid), `Medication avoid list missing for ${entry.code}`);
  assert.ok(entry.medications.note, `Medication note missing for ${entry.code}`);
  assert.ok(entry.medications.evidence, `Medication evidence missing for ${entry.code}`);
}
for (const code of ['I10','E11','J01','J02','J03','J18','J45','J44','H66','K21','K29','K30','N39.0','N30','G43','L03','L20','L70','D50','E03','F41','F32','M10','E05','B02','J20']) {
  assert.ok(Data.entries.find(entry => entry.code === code)?.medications, `Medication detail missing for ${code}`);
}
assert.ok(indexPayload.items.some(item => item.code === 'I10' && /Kardiolog/.test(item.specialist)));
assert.ok(indexPayload.items.every(item => item.code && item.title_sq && item.specialist));
const urgentCodes = ['I21','I20','I63','G45','I26','I47','I48','I50','J81','J46','A41','R57','T78.2','E16.2','E10.1','R56.8','R55','R07.4','R06.0','R04.0','R10.0','K92.2','N23','S06.0','T50.9'];
assert.equal(Data.entries.filter(entry => entry.urgent).length, 25);
assert.deepEqual(Data.entries.filter(entry => entry.urgent).map(entry => entry.code).sort(), urgentCodes.slice().sort());
assert.equal(indexPayload.items.filter(item => item.urgent).length, 25);
const expansionCodes = ['J18','J03','J10','J11','J21','B08.4','H60','H81.1','K30','K52','K64','N30','R31','N40','N76','L50','L03','L02','L20','E78','E66','R73','F32','G47.0','I95','I83','I87.2','M17','M75','M77'];
assert.equal(expansionCodes.length, 30);
for (const code of expansionCodes) {
  const entry = Data.entries.find(item => item.code === code);
  assert.ok(entry, `Expanded clinical guidance missing for ${code}`);
  assert.equal(Boolean(entry.urgent), false);
  assert.ok(entry.referral?.specialist && entry.management && entry.summary);
}

const expansion2Codes = ['B37','L70','L01','B00','B02','J32','J04','H00','H01','H61.2','K58','K80','K76.0','N20','N45','N92','N94.6','D64','E05','E04','M10','M06','M79.7','R00.0','R00.1'];
assert.equal(expansion2Codes.length, 25);
for (const code of expansion2Codes) {
  const entry = Data.entries.find(item => item.code === code);
  assert.ok(entry, `Second expansion guidance missing for ${code}`);
  assert.equal(Boolean(entry.urgent), false);
  assert.ok(entry.referral?.specialist && entry.management && entry.summary && entry.red_flags?.length);
}

for (const code of urgentCodes) {
  const item = indexPayload.items.find(entry => entry.code === code);
  assert.ok(item?.urgent, `Urgent guidance missing for ${code}`);
}
console.log('Primary-care action dataset, exact guidance and parent fallback passed.');
