'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const workflow = read('icd-prescription-roundtrip.js');
const styles = read('icd-prescription-roundtrip.css');
const icdHtml = read('icd.html');
const rxHtml = read('recetat.html');

for (const marker of [
  "VERSION = 'icd-rx-roundtrip-v1'",
  "DRAFT_KEY = 'medindex_rx_autodraft_v1'",
  "RECENT_KEY = 'medindex_icd_recent_diagnoses_v1'",
  'MAX_RECENT = 6',
  'RECENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000',
  "new Set(['category', 'subcategory'])",
  'ICD_CODE_PATTERN',
  'savePrescriptionDraft',
  "url.searchParams.set('return', 'recetat')",
  'Diagnozat ICD të fundit',
  'data-mi-icd-recent-apply',
  'data-mi-open-icd',
  'decorateSavedCards',
  'Kthehu te receta',
  'medindex:icd-state',
  'medindex:icd-prescription-roundtrip-ready',
]) assert.ok(workflow.includes(marker), `ICD prescription round-trip missing ${marker}`);

assert.ok(rxHtml.includes('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1'));
assert.ok(icdHtml.includes('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1'));
assert.ok(
  rxHtml.indexOf('recetat.js?v=20260729-2') < rxHtml.indexOf('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1'),
  'Round-trip workflow must load after the prescription composer.',
);
assert.ok(
  icdHtml.indexOf('icd-detail-panel.js?v=icd-detail-panel-v3') < icdHtml.indexOf('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1'),
  'Round-trip workflow must load after the ICD detail panel.',
);

for (const marker of [
  '.rx-icd-recent',
  '.rx-icd-recent-list',
  '.rx-icd-saved-open',
  '.icd-return-prescription',
  '.icd-detail-return-prescription',
  'html[data-theme="dark"]',
  '@media(max-width:760px)',
  '@media(max-width:440px)',
  '@media(forced-colors:active)',
]) assert.ok(styles.includes(marker), `Round-trip stylesheet missing ${marker}`);

assert.doesNotMatch(workflow, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(styles, /https?:\/\//);
assert.match(workflow, /slice\(0, 20000\)/, 'Prescription draft composer must remain bounded.');
assert.match(workflow, /slice\(0, 1000\)/, 'Prescription diagnosis draft must remain bounded.');
assert.match(workflow, /seen\.has\(context\.code\)/, 'Recent diagnoses must be deduplicated.');
assert.match(workflow, /items\.slice\(0, MAX_RECENT\)/, 'Recent diagnosis storage must remain bounded.');

new Function(workflow);
console.log('ICD-prescription round-trip, bounded recent diagnoses and draft restoration contract passed.');
