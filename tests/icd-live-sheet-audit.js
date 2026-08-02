'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Terminology = require('../lib/icd-sq-terminology-v2.js');
const AdvancedIcd = require('../lib/icd-advanced-handler.js');
const RespiratoryTerms = require('../lib/icd-sq-terms-x.json');
const SymptomTerms = require('../lib/icd-sq-terms-xviii.json');

const SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0';
const SHEET_GID = 329283560;
const SOURCE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
const MAX_BYTES = 8 * 1024 * 1024;

async function loadCsv() {
  const localPath = String(process.env.ICD_CSV_PATH || '').trim();
  let csv;
  if (localPath) {
    csv = fs.readFileSync(localPath, 'utf8');
  } else {
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

(async () => {
  const csv = await loadCsv();
  const dataset = FullIcd.buildDataset(csv, { strictCounts:true });

  assert.deepEqual(dataset.counts, FullIcd.EXPECTED_COUNTS);
  assert.equal(dataset.terminology.version, 'sq-terminology-2026.2');
  assert.deepEqual(dataset.terminology.pilotChapters, ['IX', 'X', 'XVIII']);
  assert.equal(dataset.quality.verifiedTranslations, 0);
  assert.equal(dataset.quality.publicationReady, false);
  assert.ok(!dataset.nodes.some(node => /^loading\.{3}$/i.test(node.displayTitle)), 'Loading... leaked into a display title.');

  assertPackageCoverage(dataset, RespiratoryTerms, 'Chapter X terminology');
  assertPackageCoverage(dataset, SymptomTerms, 'Chapter XVIII terminology');

  const standardizedWithFlags = dataset.nodes
    .filter(node => ['standardized', 'verified'].includes(node.translationStatus))
    .filter(node => (node.terminologyFlags || []).length > 0)
    .map(node => ({ code:node.code, flags:node.terminologyFlags, title:node.displayTitle }));
  assert.deepEqual(standardizedWithFlags, [], 'Standardized terms must pass editorial lint.');

  const byCode = FullIcd.nodeMap(dataset);
  for (const code of ['I10', 'I50', 'J44', 'J44.1', 'J96.0', 'R06.0', 'R07.4', 'R30.0', 'R73.9']) {
    assert.ok(byCode.has(code), `Required clinical code ${code} is missing.`);
    assert.equal(byCode.get(code).translationStatus, 'standardized', `${code} is not standardized.`);
  }

  assert.equal(FullIcd.queryDataset(dataset, { q:'gulçim', pageSize:10 }).rows[0].code, 'R06.0');
  assert.equal(FullIcd.queryDataset(dataset, { q:'djegie gjatë urinimit', pageSize:10 }).rows[0].code, 'R30.0');

  const counts = childCounts(dataset);
  const generalCopd = AdvancedIcd._test.tablePayload(
    dataset,
    { q:'spok', page:1, pageSize:10, levels:'category,subcategory' },
    counts,
  );
  assert.equal(generalCopd.rows[0].code, 'J44', 'General SPOK query must not infer an acute exacerbation.');

  const exacerbation = AdvancedIcd._test.tablePayload(
    dataset,
    { q:'përkeqësim i spok', page:1, pageSize:10, levels:'category,subcategory' },
    counts,
  );
  assert.equal(exacerbation.rows[0].code, 'J44.1', 'Explicit SPOK exacerbation query should prefer J44.1.');

  const dyspnoea = AdvancedIcd._test.tablePayload(
    dataset,
    { q:'gulçim', page:1, pageSize:10, levels:'category,subcategory' },
    counts,
  );
  assert.equal(dyspnoea.rows[0].code, 'R06.0');
  assert.ok(!dyspnoea.rows.slice(0, 3).some(node => ['J45', 'J96.0'].includes(node.code)), 'Dyspnoea search must not infer asthma or respiratory failure.');

  const standardizedByChapter = Object.fromEntries(
    ['IX', 'X', 'XVIII'].map(chapter => [
      chapter,
      dataset.nodes.filter(node => node.chapter === chapter && node.translationStatus === 'standardized').length,
    ]),
  );

  console.log(JSON.stringify({
    sourceBytes:Buffer.byteLength(csv, 'utf8'),
    counts:dataset.counts,
    terminologyVersion:dataset.terminology.version,
    packageEntries:{
      respiratory:Object.keys(RespiratoryTerms).length,
      symptoms:Object.keys(SymptomTerms).length,
    },
    standardizedByChapter,
    quality:dataset.quality,
    clinicalSearchChecks:['SPOK → J44', 'përkeqësim i SPOK → J44.1', 'gulçim → R06.0'],
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
