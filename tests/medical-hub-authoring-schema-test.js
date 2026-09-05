'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const config = read('studio/sanity.config.ts');
const cli = read('studio/sanity.cli.ts');
const index = read('studio/src/schema-types/index.ts');
const book = read('studio/src/schema-types/medical-book.ts');
const chapter = read('studio/src/schema-types/medical-chapter.ts');
const topic = read('studio/src/schema-types/medical-topic.ts');
const section = read('studio/src/schema-types/medical-section.ts');
const clinical = read('studio/src/schema-types/clinical-types.ts');
const source = read('studio/src/schema-types/source-types.ts');
const api = read('api/medical-hub.js');

assert.match(config, /name: 'medical-hub-authoring'/);
assert.match(config, /projectId: '4wdtp8cz'/);
assert.match(config, /dataset: 'production'/);
assert.match(cli, /studioHost: 'drx-medical-hub-authoring'/);

for (const type of ['medicalBook', 'medicalChapter', 'medicalTopic', 'medicalSection']) {
  assert.match(index, new RegExp(`\\b${type}\\b`));
}

assert.match(book, /name: 'sourceFile'/);
assert.match(book, /title: 'PDF-ja kryesore'/);
assert.match(book, /name: 'sourceExtracts'/);
assert.match(book, /1c1UE1EYQYOji69nyn6OB3prY96YInmFv/);
assert.match(book, /119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg/);
assert.match(book, /1l8ZgUBuvCL1891pDT4V11tHqeNTTt3rQPDIR8c7RFuo/);
assert.match(chapter, /to: \[\{type: 'medicalBook'\}\]/);
assert.match(topic, /to: \[\{type: 'medicalChapter'\}\]/);
assert.match(topic, /name: 'sections'/);
assert.match(topic, /reviewStatus === 'verified'/);
assert.match(topic, /Rishikuar nga/);
assert.match(topic, /Rishikimi i fundit/);
assert.match(section, /name: 'sectionType'/);
assert.match(section, /defineArrayMember\(\{type: 'prescriptionGroup'\}\)/);
assert.match(clinical, /name: 'prescriptionLine'/);
assert.match(clinical, /name: 'clinicalStepGroup'/);
assert.match(clinical, /name: 'medicalFigure'/);
assert.match(clinical, /name: 'medicalTable'/);
assert.match(source, /name: 'sourceLocator'/);
assert.match(source, /name: 'driveFileId'/);

const modernIndex = api.match(/const MODERN_INDEX_QUERY = `([\s\S]*?)`;/)?.[1] || '';
const modernDetail = api.match(/const MODERN_DETAIL_QUERY = `([\s\S]*?)`;/)?.[1] || '';
assert.match(modernIndex, /reviewStatus == "verified"/);
assert.doesNotMatch(modernIndex, /reviewStatus != "archived"/);
assert.match(modernDetail, /sections\[\]/);
assert.match(modernDetail, /image\.asset->url/);
assert.match(modernDetail, /sourceLocator/);

console.log('Medical Hub book-first Sanity authoring schema contract passed.');
