'use strict';

const assert = require('node:assert/strict');
const Terminology = require('../lib/icd-sq-terminology-v2.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');

function node(code, chapter, englishTitle, albanianDraft = '', level = 'category', block = '', parentCode = '') {
  return Terminology.applyNode({
    code,
    level,
    chapter,
    block,
    parentCode,
    englishTitle,
    albanianDraft,
    displayTitle:albanianDraft || englishTitle,
  });
}

const hypertension = node(
  'I10',
  'IX',
  'Essential (primary) hypertension',
  'Hipertension esencial primar',
  'category',
  'I10-I15',
  'I10-I15',
);
assert.equal(hypertension.albanianDraft, 'Hipertensioni esencial (primar)');
assert.equal(hypertension.machineDraftTitle, 'Hipertension esencial primar');
assert.equal(hypertension.translationStatus, 'standardized');
assert.equal(hypertension.reviewState, 'standardized');
assert.ok(hypertension.searchText.includes('tension i larte'));
assert.ok(hypertension.searchText.includes('shtypje e larte e gjakut'));
assert.deepEqual(hypertension.terminologyFlags, []);

const heartFailure = node('I50', 'IX', 'Heart failure', 'Dështimi i zemrës', 'category', 'I30-I52', 'I30-I52');
assert.equal(heartFailure.albanianDraft, 'Pamjaftueshmëria e zemrës');
assert.ok(heartFailure.searchText.includes('insuficienca kardiake'));
assert.equal(heartFailure.terminologySource, 'medindex-editorial-pilot-ix');

const copd = node('J44', 'X', 'Other chronic obstructive pulmonary disease', 'COPD', 'category', 'J40-J47', 'J40-J47');
assert.equal(copd.albanianDraft, 'Sëmundje të tjera kronike obstruktive të mushkërive');
assert.ok(copd.searchText.includes('spok'));
assert.ok(copd.searchText.includes('copd'));
assert.equal(copd.terminologySource, 'medindex-editorial-pilot-x');

const acuteRespiratoryFailure = node('J96.0', 'X', 'Acute respiratory failure', '', 'subcategory', 'J95-J99', 'J96');
assert.equal(acuteRespiratoryFailure.albanianDraft, 'Insuficienca respiratore akute');
assert.ok(acuteRespiratoryFailure.searchText.includes('deshtim respirator akut'));

const dyspnoea = node('R06.0', 'XVIII', 'Dyspnoea', '', 'subcategory', 'R00-R09', 'R06');
assert.equal(dyspnoea.albanianDraft, 'Dispnea');
assert.ok(dyspnoea.searchText.includes('gulcim'));
assert.ok(dyspnoea.searchText.includes('veshtiresi ne frymemarrje'));
assert.equal(dyspnoea.terminologySource, 'medindex-editorial-pilot-xviii');

const chestPain = node('R07.4', 'XVIII', 'Chest pain, unspecified', '', 'subcategory', 'R00-R09', 'R07');
assert.equal(chestPain.albanianDraft, 'Dhimbja e kraharorit, e paspecifikuar');
assert.ok(chestPain.searchText.includes('dhimbje gjoksi e paspecifikuar'));

const untouched = node('K00', 'XI', 'Disorders of tooth development and eruption', 'Çrregullime të zhvillimit të dhëmbëve');
assert.equal(untouched.translationStatus, 'machine-draft');
assert.equal(untouched.reviewState, 'pending-review');

const missing = node('K01', 'XI', 'Embedded and impacted teeth', '');
assert.equal(missing.translationStatus, 'missing');
assert.ok(missing.terminologyFlags.includes('MISSING_ALBANIAN'));

const safeRepeatedFunctionWord = Terminology.lintTitle('Pamundësi për të të ushqyer', 'Feeding difficulty');
assert.ok(!safeRepeatedFunctionWord.includes('DUPLICATED_WORD'));
const duplicatedClinicalWord = Terminology.lintTitle('Dhimbje dhimbje abdominale', 'Abdominal pain');
assert.ok(duplicatedClinicalWord.includes('DUPLICATED_WORD'));

const summary = Terminology.quality([
  hypertension,
  heartFailure,
  copd,
  acuteRespiratoryFailure,
  dyspnoea,
  chestPain,
  untouched,
  missing,
]);
assert.equal(summary.standardizedTranslations, 6);
assert.equal(summary.machineDraftTranslations, 1);
assert.equal(summary.missingTranslations, 1);
assert.equal(summary.verifiedTranslations, 0);
assert.equal(summary.terminologyCoverage, 75);
assert.equal(summary.translationCoverage, 87.5);
assert.equal(summary.publicationReady, false);
assert.equal(summary.pilotChapter, 'IX');
assert.deepEqual(summary.pilotChapters, ['IX', 'X', 'XVIII']);
assert.equal(summary.standardizedByChapter.IX, 2);
assert.equal(summary.standardizedByChapter.X, 2);
assert.equal(summary.standardizedByChapter.XVIII, 2);

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
assert.equal(dataset.terminology.version, Terminology.TERMINOLOGY_VERSION);
assert.deepEqual(dataset.terminology.pilotChapters, ['IX', 'X', 'XVIII']);
assert.equal(dataset.quality.standardizedTranslations, 11);
assert.equal(dataset.nodes.find(item => item.code === 'J44').displayTitle, 'Sëmundje të tjera kronike obstruktive të mushkërive');
assert.equal(dataset.nodes.find(item => item.code === 'R06.0').displayTitle, 'Dispnea');

const heartAliasResult = FullIcd.queryDataset(dataset, { q:'tension i lartë', pageSize:10 });
assert.equal(heartAliasResult.rows[0].code, 'I10');
const respiratoryAliasResult = FullIcd.queryDataset(dataset, { q:'spok', pageSize:10 });
assert.equal(respiratoryAliasResult.rows[0].code, 'J44');
const symptomAliasResult = FullIcd.queryDataset(dataset, { q:'gulçim', pageSize:10 });
assert.equal(symptomAliasResult.rows[0].code, 'R06.0');

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
