'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const client = read('pediatric-calculator-client.js');
const bundle = read('dozologjia-v2.js');
const html = read('dozologjia.html');
const css = read('dozologjia-v2.css');
const code = client
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

assert.match(client, /document\.documentElement\.dataset\.pediatricCalculator = OWNER_FLAG/);
assert.match(client, /OWNER_FLAG = 'server-v3'/);
assert.match(bundle, /OWNER_FLAG = 'server-v3'/);
assert.doesNotMatch(html, /pediatric-calculator-client\.js|dozologjia\.js|tailadmin-/,
  'Dozologjia V3 owns one bundled runtime only');

for (const forbidden of [
  /weightKg\s*\*/,
  /\*\s*weightKg/,
  /\/\s*concentration/i,
  /Math\.min\s*\(\s*[^)]*max/i,
  /dose(?:Min|Max)\s*[*/]/,
]) assert.doesNotMatch(code, forbidden, `Client must not calculate doses: ${forbidden}`);

const payloadStart = client.indexOf('function patientPayload()');
const payloadEnd = client.indexOf('\n  function amountText(', payloadStart);
assert.ok(payloadStart >= 0 && payloadEnd > payloadStart, 'patientPayload() boundary missing');
const payloadBody = client.slice(payloadStart, payloadEnd);
for (const key of [
  'doseMin','doseMax','concentration','maxSingle','maxDaily','pediatric_','indication:','indicationId',
]) assert.ok(!payloadBody.includes(key), `Request body must not contain "${key}"`);
assert.match(payloadBody, /payload\.weightKg = weight/);
assert.match(payloadBody, /payload\.heightCm = height/);
assert.match(payloadBody, /const selectionId = state\.product\?\.calculationRegimen\?\.selectionId/);
assert.match(payloadBody, /if \(selectionId\) payload\.regimenId = selectionId/);

assert.match(client, /\/api\/dosage\/search\?q=\$\{encodeURIComponent\(query\)\}/);
assert.match(client, /\/api\/dosage\/product\/\$\{encodeURIComponent\(drugId\)\}/);
assert.match(client, /'\/api\/dosage\/calculate'/);
assert.match(client, /method:'POST'/);
assert.doesNotMatch(code, /fetch\('\/api\/dosage'[^/]/);

assert.doesNotMatch(code, /innerHTML/);
assert.match(client, /node\.textContent = String\(content\)/);

assert.match(client, /function applyPatientFields\(requires\)/);
assert.match(client, /function validatePatientFields\(/);
assert.match(client, /function invalidateCalculation\(\)/);
assert.match(client, /function setFilter\(filter\)/);
assert.match(client, /function setFormFilter\(value\)/);
assert.match(client, /function updateFormOptions\(\)/);
assert.match(html, /id="dosageFormFilter"/);
assert.match(client, /function renderSearchSkeleton\(\)/);
assert.match(client, /function renderListError\(message\)/);
assert.match(client, /function renderProductError\(message\)/);
assert.match(client, /new AbortController\(\)/);
assert.match(client, /searchToken:0/);
assert.match(client, /productToken:0/);
assert.match(client, /calculationToken:0/);
assert.match(client, /if \(token !== state\.searchToken/);
assert.match(client, /if \(token !== state\.productToken/);
assert.match(client, /if \(token !== state\.calculationToken/);

for (const field of ['weight','age','age-unit','height']) {
  assert.match(html, new RegExp(`data-patient-field="${field}"`), `Missing patient field ${field}`);
}
for (const id of [
  'patientWeightKg','patientAgeMonths','dosageSearch','dosageList','dosageStatus',
  'dosageProductBody','dosageCalculationBody','dosageCopyResult',
]) assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`);

assert.match(client, /Regjimi për llogaritje/);
assert.match(client, /calculationRegimen/);
assert.match(client, /item\.sourceKey === binding\.selectionId|item\.sourceKey === product\.calculationRegimen/);
assert.doesNotMatch(html, /id="(?:pediatric)?indication/i);

assert.match(client, /'Si u llogarit\?'/);
assert.match(client, /for \(const step of calculation\.steps\)/);
assert.doesNotMatch(code, /steps\.push/);

assert.match(client, /function restoreFromUrl\(\)/);
assert.match(client, /url\.searchParams\.set\('q'/);
assert.match(client, /url\.searchParams\.set\('drug'/);
assert.match(client, /function buildCopyText\(calculation\)/);
assert.match(client, /navigator\.clipboard\?\.writeText/);

assert.match(css, /--pk-touch:44px/);
assert.match(css, /\.pediatric-result-button[\s\S]*min-height:var\(--pk-touch\)/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /\.dosage-primary-button\{[\s\S]*min-height:38px/);
assert.match(css, /\.dosage-primary-button\{[\s\S]*@media\(max-width:760px\)[\s\S]*min-height:44px/);
assert.match(css, /overflow-wrap:anywhere/);

console.log('Pediatric calculator V3 UI passed: no client-side clinical math, race-safe requests, explicit states, filters and server-owned regimen binding.');
