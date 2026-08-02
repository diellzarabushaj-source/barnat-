'use strict';

const assert = require('node:assert/strict');
const Terminology = require('../lib/icd-sq-terminology-v2.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');

function node(code, chapter, englishTitle, albanianDraft = '', level = 'category', block = '', parentCode = '') {
  return Terminology.applyNode({
    code, level, chapter, block, parentCode, englishTitle, albanianDraft,
    displayTitle:albanianDraft || englishTitle,
  });
}

const samples = {
  hypertension:node('I10', 'IX', 'Essential (primary) hypertension', 'Hipertension esencial primar', 'category', 'I10-I15', 'I10-I15'),
  heartFailure:node('I50', 'IX', 'Heart failure', 'Dështimi i zemrës', 'category', 'I30-I52', 'I30-I52'),
  copd:node('J44', 'X', 'Other chronic obstructive pulmonary disease', 'COPD', 'category', 'J40-J47', 'J40-J47'),
  respiratoryFailure:node('J96.0', 'X', 'Acute respiratory failure', '', 'subcategory', 'J95-J99', 'J96'),
  dyspnoea:node('R06.0', 'XVIII', 'Dyspnoea', '', 'subcategory', 'R00-R09', 'R06'),
  chestPain:node('R07.4', 'XVIII', 'Chest pain, unspecified', '', 'subcategory', 'R00-R09', 'R07'),
  untouched:node('K00', 'XI', 'Disorders of tooth development and eruption', 'Çrregullime të zhvillimit të dhëmbëve'),
  missing:node('K01', 'XI', 'Embedded and impacted teeth', ''),
};

assert.equal(samples.hypertension.albanianDraft, 'Hipertensioni esencial (primar)');
assert.equal(samples.hypertension.machineDraftTitle, 'Hipertension esencial primar');
assert.ok(samples.hypertension.searchText.includes('tension i larte'));
assert.equal(samples.heartFailure.albanianDraft, 'Pamjaftueshmëria e zemrës');
assert.ok(samples.heartFailure.searchText.includes('insuficienca kardiake'));
assert.equal(samples.heartFailure.terminologySource, 'medindex-editorial-pilot-ix');

assert.equal(samples.copd.albanianDraft, 'Sëmundje të tjera kronike obstruktive të mushkërive');
assert.ok(samples.copd.searchText.includes('spok'));
assert.ok(samples.copd.searchText.includes('copd'));
assert.equal(samples.copd.terminologySource, 'medindex-editorial-pilot-x');
assert.equal(samples.respiratoryFailure.albanianDraft, 'Insuficienca respiratore akute');
assert.ok(samples.respiratoryFailure.searchText.includes('deshtim respirator akut'));

assert.equal(samples.dyspnoea.albanianDraft, 'Dispnea');
assert.ok(samples.dyspnoea.searchText.includes('gulcim'));
assert.ok(samples.dyspnoea.searchText.includes('veshtiresi ne frymemarrje'));
assert.equal(samples.dyspnoea.terminologySource, 'medindex-editorial-pilot-xviii');
assert.equal(samples.chestPain.albanianDraft, 'Dhimbja e kraharorit, e paspecifikuar');
assert.ok(samples.chestPain.searchText.includes('dhimbje gjoksi e paspecifikuar'));

assert.equal(samples.untouched.translationStatus, 'machine-draft');
assert.equal(samples.untouched.reviewState, 'pending-review');
assert.equal(samples.missing.translationStatus, 'missing');
assert.ok(samples.missing.terminologyFlags.includes('MISSING_ALBANIAN'));
assert.ok(!Terminology.lintTitle('Pamundësi për të të ushqyer', 'Feeding difficulty').includes('DUPLICATED_WORD'));
assert.ok(Terminology.lintTitle('Dhimbje dhimbje abdominale', 'Abdominal pain').includes('DUPLICATED_WORD'));
assert.deepEqual(Terminology.adjacentRepeatedWords('Blloku atrioventrikular dhe blloku i degës së majtë'), []);
assert.ok(!Terminology.lintTitle('Blloku atrioventrikular dhe blloku i degës së majtë', 'Atrioventricular and left bundle-branch block').includes('DUPLICATED_WORD'));
assert.deepEqual(Terminology.adjacentRepeatedWords('Dhimbje dhimbje abdominale'), ['dhimbje']);

const summary = Terminology.quality(Object.values(samples));
assert.equal(summary.standardizedTranslations, 6);
assert.equal(summary.machineDraftTranslations, 1);
assert.equal(summary.missingTranslations, 1);
assert.equal(summary.terminologyCoverage, 75);
assert.equal(summary.translationCoverage, 87.5);
assert.equal(summary.publicationReady, false);
assert.deepEqual(summary.pilotChapters, ['IX', 'X', 'XVIII']);
assert.deepEqual(summary.standardizedByChapter, { IX:2, X:2, XVIII:2 });

const csv = [
  'Niveli,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kapitulli,Blloku,Kodi prind',
  'KAPITULL,IX,Diseases of the circulatory system,Loading...,IX,,',
  'BLLOK,I10-I15,Hypertensive diseases,Sëmundjet hipertensive,IX,I10-I15,IX',
  'KATEGORI,I10,Essential (primary) hypertension,Hipertension esencial primar,IX,I10-I15,I10-I15',
  'KAPITULL,X,Diseases of the respiratory system,Loading...,X,,',
  'BLLOK,J40-J47,Chronic lower respiratory diseases,Loading...,X,J40-J47,X',
  'KATEGORI,J44,Other chronic obstructive pulmonary disease,COPD,X,J40-J47,J40-J47',
  'NËNKATEGORI,J44.1,Chronic obstructive pulmonary disease with acute exacerbation unspecified,Loading...,X,J40-J47,J44',
  'KAPITULL,XVIII,Symptoms signs and abnormal clinical and laboratory findings not elsewhere classified,Loading...,XVIII,,',
  'BLLOK,R00-R09,Symptoms and signs involving the circulatory and respiratory systems,Loading...,XVIII,R00-R09,XVIII',
  'KATEGORI,R06,Abnormalities of breathing,Loading...,XVIII,R00-R09,R00-R09',
  'NËNKATEGORI,R06.0,Dyspnoea,Loading...,XVIII,R00-R09,R06',
].join('\n');

const dataset = FullIcd.buildDataset(csv, { strictCounts:false });
assert.equal(dataset.terminology.version, 'sq-terminology-2026.2');
assert.deepEqual(dataset.terminology.pilotChapters, ['IX', 'X', 'XVIII']);
assert.equal(dataset.quality.standardizedTranslations, 11);
assert.equal(dataset.nodes.find(item => item.code === 'J44').displayTitle, 'Sëmundje të tjera kronike obstruktive të mushkërive');
assert.equal(dataset.nodes.find(item => item.code === 'R06.0').displayTitle, 'Dispnea');

assert.equal(FullIcd.queryDataset(dataset, { q:'tension i lartë', pageSize:10 }).rows[0].code, 'I10');
const basicCopd = FullIcd.queryDataset(dataset, { q:'spok', pageSize:10 });
assert.ok(basicCopd.rows.some(item => item.code === 'J44'));
assert.equal(FullIcd.queryDataset(dataset, { q:'gulçim', pageSize:10 }).rows[0].code, 'R06.0');

const advancedCopd = AdvancedIcd._test.tablePayload(
  dataset,
  { q:'spok', page:1, pageSize:10, levels:'category,subcategory' },
  new Map(),
);
assert.equal(advancedCopd.rows[0].code, 'J44');
assert.equal(advancedCopd.rows[0].translationStatus, 'standardized');

const advancedDyspnoea = AdvancedIcd._test.tablePayload(
  dataset,
  { q:'gulçim', page:1, pageSize:10, levels:'category,subcategory' },
  new Map(),
);
assert.equal(advancedDyspnoea.rows[0].code, 'R06.0');
assert.ok(!advancedDyspnoea.rows.some(item => item.code === 'J45' || item.code === 'J96.0'));
assert.ok(advancedDyspnoea.meta.search.supports.includes('editorial-alias'));

assert.equal(Terminology.TERMINOLOGY_VERSION, 'sq-terminology-2026.2');
assert.equal(Object.keys(Terminology.CHAPTER_TERMS).length, 22);
assert.ok(Object.keys(Terminology.CODE_TERMS).length >= 400);

console.log('Albanian ICD terminology standards, aliases and review states for Chapters IX, X and XVIII passed.');
