'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const detail = read('icd-detail-panel.js');
const detailCss = read('icd-detail-workflow.css');
const bridge = read('prescription-bridge.js');
const contextCss = read('prescription-icd-context.css');

for (const marker of [
  'CONTEXT_VERSION = 2',
  "DETAIL_VERSION = 'clinical-detail-v3'",
  "DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2'",
  'diagnosisContext',
  "system:'ICD-10-WHO 2019'",
  "source:'medindex-icd-browser'",
  'selectedAt:Date.now()',
  'childCount',
  'Përdore në recetë',
  'Ka ${count} nënkode direkte',
  'Kopjo kodin',
  'safeHttpsUrl',
]) assert.ok(detail.includes(marker), `ICD detail workflow missing ${marker}`);

for (const marker of [
  "BRIDGE_VERSION = 'icd-context-v2'",
  "DIAGNOSIS_CONTEXT_KEY = 'medindex_rx_diagnosis_context_v2'",
  "LEGACY_DIAGNOSIS_KEY = 'medindex_rx_diagnosis_v1'",
  'CONTEXT_MAX_AGE = 30 * 60 * 1000',
  "new Set(['category', 'subcategory'])",
  'ICD_CODE_PATTERN',
  "url.hostname === 'icd.who.int'",
  'normalizeDiagnosisContext',
  'pendingContext',
  'existing && existing !== context.display && !force',
  'Kodi ICD-10 pret konfirmimin tënd',
  'diagnosisCoding',
  'persistContextAfterSave',
  'restoreSavedContext',
  "clearContext('manual-edit')",
  'rx-icd-saved-badge',
  'MAX_SELECTION_ITEMS = 50',
  'MAX_DRAFT_CHARS = 20000',
]) assert.ok(bridge.includes(marker), `Prescription ICD bridge missing ${marker}`);

assert.match(bridge, /selectedAt > Date\.now\(\) \+ 5 \* 60 \* 1000/);
assert.match(bridge, /Date\.now\(\) - selectedAt > CONTEXT_MAX_AGE/);
assert.match(bridge, /sessionStorage\.removeItem\(DIAGNOSIS_CONTEXT_KEY\)/);
assert.match(bridge, /sessionStorage\.removeItem\(LEGACY_DIAGNOSIS_KEY\)/);
assert.match(bridge, /const legacy = structured \? '' : sessionStorage\.getItem\(LEGACY_DIAGNOSIS_KEY\)/);
assert.match(bridge, /delete candidate\.diagnosisCoding/);
assert.match(bridge, /diagnosis === context\.display/);
assert.doesNotMatch(bridge, /url\.protocol === 'https:'\s*\?\s*url\.href/, 'WHO provenance must also enforce the hostname.');
assert.doesNotMatch(detail + bridge, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(detailCss + contextCss, /https?:\/\//);
assert.match(detailCss, /icd-detail-specificity/);
assert.match(detailCss, /@media\(max-width:620px\)/);
assert.match(contextCss, /rx-icd-context\.is-pending/);
assert.match(contextCss, /rx-icd-saved-badge/);
assert.match(contextCss, /@media\(max-width:440px\)/);
assert.match(contextCss, /@media\(forced-colors:active\)/);

new Function(detail);
new Function(bridge);

console.log('Structured ICD detail, isolated handoff storage and provenance persistence passed.');
