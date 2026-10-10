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
assert.match(html, /id="pediatricCommonSearch"/);
assert.match(html, /id="pediatricCommonSections"/);
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
assert.ok(scripts.includes('/phase9-personal-entities-client.js?v=drx-phase9-personal-v3'));
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v7-focus-20261009'));
assert.ok(scripts.includes('/pediatric-common-liquid-core.js?v=10'));
assert.ok(scripts.includes('/pediatric-weight-age-core.js?v=1'));
assert.equal(pageRuntimes.length, 1, 'Dozologjia must own exactly one page runtime');

const cssVersion = styles[0]?.match(/^\/dozologjia-v2\.css\?v=(\d+(?:-audit-20261009)?)$/)?.[1] || '';
const jsVersion = pageRuntimes[0]?.match(/^\/dozologjia-v2\.js\?v=(\d+(?:-audit-20261009)?)$/)?.[1] || '';
assert.equal(cssVersion, jsVersion);
assert.ok(Number(cssVersion.split('-')[0]) >= 49);

assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
assert.match(html, /id="pediatricCommonSearch"[^>]*autocapitalize="none"[^>]*spellcheck="false"[^>]*enterkeyhint="search"/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /env\(safe-area-inset-left\)/);
assert.match(css, /\.dz-common-weight-quick button\{[\s\S]{0,200}?min-height:44px/);
assert.match(css, /\.dz-common-weight-field \.dz-number input\{[\s\S]{0,200}?font-size:30px/);
assert.match(css, /\.dz-common-volume-dose strong\{[\s\S]{0,200}?font-size:34px/);

assert.ok(js.endsWith(client));
assert.doesNotThrow(() => new Function(js));
assert.doesNotMatch(js, /innerHTML/);
assert.match(js, /pediatric-common-drugs-reference\.json/);
assert.match(js, /function renderCalculator\(/);
assert.match(js, /CLINICAL_AUDIT_URL = '\/data\/pediatric-clinical-audit-v1\.json'/);
assert.match(js, /function clinicalRuleFor\(/);
assert.match(js, /option\.mode === 'clinicalRules'/);
assert.match(js, /function renderEvidence\(/);
assert.match(js, /effectiveOptions\(drug\)/);
assert.match(js, /const dailyCaps = \[maxPerDay, dynamicDailyMax\]\.filter\(positiveNumber\)/);
assert.match(js, /Math\.min\(\.\.\.dailyCaps\)/);
assert.match(js, /Kalkulatori AUTO është i çaktivizuar/);
assert.match(js, /dz-common-calculator-blocked/);
assert.match(js, /50 barna · 10 ndarje · \$\{auditedDrugCount\(\)\} të audituara/);
assert.match(js, /practicalDrug\(drug\)/);
assert.match(js, /return \[\];[\s\S]{0,260}?original 50-drug table|original 50-drug table[\s\S]{0,260}?return \[\];/);
assert.match(js, /PA AUDIT KLINIK/);
assert.match(js, /AUTO është i bllokuar/);
assert.match(js, /Pa audit klinik · AUTO bllokuar/);
assert.match(html, /Të 50 barnat janë audituar klinikisht/);
assert.match(html, /AUTO bllokohet/);
assert.match(css, /\.dz-evidence-unverified/);
assert.match(css, /\.dz-common-head\{[\s\S]{0,260}?flex-direction:column/);
assert.match(css, /\.dz-common-head \.dz-status\{[\s\S]{0,260}?white-space:normal/);
assert.match(css, /\.dz-summary-audit\.is-unverified/);
assert.match(js, /Audit klinik · AUTO i bllokuar/);
assert.match(js, /dz-summary-audit is-blocked/);
assert.match(css, /\.dz-summary-audit\.is-blocked/);
assert.match(css, /\.dz-evidence/);
assert.match(css, /\.dz-evidence-warnings/);
assert.match(css, /\.dz-evidence-sources/);
assert.match(js, /dz-evidence-source-details/);
assert.match(css, /\.dz-evidence-source-details/);
assert.match(js, /function renderLiquidConversions\(/);
assert.match(js, /function resolvedAgeInfo\(/);
assert.match(js, /ageUnit === 'day'/);
assert.match(js, /function ageDays\(/);
assert.match(js, /ruleNeedsExactDays/);
assert.match(js, /optionNeedsExactDays/);
assert.match(js, /values\.ageUnit = 'day'/);
assert.match(js, /Number\.isFinite\(rule\?\.minDays\)/);
assert.match(js, /if \(ruleNeedsExactDays\(rule\)\) return false;/);
assert.match(js, /30\.4375/);
assert.match(js, /\['day','ditë'\]/);
assert.match(js, /const blockedAutoCount = \(\) =>/);
assert.match(js, /const activeAutoCount = \(\) =>/);
assert.match(js, /\$\{activeAutoCount\(\)\} AUTO/);
assert.match(js, /\$\{blockedAutoCount\(\)\} të bllokuara/);
assert.match(js, /function safeAgeBand\(/);
assert.match(js, /function addWeightShortcuts\(/);
assert.match(js, /uniqueDrug === drug/);
assert.match(js, /querySelectorAll\(':scope > details\.dz-common-drug\[open\]'\)/);

assert.match(js, /Format praktike/);
assert.match(js, /Flakon \(vial\)/);
assert.match(js, /Format tjera të disponueshme/);
assert.match(js, /Tabela bazë/);
assert.match(js, /Formula e dozimit/);
assert.match(js, /Format e disponueshme/);
assert.match(js, /sectionSq\(section\.title\)/);
assert.match(css, /\.dz-common-vial-card/);
assert.match(css, /\.dz-common-formulation-status/);
assert.match(css, /\.dz-common-age-auto/);

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
