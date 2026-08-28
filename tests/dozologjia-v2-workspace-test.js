'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('dozologjia.html');
const css = read('dozologjia-v2.css');
const js = read('dozologjia-v2.js');
const client = read('pediatric-calculator-client.js');
const worker = read('sw.js');

assert.match(html, /data-drx-app="dozologjia-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /class="nav-item is-active" href="\/dozologjia\.html" aria-current="page"/);
assert.match(html, /dozologjia-v2\.css\?v=3/);
assert.match(html, /dozologjia-v2\.js\?v=3/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);

[
  'dosageContent','dosageSearch','dosageSearchClear','dosageCount','dosageStatus','dosageList',
  'dosageFacetAll','dosageFacetReady','dosageFacetText','dosageFacetBlocked',
  'dosageProductPanel','dosageProductEmpty','dosageProductBody',
  'pediatricInputs','pediatricInputsHint','dosagePatientState','dosagePatientActionHint',
  'patientWeightKg','patientAgeMonths','patientAgeUnit','patientHeightCm','pediatricCalculate',
  'dosageCalculationPanel','dosageCalculationBody','dosageCopyResult',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.deepEqual(styles, ['/dozologjia-v2.css?v=3','/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v4']);
assert.deepEqual(scripts, ['/dozologjia-v2.js?v=3']);
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|dozologjia\.js|dozologjia-deep-audit\.js|style-loader|pediatric-calculator\.css|pediatric-calculator-client\.js/);

assert.match(css, /Dozologjia V3 — Stripe clinical workbench/);
assert.match(css, /#1c1e54/);
assert.match(css, /#533afd/);
assert.match(css, /\.dosage-console/);
assert.match(css, /\.dosage-catalog/);
assert.match(css, /\.dosage-workbench/);
assert.match(css, /\.dosage-filter-bar/);
assert.match(css, /\.pediatric-result-button/);
assert.match(css, /\.dosage-product-facts/);
assert.match(css, /\.dosage-patient-fields/);
assert.match(css, /\.pediatric-dose-primary/);
assert.match(css, /\.dosage-calculation-facts/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /linear-gradient|radial-gradient/, 'Clinical workbench must not add decorative gradients');

assert.match(js, /Dozologjia V3 — one runtime/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /\/api\/dosage\/search\?q=/);
assert.match(js, /\/api\/dosage\/product\//);
assert.match(js, /'\/api\/dosage\/calculate'/);
assert.match(js, /function setFilter\(filter\)/);
assert.match(js, /function validatePatientFields\(/);
assert.match(js, /function invalidateCalculation\(\)/);
assert.match(js, /function restoreFromUrl\(\)/);
assert.match(js, /function buildCopyText\(calculation\)/);
assert.match(js, /new AbortController\(\)/);
assert.match(js, /searchToken:0/);
assert.match(js, /productToken:0/);
assert.match(js, /calculationToken:0/);
assert.doesNotThrow(() => new Function(js));
assert.ok(
  js.includes(client.trim()),
  'Dozologjia bundle must embed the exact canonical pediatric calculator client',
);

const clientCode = client
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
assert.match(client, /OWNER_FLAG = 'server-v3'/);
assert.doesNotMatch(clientCode, /calculatePediatricDose|mgPerKg\s*\*|weightKg\s*\*|\/\s*concentration/i,
  'Pediatric browser client must not own clinical arithmetic');
assert.doesNotMatch(clientCode, /innerHTML/, 'V3 client must keep data rendering DOM-safe');

assert.match(worker, /\/dozologjia-v2\.css/);
assert.match(worker, /\/dozologjia-v2\.js/);
assert.doesNotMatch(worker, /['"]\/dozologjia\.js['"]/);

console.log('Dozologjia V3 Stripe workbench, resilient client state and server-calculated safety contract passed.');
