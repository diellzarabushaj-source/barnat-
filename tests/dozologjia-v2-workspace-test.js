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
assert.match(html, /dozologjia-v2\.css\?v=\d+/);
assert.match(html, /dozologjia-v2\.js\?v=\d+/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v6/);

[
  'dosageContent','dosageSearch','dosageSearchClear','dosageFormFilter','dosageCount','dosageStatus','dosageList',
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

assert.equal(styles.length, 2, 'Dozologjia must keep exactly two stylesheet owners');
assert.equal(scripts.length, 2, 'Dozologjia must keep exactly two script owners');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v6');
assert.equal(scripts[0], '/phase9-personal-entities-client.js?v=phase9b');

const dosageCssVersion = styles[0]?.match(/^\/dozologjia-v2\.css\?v=(\d+)$/)?.[1] || '';
const dosageJsVersion = scripts[1]?.match(/^\/dozologjia-v2\.js\?v=(\d+)$/)?.[1] || '';
assert.ok(dosageCssVersion, 'Dozologjia stylesheet must use a numeric cache version');
assert.ok(dosageJsVersion, 'Dozologjia runtime must use a numeric cache version');
assert.equal(dosageCssVersion, dosageJsVersion, 'Dozologjia CSS and JS cache versions must stay synchronized');
assert.ok(Number(dosageCssVersion) >= 4, 'Dozologjia asset version must not regress below v4');
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|dozologjia\.js|dozologjia-deep-audit\.js|style-loader|pediatric-calculator\.css|pediatric-calculator-client\.js/);
assert.match(html, /phase9-personal-entities-client\.js\?v=phase9b/);

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
assert.match(js, /function effectiveReadiness\(item\)/);
assert.match(js, /item\?\.readiness === 'CALCULATOR_READY' && item\?\.calculable !== true/);
assert.match(js, /function setFormFilter\(value\)/);
assert.match(js, /function updateFormOptions\(\)/);
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

/* Provenienca: klienti nuk guxon ta ulë pragun që serveri e mban.
   `lib/dose-calculator-handler.js` e pranon një burim vetëm si https; blloku i
   burimit në faqe duhet ta zbatojë të njëjtin prag, dhe vula «Verifikuar» nuk
   qëndron pa një burim që e mban. */
assert.match(
  client,
  /function safeExternalUrl\(value\)\s*\{[\s\S]*?url\.protocol === 'https:'/,
  'Only https may count as a linked clinical source, matching the server rule.'
);
assert.doesNotMatch(
  client,
  /\['http:', 'https:'\]\.includes\(url\.protocol\)/,
  'Plain http must not qualify as clinical provenance.'
);
assert.match(
  client,
  /const verified = url \? formatDate\(source\?\.verifiedAt\) : '';/,
  'The verified stamp must depend on the source that backs it.'
);
assert.match(
  client,
  /Burimi klinik nuk është i regjistruar me URL\./,
  'A source without a URL must say so rather than render as linked provenance.'
);

console.log('Dozologjia V3 Stripe workbench, resilient client state and server-calculated safety contract passed.');
