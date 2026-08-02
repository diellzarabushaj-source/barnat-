'use strict';

const assert = require('node:assert/strict');
const Terminology = require('../lib/icd-sq-terminology-v2.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');

const PILOT_CHAPTERS = ['IV', 'IX', 'X', 'XI', 'XIII', 'XIV', 'XVIII'];
function node(code, chapter, englishTitle, albanianDraft = '', level = 'category', block = '', parentCode = '') {
  return Terminology.applyNode({ code, level, chapter, block, parentCode, englishTitle, albanianDraft, displayTitle:albanianDraft || englishTitle });
}

const samples = {
  diabetes:node('E11', 'IV', 'Type 2 diabetes mellitus', 'Diabet tip 2'),
  hypertension:node('I10', 'IX', 'Essential (primary) hypertension', 'Hipertension esencial primar'),
  copd:node('J44', 'X', 'Other chronic obstructive pulmonary disease', 'COPD'),
  fattyLiver:node('K76.0', 'XI', 'Fatty (change of) liver, not elsewhere classified', 'Mëlçia yndyrore'),
  lowBackPain:node('M54.5', 'XIII', 'Low back pain', 'Dhimbje të shpinës së poshtme'),
  uti:node('N39.0', 'XIV', 'Urinary tract infection, site not specified', 'Infeksion urinar'),
  dyspnoea:node('R06.0', 'XVIII', 'Dyspnoea', ''),
  untouched:node('G00', 'VI', 'Bacterial meningitis, not elsewhere classified', 'Meningjiti bakterial'),
  missing:node('G01', 'VI', 'Meningitis in bacterial diseases classified elsewhere', ''),
};

assert.equal(samples.diabetes.displayTitle, 'Diabeti mellitus i tipit 2');
assert.ok(samples.diabetes.searchText.includes('diabet tip 2'));
assert.equal(samples.diabetes.terminologySource, 'medindex-editorial-pilot-iv');
assert.equal(samples.hypertension.terminologySource, 'medindex-editorial-pilot-ix');
assert.equal(samples.copd.terminologySource, 'medindex-editorial-pilot-x');
assert.equal(samples.fattyLiver.displayTitle, 'Steatoza hepatike, e paklasifikuar diku tjetër');
assert.ok(samples.fattyLiver.searchText.includes('melci yndyrore'));
assert.equal(samples.fattyLiver.terminologySource, 'medindex-editorial-pilot-xi');
assert.equal(samples.lowBackPain.displayTitle, 'Dhimbja e mesit');
assert.equal(samples.lowBackPain.terminologySource, 'medindex-editorial-pilot-xiii');
assert.equal(samples.uti.displayTitle, 'Infeksioni i traktit urinar, vendi i paspecifikuar');
assert.equal(samples.uti.terminologySource, 'medindex-editorial-pilot-xiv');
assert.equal(samples.dyspnoea.displayTitle, 'Dispnea');
assert.equal(samples.dyspnoea.terminologySource, 'medindex-editorial-pilot-xviii');
assert.equal(samples.untouched.translationStatus, 'machine-draft');
assert.equal(samples.missing.translationStatus, 'missing');
assert.ok(samples.missing.terminologyFlags.includes('MISSING_ALBANIAN'));
assert.ok(!Terminology.lintTitle('Pamundësi për të të ushqyer', 'Feeding difficulty').includes('DUPLICATED_WORD'));
assert.ok(Terminology.lintTitle('Dhimbje dhimbje abdominale', 'Abdominal pain').includes('DUPLICATED_WORD'));

const summary = Terminology.quality(Object.values(samples));
assert.equal(summary.standardizedTranslations, 7);
assert.equal(summary.machineDraftTranslations, 1);
assert.equal(summary.missingTranslations, 1);
assert.equal(summary.terminologyCoverage, 77.78);
assert.equal(summary.translationCoverage, 88.89);
assert.equal(summary.publicationReady, false);
assert.deepEqual(summary.pilotChapters, PILOT_CHAPTERS);
assert.deepEqual(summary.standardizedByChapter, { IV:1, IX:1, X:1, XI:1, XIII:1, XIV:1, XVIII:1 });

const rows = [
  ['KAPITULL','IV','','IV','Chapter IV — Endocrine nutritional and metabolic diseases','Loading...',''],
  ['BLLOK','IV','E10-E14','E10-E14','Diabetes mellitus','Loading...','IV'],
  ['KATEGORI','IV','E10-E14','E11','Type 2 diabetes mellitus','Loading...','E10-E14'],
  ['KAPITULL','XI','','XI','Chapter XI — Diseases of the digestive system','Loading...',''],
  ['BLLOK','XI','K70-K77','K70-K77','Diseases of liver','Loading...','XI'],
  ['KATEGORI','XI','K70-K77','K76','Other diseases of liver','Loading...','K70-K77'],
  ['NËNKATEGORI','XI','K70-K77','K76.0','Fatty (change of) liver not elsewhere classified','Loading...','K76'],
  ['KAPITULL','XIII','','XIII','Chapter XIII — Diseases of the musculoskeletal system and connective tissue','Loading...',''],
  ['BLLOK','XIII','M50-M54','M50-M54','Other dorsopathies','Loading...','XIII'],
  ['KATEGORI','XIII','M50-M54','M54','Dorsalgia','Loading...','M50-M54'],
  ['NËNKATEGORI','XIII','M50-M54','M54.5','Low back pain','Loading...','M54'],
  ['KAPITULL','XIV','','XIV','Chapter XIV — Diseases of the genitourinary system','Loading...',''],
  ['BLLOK','XIV','N30-N39','N30-N39','Other diseases of urinary system','Loading...','XIV'],
  ['KATEGORI','XIV','N30-N39','N39','Other disorders of urinary system','Loading...','N30-N39'],
  ['NËNKATEGORI','XIV','N30-N39','N39.0','Urinary tract infection site not specified','Loading...','N39'],
  ['KAPITULL','XVIII','','XVIII','Chapter XVIII — Symptoms signs and abnormal findings','Loading...',''],
  ['BLLOK','XVIII','R10-R19','R10-R19','Symptoms involving digestive system and abdomen','Loading...','XVIII'],
  ['KATEGORI','XVIII','R10-R19','R10','Abdominal and pelvic pain','Loading...','R10-R19'],
  ['BLLOK','XVIII','R30-R39','R30-R39','Symptoms involving urinary system','Loading...','XVIII'],
  ['KATEGORI','XVIII','R30-R39','R30','Pain associated with micturition','Loading...','R30-R39'],
  ['NËNKATEGORI','XVIII','R30-R39','R30.0','Dysuria','Loading...','R30'],
];
const csv = [
  'Niveli,Kapitulli,Blloku,Kodi ICD-10,Titulli zyrtar — English,Titulli — Shqip,Kodi prind',
  ...rows.map(row => row.map(value => `"${value}"`).join(',')),
].join('\n');
const dataset = FullIcd.buildDataset(csv, { strictCounts:false });
assert.equal(dataset.terminology.version, 'sq-terminology-2026.3');
assert.deepEqual(dataset.terminology.pilotChapters, PILOT_CHAPTERS);
assert.equal(FullIcd.queryDataset(dataset, { q:'diabet tip 2', pageSize:10 }).rows[0].code, 'E11');
assert.equal(FullIcd.queryDataset(dataset, { q:'mëlçi yndyrore', pageSize:10 }).rows[0].code, 'K76.0');
assert.equal(FullIcd.queryDataset(dataset, { q:'dhimbje mesi', pageSize:10 }).rows[0].code, 'M54.5');
assert.equal(FullIcd.queryDataset(dataset, { q:'infeksion urinar', pageSize:10 }).rows[0].code, 'N39.0');

const childCounts = new Map();
for (const item of dataset.nodes) childCounts.set(item.parentCode, (childCounts.get(item.parentCode) || 0) + 1);
const dysuria = AdvancedIcd._test.tablePayload(dataset, { q:'djegie gjatë urinimit', page:1, pageSize:10, levels:'category,subcategory' }, childCounts);
assert.equal(dysuria.rows[0].code, 'R30.0');
assert.ok(!dysuria.rows.slice(0, 3).some(item => item.code === 'N39.0'));
const abdominalPain = AdvancedIcd._test.tablePayload(dataset, { q:'dhimbje barku', page:1, pageSize:10, levels:'category,subcategory' }, childCounts);
assert.equal(abdominalPain.rows[0].code, 'R10');
assert.ok(!abdominalPain.rows.slice(0, 3).some(item => ['K29','K35'].includes(item.code)));

assert.equal(Terminology.TERMINOLOGY_VERSION, 'sq-terminology-2026.3');
assert.equal(Object.keys(Terminology.CHAPTER_TERMS).length, 22);
assert.ok(Object.keys(Terminology.CODE_TERMS).length >= 800);

console.log('Albanian ICD terminology and symptom-safety tests for seven chapters passed.');
