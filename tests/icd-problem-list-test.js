'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const api = require('../icd-problem-list.js');
const runtime = read('icd-problem-list.js');
const styles = read('icd-problem-list.css');
const loader = read('app-stability.js');
const packageJson = read('package.json');

const now = 1785678000000;
const context = (code, level = 'category', extra = {}) => ({
  version:2,
  code,
  level,
  titleSq:`Titulli ${code}`,
  titleEn:`Title ${code}`,
  translationStatus:'standardized',
  selectedAt:now,
  ...extra,
});

assert.equal(api.VERSION, 'icd-problem-list-v1');
assert.equal(api.MAX_ITEMS, 5);
assert.equal(api.normalizeContext(context('I10')).code, 'I10');
assert.equal(api.normalizeContext(context('A00.1', 'subcategory')).level, 'subcategory');
assert.equal(api.normalizeContext(context('I10-I15', 'block')), null);
assert.equal(api.normalizeContext(context('I', 'chapter')), null);
assert.equal(api.normalizeContext(context('invalid')), null);
assert.equal(api.normalizeContext({ code:'I10', level:'category', selectedAt:now }), null);

const source = [
  context('I10'),
  context('E11'),
  context('J45'),
  context('N39'),
  context('M54'),
  context('K76'),
  context('E11'),
];
const bounded = api.normalizeItems(source, { now });
assert.deepEqual(bounded.map(item => item.code), ['I10', 'E11', 'J45', 'N39', 'M54']);
assert.equal(bounded.length, 5);
assert.deepEqual(
  api.normalizeItems(source, { primaryCode:'I10', now }).map(item => item.code),
  ['E11', 'J45', 'N39', 'M54', 'K76'],
);

const added = api.addItem([context('I10'), context('E11')], context('J45'), { now, primaryCode:'I10' });
assert.deepEqual(added.map(item => item.code), ['J45', 'E11']);
const deduped = api.addItem(added, context('J45', 'category', { titleSq:'Titull i ri' }), { now, primaryCode:'I10' });
assert.equal(deduped.length, 2);
assert.equal(deduped[0].titleSq, 'Titull i ri');
assert.deepEqual(api.removeItem(deduped, 'J45', { now }).map(item => item.code), ['E11']);

const serialized = api.serialize(source, now);
const parsedPayload = JSON.parse(serialized);
assert.equal(parsedPayload.version, 1);
assert.equal(parsedPayload.items.length, 5);
assert.ok(!('patientName' in parsedPayload));
assert.ok(!('patientId' in parsedPayload));
assert.ok(!('freeDiagnosis' in parsedPayload));
assert.deepEqual(api.parse(serialized, { now, primaryCode:'I10' }).map(item => item.code), ['E11', 'J45', 'N39', 'M54']);
assert.deepEqual(api.parse(serialized, { now:now + api.MAX_AGE_MS + 1 }), []);
assert.deepEqual(api.parse('{broken', { now }), []);

for (const marker of [
  "const HANDOFF_KEY = 'medindex_rx_secondary_diagnosis_context_v1'",
  "const DRAFT_KEY = 'medindex_rx_problem_list_draft_v1'",
  'secondaryDiagnosisCoding',
  'data-mi-problem-promote',
  'data-mi-problem-remove',
  'data-mi-recent-secondary',
  'icdAddSecondaryDiagnosis',
  'Maksimum ${MAX_ITEMS}',
  'medindex:icd-problem-list',
  "new Set(['category', 'subcategory'])",
]) assert.ok(runtime.includes(marker), `ICD problem-list runtime missing ${marker}`);

for (const marker of [
  '.rx-icd-problem-list', '.rx-icd-problem-item', '.rx-icd-problem-actions',
  '.icd-add-secondary-diagnosis', '@media(max-width:760px)',
  'html[data-theme="dark"]', '@media(forced-colors:active)',
]) assert.ok(styles.includes(marker), `ICD problem-list CSS missing ${marker}`);

for (const marker of [
  'loadIcdProblemListAssets',
  'icd-problem-list.css?v=icd-problem-list-v1',
  'icd-problem-list.js?v=icd-problem-list-v1',
  "version:'2026-08-02.1'",
]) assert.ok(loader.includes(marker), `ICD problem-list loader missing ${marker}`);

assert.ok(packageJson.includes('tests/icd-problem-list-test.js'), 'Phase 13 static test must run in the main suite.');
assert.ok(!fs.existsSync(path.join(root, 'api/icd-problem-list.js')), 'Problem list must not create a Vercel function.');
assert.doesNotMatch(runtime + loader, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(styles, /https?:\/\//);
new Function(runtime);
new Function(loader);
console.log('Bounded ICD secondary diagnosis problem-list, privacy and loader contracts passed.');
