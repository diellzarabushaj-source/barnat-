'use strict';

const assert = require('node:assert/strict');
const {
  EXPECTED_COUNTS,
  buildDataset,
  firstHeaderRecord,
  queryDataset,
  translationStatus,
  stripPresentation,
} = require('../lib/icd-full-hierarchy.js');

const PILOT_CHAPTERS = ['IV', 'IX', 'X', 'XI', 'XIII', 'XIV', 'XVIII'];
const csv = [
  ['ICD-10 WHO 2019 — KLASIFIKIMI I PLOTË'],
  ['Niveli','Kapitulli','Blloku','Kodi ICD-10','Titulli zyrtar — English','Titulli — Shqip','Kodi prind','WHO','Kapitulli','Intervali'],
  ['KAPITULL','I','','I','Chapter I — Certain infectious and parasitic diseases (A00-B99)','Loading...','','WHO ↗','',''],
  ['BLLOK','I','A00-A09','A00-A09','▸ A00-A09 Intestinal infectious diseases','▸ A00-A09 Sëmundjet infektive të zorrëve','I','WHO ↗','',''],
  ['KATEGORI','I','A00-A09','A00','  ▹ Cholera','▹ Kolera','A00-A09','WHO ↗','',''],
  ['NËNKATEGORI','I','A00-A09','A00.0','    • Cholera due to Vibrio cholerae 01, biovar cholerae','Loading...','A00','WHO ↗','',''],
  ['NËNKATEGORI','I','A00-A09','A00.1','    • Cholera due to Vibrio cholerae 01, biovar eltor','• Kolera për shkak të Vibrio cholerae 01, biovar eltor','A00','WHO ↗','',''],
].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');

assert.deepEqual(EXPECTED_COUNTS, { chapter:22, block:274, category:2050, subcategory:10196, total:12542 });
assert.equal(translationStatus('Loading...'), 'missing');
assert.equal(translationStatus(''), 'missing');
assert.equal(translationStatus('Kolera'), 'machine-draft');
assert.equal(stripPresentation('▸ A00-A09 Intestinal infectious diseases', 'block'), 'Intestinal infectious diseases');
assert.equal(stripPresentation('    • Cholera, unspecified', 'subcategory'), 'Cholera, unspecified');
assert.deepEqual(firstHeaderRecord(['I', ''], ['Kapitulli', 'Kapitulli']), { Kapitulli:'I' });

const dataset = buildDataset(csv, { strictCounts:false });
assert.equal(dataset.nodes.length, 5);
assert.deepEqual(dataset.counts, { chapter:1, block:1, category:1, subcategory:2, total:5 });
assert.equal(dataset.quality.missingTranslations, 1);
assert.equal(dataset.quality.machineDraftTranslations, 3);
assert.equal(dataset.quality.standardizedTranslations, 1);
assert.equal(dataset.quality.verifiedTranslations, 0);
assert.equal(dataset.quality.publicationReady, false);
assert.equal(dataset.quality.terminologyVersion, 'sq-terminology-2026.3');
assert.deepEqual(dataset.quality.pilotChapters, PILOT_CHAPTERS);
assert.deepEqual(dataset.terminology.pilotChapters, PILOT_CHAPTERS);

const chapter = dataset.nodes.find(node => node.code === 'I');
const block = dataset.nodes.find(node => node.code === 'A00-A09');
const category = dataset.nodes.find(node => node.code === 'A00');
const missing = dataset.nodes.find(node => node.code === 'A00.0');
const translated = dataset.nodes.find(node => node.code === 'A00.1');
assert.equal(chapter.chapter, 'I');
assert.equal(chapter.displayTitle, 'Sëmundje të caktuara infektive dhe parazitare');
assert.equal(chapter.translationStatus, 'standardized');
assert.equal(block.parentCode, 'I');
assert.equal(category.parentCode, 'A00-A09');
assert.equal(missing.translationStatus, 'missing');
assert.equal(missing.displayTitle, 'Cholera due to Vibrio cholerae 01, biovar cholerae');
assert.equal(translated.displayTitle, 'Kolera për shkak të Vibrio cholerae 01, biovar eltor');
assert.ok(!dataset.nodes.some(node => node.displayTitle === 'Loading...'));
assert.equal(queryDataset(dataset, { parent:'A00', pageSize:10 }).total, 2);
assert.equal(queryDataset(dataset, { chapter:'I', pageSize:10 }).total, 5);
assert.equal(queryDataset(dataset, { q:'A00.1', pageSize:10 }).rows[0].code, 'A00.1');
assert.equal(queryDataset(dataset, { q:'kolera eltor', pageSize:10 }).rows[0].code, 'A00.1');
assert.equal(queryDataset(dataset, { q:'intestinal infectious', pageSize:10 }).rows[0].code, 'A00-A09');
assert.throws(() => buildDataset(csv.replace('A00.1','A00.0'), { strictCounts:false }), /Kodi i dyfishtë/);
const missingParentCsv = csv.replace('"A00","WHO ↗"', '"A99","WHO ↗"');
assert.throws(() => buildDataset(missingParentCsv, { strictCounts:false }), /prindi A99 nuk ekziston/);

console.log('ICD-10 full hierarchy, duplicate-header safety and terminology 2026.3 tests passed.');
