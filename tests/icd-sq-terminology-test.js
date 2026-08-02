'use strict';

const assert = require('node:assert/strict');
const Terminology = require('../lib/icd-sq-terminology.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');

const hypertension = Terminology.applyNode({
  code:'I10', level:'category', chapter:'IX', block:'I10-I15', parentCode:'I10-I15',
  englishTitle:'Essential (primary) hypertension',
  albanianDraft:'Hipertension esencial primar',
  displayTitle:'Hipertension esencial primar',
});
assert.equal(hypertension.albanianDraft, 'Hipertensioni esencial (primar)');
assert.equal(hypertension.machineDraftTitle, 'Hipertension esencial primar');
assert.equal(hypertension.translationStatus, 'standardized');
assert.equal(hypertension.reviewState, 'standardized');
assert.ok(hypertension.searchText.includes('tension i larte'));
assert.ok(hypertension.searchText.includes('shtypje e larte e gjakut'));
assert.deepEqual(hypertension.terminologyFlags, []);

const heartFailure = Terminology.applyNode({
  code:'I50', level:'category', chapter:'IX', block:'I30-I52', parentCode:'I30-I52',
  englishTitle:'Heart failure', albanianDraft:'Dështimi i zemrës', displayTitle:'Dështimi i zemrës',
});
assert.equal(heartFailure.albanianDraft, 'Pamjaftueshmëria e zemrës');
assert.ok(heartFailure.searchText.includes('insuficienca kardiake'));
assert.ok(heartFailure.searchText.includes('deshtimi i zemres'));

const chapter = Terminology.applyNode({
  code:'IX', level:'chapter', chapter:'IX', block:'', parentCode:'',
  englishTitle:'Diseases of the circulatory system', albanianDraft:'Sëmundjet e qarkullimit',
});
assert.equal(chapter.albanianDraft, 'Sëmundjet e sistemit të qarkullimit të gjakut');
assert.equal(chapter.terminologySource, 'medindex-chapter-standard');

const untouched = Terminology.applyNode({
  code:'J00', level:'category', chapter:'X', block:'J00-J06', parentCode:'J00-J06',
  englishTitle:'Acute nasopharyngitis [common cold]', albanianDraft:'Acute nasopharyngitis and common cold',
});
assert.equal(untouched.translationStatus, 'machine-draft');
assert.equal(untouched.reviewState, 'pending-review');
assert.ok(untouched.terminologyFlags.includes('ENGLISH_FRAGMENT'));

const missing = Terminology.applyNode({
  code:'J01', level:'category', chapter:'X', block:'J00-J06', parentCode:'J00-J06',
  englishTitle:'Acute sinusitis', albanianDraft:'',
});
assert.equal(missing.translationStatus, 'missing');
assert.ok(missing.terminologyFlags.includes('MISSING_ALBANIAN'));

const summary = Terminology.quality([hypertension, heartFailure, untouched, missing]);
assert.equal(summary.standardizedTranslations, 2);
assert.equal(summary.machineDraftTranslations, 1);
assert.equal(summary.missingTranslations, 1);
assert.equal(summary.verifiedTranslations, 0);
assert.equal(summary.terminologyCoverage, 50);
assert.equal(summary.translationCoverage, 75);
assert.equal(summary.publicationReady, false);
assert.equal(summary.pilotChapter, 'IX');

const csv = [
  'Niveli,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kapitulli,Blloku,Kodi prind',
  'KAPITULL,IX,Diseases of the circulatory system,Loading...,IX,,',
  'BLLOK,I10-I15,Hypertensive diseases,Sëmundjet hipertensive,IX,I10-I15,IX',
  'BLLOK,I30-I52,Other forms of heart disease,Forma të tjera të sëmundjeve të zemrës,IX,I30-I52,IX',
  'KATEGORI,I10,Essential (primary) hypertension,Hipertension esencial primar,IX,I10-I15,I10-I15',
  'KATEGORI,I50,Heart failure,Dështimi i zemrës,IX,I30-I52,I30-I52',
].join('\n');
const dataset = FullIcd.buildDataset(csv, { strictCounts:false });
assert.equal(dataset.terminology.version, Terminology.TERMINOLOGY_VERSION);
assert.equal(dataset.quality.standardizedTranslations, 5);
assert.equal(dataset.nodes.find(node => node.code === 'I50').displayTitle, 'Pamjaftueshmëria e zemrës');
const aliasResult = FullIcd.queryDataset(dataset, { q:'insuficienca kardiake', pageSize:10 });
assert.equal(aliasResult.rows[0].code, 'I50');
const bloodPressureResult = FullIcd.queryDataset(dataset, { q:'tension i lartë', pageSize:10 });
assert.equal(bloodPressureResult.rows[0].code, 'I10');

const advancedAlias = AdvancedIcd._test.tablePayload(
  dataset,
  { q:'insuficienca kardiake', page:1, pageSize:10, levels:'category' },
  new Map(),
);
assert.equal(advancedAlias.rows[0].code, 'I50');
assert.equal(advancedAlias.rows[0].albanianDraft, 'Pamjaftueshmëria e zemrës');
assert.equal(advancedAlias.rows[0].translationStatus, 'standardized');
assert.ok(advancedAlias.meta.search.supports.includes('editorial-alias'));

assert.equal(Terminology.TERMINOLOGY_VERSION, 'sq-terminology-2026.1');
assert.equal(Object.keys(Terminology.CHAPTER_TERMS).length, 22);
assert.ok(Object.keys(Terminology.CODE_TERMS).length >= 60);

console.log('Albanian ICD terminology standards, aliases, quality states and Chapter IX pilot passed.');
