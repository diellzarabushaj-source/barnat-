'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');
const Packages = {
  IV:require('../lib/icd-sq-terms-iv.json'),
  X:require('../lib/icd-sq-terms-x.json'),
  XI:require('../lib/icd-sq-terms-xi.json'),
  XIII:require('../lib/icd-sq-terms-xiii.json'),
  XIV:require('../lib/icd-sq-terms-xiv.json'),
  XVIII:require('../lib/icd-sq-terms-xviii.json'),
};

const SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0';
const SHEET_GID = 329283560;
const SOURCE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const MAX_BYTES = 8 * 1024 * 1024;
const PILOT_CHAPTERS = ['IV', 'IX', 'X', 'XI', 'XIII', 'XIV', 'XVIII'];
const EXPECTED_STANDARDIZED_BY_CHAPTER = Object.freeze({ IV:97, IX:79, X:118, XI:102, XIII:119, XIV:117, XVIII:210 });

async function loadCsv() {
  const localPath = String(process.env.ICD_CSV_PATH || '').trim();
  let csv;
  if (localPath) csv = fs.readFileSync(localPath, 'utf8');
  else {
    const response = await fetch(SOURCE, {
      headers:{ Accept:'text/csv,*/*;q=0.8', 'User-Agent':'MedIndex-ICD-Live-Audit/1.0' },
      signal:AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true, `Live ICD Sheet returned HTTP ${response.status}. Supply ICD_CSV_PATH when the Sheet is private.`);
    csv = await response.text();
  }
  assert.ok(csv.length > 1_000_000, 'ICD Sheet export is unexpectedly small.');
  assert.ok(Buffer.byteLength(csv, 'utf8') <= MAX_BYTES, 'ICD Sheet export exceeds the audit limit.');
  return csv;
}

function assertPackageCoverage(dataset, terms, label) {
  const byCode = FullIcd.nodeMap(dataset);
  const missing = Object.keys(terms).filter(code => !byCode.has(code));
  assert.deepEqual(missing, [], `${label} contains codes missing from the hierarchy: ${missing.join(', ')}`);
}

function childCounts(dataset) {
  const counts = new Map();
  for (const node of dataset.nodes) counts.set(node.parentCode, (counts.get(node.parentCode) || 0) + 1);
  return counts;
}

function advanced(dataset, counts, query) {
  return AdvancedIcd._test.tablePayload(dataset, { q:query, page:1, pageSize:10, levels:'category,subcategory' }, counts);
}

(async () => {
  const csv = await loadCsv();
  const dataset = FullIcd.buildDataset(csv, { strictCounts:true });
  assert.deepEqual(dataset.counts, FullIcd.EXPECTED_COUNTS);
  assert.equal(dataset.terminology.version, 'sq-terminology-2026.3');
  assert.deepEqual(dataset.terminology.pilotChapters, PILOT_CHAPTERS);
  assert.equal(dataset.quality.verifiedTranslations, 0);
  assert.equal(dataset.quality.standardizedTranslations, 857);
  assert.equal(dataset.quality.publicationReady, false);
  assert.ok(!dataset.nodes.some(node => /^loading\.{3}$/i.test(node.displayTitle)), 'Loading... leaked into a display title.');

  for (const [chapter, terms] of Object.entries(Packages)) assertPackageCoverage(dataset, terms, `Chapter ${chapter} terminology`);
  const standardizedWithFlags = dataset.nodes
    .filter(node => ['standardized', 'verified'].includes(node.translationStatus))
    .filter(node => (node.terminologyFlags || []).length > 0)
    .map(node => ({ code:node.code, flags:node.terminologyFlags, title:node.displayTitle }));
  assert.deepEqual(standardizedWithFlags, [], 'Standardized terms must pass editorial lint.');

  const byCode = FullIcd.nodeMap(dataset);
  for (const code of ['E11','I10','J44','K76.0','M54.5','N39.0','R06.0','R30.0']) {
    assert.ok(byCode.has(code), `Required clinical code ${code} is missing.`);
    assert.equal(byCode.get(code).translationStatus, 'standardized', `${code} is not standardized.`);
  }
  for (const chapter of PILOT_CHAPTERS) assert.ok(FullIcd.queryDataset(dataset, { chapter, pageSize:100 }).total > 0, `Chapter ${chapter} filtering returned no rows.`);

  const counts = childCounts(dataset);
  assert.equal(advanced(dataset, counts, 'diabet tip 2').rows[0].code, 'E11');
  assert.equal(advanced(dataset, counts, 'mëlçi yndyrore').rows[0].code, 'K76.0');
  assert.equal(advanced(dataset, counts, 'dhimbje mesi').rows[0].code, 'M54.5');
  assert.equal(advanced(dataset, counts, 'infeksion urinar').rows[0].code, 'N39.0');
  assert.equal(advanced(dataset, counts, 'spok').rows[0].code, 'J44');
  assert.equal(advanced(dataset, counts, 'përkeqësim i spok').rows[0].code, 'J44.1');
  assert.equal(advanced(dataset, counts, 'gulçim').rows[0].code, 'R06.0');
  const dysuria = advanced(dataset, counts, 'djegie gjatë urinimit');
  assert.equal(dysuria.rows[0].code, 'R30.0');
  assert.ok(!dysuria.rows.slice(0, 3).some(node => node.code === 'N39.0'), 'Dysuria must not infer urinary tract infection.');
  const abdominalPain = advanced(dataset, counts, 'dhimbje barku');
  assert.equal(abdominalPain.rows[0].code, 'R10');
  assert.ok(!abdominalPain.rows.slice(0, 3).some(node => ['K29','K35'].includes(node.code)), 'Abdominal pain must not infer gastritis or appendicitis.');

  const standardizedByChapter = Object.fromEntries(PILOT_CHAPTERS.map(chapter => [
    chapter,
    dataset.nodes.filter(node => node.chapter === chapter && node.translationStatus === 'standardized').length,
  ]));
  assert.deepEqual(standardizedByChapter, EXPECTED_STANDARDIZED_BY_CHAPTER);
  assert.deepEqual(dataset.quality.standardizedByChapter, EXPECTED_STANDARDIZED_BY_CHAPTER);

  console.log(JSON.stringify({
    sourceBytes:Buffer.byteLength(csv, 'utf8'),
    counts:dataset.counts,
    terminologyVersion:dataset.terminology.version,
    packageEntries:Object.fromEntries(Object.entries(Packages).map(([chapter, terms]) => [chapter, Object.keys(terms).length])),
    standardizedByChapter,
    quality:dataset.quality,
    clinicalSearchChecks:['diabet tip 2 → E11','mëlçi yndyrore → K76.0','dhimbje mesi → M54.5','infeksion urinar → N39.0','djegie gjatë urinimit → R30.0','dhimbje barku → R10'],
  }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
