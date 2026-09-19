'use strict';

const assert = require('node:assert/strict');
const Data = require('../data/icd-primary-care-action-v1.json');
const Handler = require('../lib/icd-advanced-handler.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');

assert.equal(Data.version, 2);
assert.equal(Data.entries.length, 45);
assert.equal(new Set(Data.entries.map(entry => entry.code)).size, 45);

for (const code of ['I10','E11','J06','R51','R19.7','R11','R10.4','R42','R00.2','J45','J44','K21','A09','N39.0','M54','M47','M51','J00','J30','H92.0','H10','R12','R14','K59.0','M54.5','M54.2','M54.3','M25.5','M19','M79.1','G43','R60','L30','B35','D50','E03','F41']) {
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
assert.equal(indexPayload.total, 45);
assert.equal(indexPayload.items.length, 45);
assert.ok(indexPayload.items.some(item => item.code === 'I10' && /Kardiolog/.test(item.specialist)));
assert.ok(indexPayload.items.every(item => item.code && item.title_sq && item.specialist));
console.log('Primary-care action dataset, exact guidance and parent fallback passed.');
