'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('recetat.html');
const css = read('recetat-v2.css');
const js = read('recetat-v2.js');
const gemini = read('lib/gemini-prescription.js');

for (const id of ['rxOrderBuilder','rxAddDrugButton','rxSelectedDrugs','rxFreeTextPanel','rxClinicalReview','rxDosageChooser']) {
  assert.match(html, new RegExp(`id="${id}"`), `Missing structured eRx node #${id}`);
}
assert.match(html, /Barnat e recetës/);
assert.match(html, /Asnjë dozë nuk aplikohet pa veprimin tënd/);
assert.match(html, /Tekst i lirë \/ import manual/);
assert.match(html, /Formulo Signaturën me Gemini/);

assert.match(css, /electronic prescription workflow v4/);
assert.match(css, /\.rx-order-card/);
assert.match(css, /\.rx-order-grid/);
assert.match(css, /\.rx-final-review/);

assert.match(js, /function orderIssues\(/);
assert.match(js, /function structuredOrdersReady\(/);
assert.match(js, /function updateOrderField\(/);
assert.match(js, /function syncComposerFromOrders\(/);
assert.match(js, /clinicalReviewConfirmed/);
assert.match(js, /formatVersion:4/);
assert.match(js, /clinicalReview:state\.clinicalReviewConfirmed/);
assert.match(js, /reviewedAt:state\.clinicalReviewConfirmed \? now : ''/);
assert.match(js, /state\.clinicalReviewConfirmed/);
assert.match(js, /openDosageChooser\(drug, \[decision\.regimen\], options\)/, 'A single exact regimen must still require explicit clinician confirmation');
assert.doesNotMatch(js, /Skema e vetme me përputhje të saktë u auto-plotësua/);
assert.match(js, /Asnjë skemë nuk aplikohet pa konfirmimin tënd/);
assert.match(js, /getContext\?\.\(\)/);
assert.match(js, /#rxSelectedDrugs \.rx-order-card/);
assert.match(js, /getElementById\('rxOrderBuilder'\)/);
assert.doesNotThrow(() => new Function(js));

assert.match(gemini, /DEFAULT_MODEL = 'gemini-3\.7-flash'/);
assert.match(gemini, /DEFAULT_FALLBACK_MODEL = 'gemini-3\.6-flash'/);
assert.match(gemini, /allowProposal/);
assert.match(gemini, /signatureRespectsClinicianOrder/);
assert.match(gemini, /MOS nxirr, MOS propozo dhe MOS ndrysho dozën/);
assert.match(gemini, /targets\.some\(target => target\.allowProposal\)/);
assert.doesNotThrow(() => new Function(gemini));

console.log('Recetat V4 structured electronic-prescription workflow contract passed.');
