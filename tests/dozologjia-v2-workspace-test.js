'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('dozologjia.html');
const css = read('dozologjia-v2.css');
const js = read('dozologjia-v2.js');
const client = read('dozologjia-master-client.js');
const commonReference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));

assert.match(html, /data-drx-app="dozologjia-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /class="nav-item is-active" href="\/dozologjia\.html" aria-current="page"/);
assert.match(html, /id="pediatricCommonReference"/);
for(const id of ['pediatricDrug','pediatricForm','pediatricStrength','pediatricWeight','pediatricAge','pediatricAgeUnit','pediatricAnswer'])assert.match(html,new RegExp(`id="${id}"`));
assert.doesNotMatch(html,/id="pediatricCommonSearch"|id="pediatricCommonSections"/);
assert.match(html, /Dozat pediatrike të barnave të zakonshme/);
assert.doesNotMatch(html, /class="dz-head/);

/* The old Master picker UI is intentionally gone from this page. */
[
  'masterReset','masterStatus','drugPicker','dosageSearch','masterDrugs',
  'indicationPicker','masterIndication','regimenPicker','masterRegimens',
  'masterForm','masterFields','masterGates','masterResult','masterErrors',
  'masterProvenance','masterProvenanceBody'
].forEach(id => assert.doesNotMatch(html, new RegExp(`id="${id}"`), `Legacy Master UI leaked back: #${id}`));
assert.doesNotMatch(client, /master-catalog|master-calculate|MASTER_WEIGHT_AGE_CORE|state\.regimen|function payload\(/);
assert.doesNotMatch(html, /Bari → indikacioni → pacienti → doza|Skema dhe mënyra e dhënies|Pacient i ri/);

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);
const pageRuntimes = scripts.filter(src => !/(?:phase9-personal-entities-client|sidebar-taxonomy-v3|pediatric-common-liquid-core|pediatric-weight-age-core|drx-runtime-telemetry)\.js/.test(src));

assert.equal(styles.length, 2, 'Dozologjia must keep exactly two stylesheet owners');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8-mobile-finish-20260930-audit-20261009');
assert.ok(scripts.includes('/phase9-personal-entities-client.js?v=drx-phase9-personal-v4'));
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v9-worker-ready-20261012'));
assert.ok(scripts.includes('/pediatric-common-liquid-core.js?v=10'));
assert.ok(scripts.includes('/pediatric-weight-age-core.js?v=1'));
assert.equal(pageRuntimes.length, 1, 'Dozologjia must own exactly one page runtime');

const cssVersion = styles[0]?.match(/^\/dozologjia-v2\.css\?v=(\d+(?:-[a-z0-9-]+)?)$/)?.[1] || '';
const jsVersion = pageRuntimes[0]?.match(/^\/dozologjia-v2\.js\?v=(\d+(?:-[a-z0-9-]+)?)$/)?.[1] || '';
assert.equal(cssVersion, jsVersion);
assert.ok(Number(cssVersion.split('-')[0]) >= 49);

assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
assert.match(html,/id="pediatricWeight"[^>]*inputmode="decimal"/);
assert.match(html,/id="pediatricAnswer"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(css,/@media\(max-width:760px\)/);
assert.match(css,/env\(safe-area-inset-bottom\)/);
assert.match(css,/env\(safe-area-inset-left\)/);
assert.ok(js.endsWith(client));assert.doesNotThrow(()=>new Function(js));
assert.doesNotMatch(js,/innerHTML/);
assert.doesNotMatch(client,/function renderDrug\(|function renderSections\(|function renderLiquidConversions\(/);
assert.match(js,/pediatric-common-drugs-reference\.json/);
assert.match(js,/const dailyCaps = \[maxPerDay, dynamicDailyMax\]\.filter\(positiveNumber\)/);
assert.match(js,/Math\.min\(\.\.\.dailyCaps\)/);
assert.match(js,/ruleNeedsExactDays/);assert.match(js,/if \(ruleNeedsExactDays\(rule\)\) return false;/);
assert.match(js,/referenceActive=source==='database' && Boolean\(marketCatalog\?\.revision\)/);
assert.match(js,/variantId:variant\.id/);assert.match(js,/ageConfirmed:byId\('pediatricAgeConfirmed'\)\.checked/);
assert.match(js,/result\.selectedMeasure/);assert.match(js,/id!==requestId/);
assert.match(js,/function renderEvidence\(/);assert.match(js,/Tabela bazë/);
assert.match(html,/AKKPM/);assert.match(html,/Mosha sugjerohet|mosha sugjerohet/);

assert.deepStrictEqual(
  commonReference.sections.map(section => [section.roman, section.title, section.drugs.length]),
  [
    ['I','Antibiotics',25],
    ['II','Anti- Helminthics',3],
    ['III','Analgesics',4],
    ['IV','Anti emetics',2],
    ['V','Anti Histaminic',5],
    ['VI','Antiviral Agents',2],
    ['VII','Bronchodilators',3],
    ['VIII','Steroids',1],
    ['IX','Anti Gastritis',3],
    ['X','Miscellaneous',2],
  ]
);
assert.equal(commonReference.sections.reduce((sum, section) => sum + section.drugs.length, 0), 50);

console.log('PASS: Dozologjia is pediatric-only, mobile-first, source-exact and free of the legacy Master picker UI');
