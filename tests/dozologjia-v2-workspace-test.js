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
assert.match(html, /dozologjia-v2\.css\?v=1/);
assert.match(html, /dozologjia-v2\.js\?v=1/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);

[
  'dosageContent','dosageSearch','dosageCount','pediatricInputs','pediatricInputsHint',
  'patientWeightKg','patientAgeMonths','patientAgeUnit','patientHeightCm',
  'pediatricCalculate','dosageStatus','dosageList',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `Missing #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.deepEqual(styles, ['/dozologjia-v2.css?v=1','/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v4']);
assert.deepEqual(scripts, ['/dozologjia-v2.js?v=1']);
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|dozologjia\.js|dozologjia-deep-audit\.js|style-loader|pediatric-calculator\.css|pediatric-calculator-client\.js/);

assert.match(css, /Dozologjia V2 — consolidated server-calculated pediatric workspace/);
assert.match(css, /#1c1e54/);
assert.match(css, /#533afd/);
assert.match(css, /\.dosage-v2-workspace/);
assert.match(css, /\.dosage-v2-patient-fields/);
assert.match(css, /\.pediatric-dose-primary/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

assert.match(js, /Dozologjia V2 — one runtime, server-calculated pediatric flow/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /\/api\/dosage\/search\?q=/);
assert.match(js, /\/api\/dosage\/product\//);
assert.match(js, /'\/api\/dosage\/calculate'/);
assert.match(js, /Browser-i vetëm renderon|server-calculated/i);
assert.doesNotMatch(client, /calculatePediatricDose|mgPerKg\s*\*|weightKg\s*\*/, 'Pediatric browser client must not own clinical arithmetic');
assert.doesNotThrow(() => new Function(js));

assert.match(worker, /\/dozologjia-v2\.css/);
assert.match(worker, /\/dozologjia-v2\.js/);
assert.doesNotMatch(worker, /['"]\/dozologjia\.js['"]/);

console.log('Dozologjia V2 unified sidebar and server-calculated pediatric contract passed.');
