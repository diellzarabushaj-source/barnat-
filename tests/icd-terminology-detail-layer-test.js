'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const detail = read('icd-terminology-detail.js');
const css = read('icd-terminology-detail.css');

for (const asset of [
  'icd-terminology-detail.css?v=icd-terminology-detail-v1',
  'icd-terminology-detail.js?v=icd-terminology-detail-v1',
]) assert.ok(html.includes(asset), `ICD terminology detail asset missing ${asset}`);

assert.ok(
  html.indexOf('icd-detail-panel.js?v=icd-detail-panel-v2')
    < html.indexOf('icd-terminology-detail.js?v=icd-terminology-detail-v1'),
  'Terminology detail enhancement must load after the base detail panel.',
);

for (const marker of [
  "const VERSION = 'icd-terminology-detail-v1'",
  "'machine-draft'",
  'Draft automatik',
  'Vetëm anglisht',
  'Standardizim editorial',
  'nuk përbën verifikim profesional përfundimtar',
  'icd-terminology-trust',
  'Kopjo kodin + titujt',
  'officialTitleEn',
  'requiresTerminologyReview',
  'professionalVerification',
  'medindex:icd-terminology-detail-ready',
]) assert.ok(detail.includes(marker), `Terminology detail runtime missing ${marker}`);

for (const marker of [
  '.icd-terminology-trust',
  '.icd-terminology-trust-grid',
  '.icd-terminology-clinical-note',
  '.is-standardized',
  '.is-machine',
  '.is-missing',
  'html[data-theme="dark"]',
  '@media(max-width:620px)',
  '@media(forced-colors:active)',
]) assert.ok(css.includes(marker), `Terminology detail CSS missing ${marker}`);

assert.doesNotMatch(detail, /translationStatus\s*:\s*['"]verified['"]/, 'The UI layer must never invent professional verification.');
assert.doesNotMatch(detail, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(css, /https?:\/\//);
new Function(detail);

console.log('ICD terminology trust, bilingual copy and provenance contracts passed.');
