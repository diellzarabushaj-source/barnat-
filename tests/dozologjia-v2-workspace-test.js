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
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);

['dosageContent','dosageSearch','masterDrugs','masterIndication','masterRegimens','masterForm','masterFields','masterGates','masterResult','masterErrors','masterProvenance']
  .forEach(id=>assert.match(html,new RegExp(`id="${id}"`),`Dozologjia is missing #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);
const pageRuntimes = scripts.filter(src => !/(?:phase9-personal-entities-client|sidebar-taxonomy-v3|pediatric-common-liquid-core|pediatric-weight-age-core)\.js/.test(src));

assert.equal(styles.length, 2, 'Dozologjia must keep exactly two stylesheet owners');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8-responsive4');
assert.ok(scripts.includes('/phase9-personal-entities-client.js?v=phase9b'), 'Dozologjia personal entity runtime is missing');
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5-polish2-lazy'), 'Dozologjia shared sidebar runtime is missing');
assert.ok(scripts.includes('/pediatric-common-liquid-core.js?v=2'), 'Pediatric practical formulation conversion core is missing');
assert.ok(scripts.includes('/pediatric-weight-age-core.js?v=1'), 'Pediatric weight-to-age core is missing');
assert.equal(pageRuntimes.length, 1, 'Dozologjia must own exactly one page runtime in addition to shared runtimes');

const dosageCssVersion = styles[0]?.match(/^\/dozologjia-v2\.css\?v=(\d+)$/)?.[1] || '';
const dosageJsVersion = pageRuntimes[0]?.match(/^\/dozologjia-v2\.js\?v=(\d+)$/)?.[1] || '';
assert.ok(dosageCssVersion, 'Dozologjia stylesheet must use a numeric cache version');
assert.ok(dosageJsVersion, 'Dozologjia runtime must use a numeric cache version');
assert.equal(dosageCssVersion, dosageJsVersion, 'Dozologjia CSS and JS cache versions must stay synchronized');
assert.ok(Number(dosageCssVersion) >= 39, 'Dozologjia asset version must not regress below v39');
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|dozologjia\.js|dozologjia-deep-audit\.js|style-loader|pediatric-calculator\.css|pediatric-calculator-client\.js/);
assert.match(html, /phase9-personal-entities-client\.js\?v=phase9b/);

assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/, 'iOS safe-area viewport support is required');
assert.match(html, /id="pediatricCommonSearch"[^>]*autocapitalize="none"[^>]*spellcheck="false"[^>]*enterkeyhint="search"/, 'Pediatric search must be tuned for phone keyboards');


assert.match(js,/master-catalog/);
assert.match(js,/master-calculate/);
/* Every input change retires the standing answer before a new one is asked
   for, so a stale dose can never sit beside fresh patient values. */
assert.match(js,/token !== state\.revision/);
assert.match(js,/function invalidate\(\)/);
/* The page reads as one column of decisions, not as a form to submit. */
assert.doesNotMatch(html,/master-submit|Llogarit dozën/);
assert.match(html,/class="dz-column"/);
assert.match(css,/\.dz-card/);
assert.match(css,/@media\(max-width:760px\)/);
assert.ok(js.endsWith(read('dozologjia-master-client.js')));
assert.doesNotMatch(js,/innerHTML|mgPerKg/);
assert.doesNotThrow(()=>new Function(js));

/* The user-supplied pediatric reference is additive to Master v2.7. Its table
   wording stays frozen in JSON while the browser calculator performs arithmetic
   over those displayed formulas without becoming a second hidden dose source. */
const commonReference = JSON.parse(read('data/pediatric-common-drugs-reference.json'));
assert.match(html, /id="pediatricCommonReference"/);
assert.match(html, /id="pediatricCommonSearch"/);
assert.match(html, /id="pediatricCommonSections"/);
assert.match(js, /pediatric-common-drugs-reference\.json/);
assert.match(js, /function renderCalculator\(/);
assert.match(css, /\.dz-common-section/);
assert.match(css, /\.dz-common-volume/);
assert.match(css, /\.dz-common-weight-quick/);
assert.match(js, /function renderLiquidConversions\(/);
assert.match(js, /Format praktike/);
assert.match(js, /Flakon \(vial\)/);
assert.match(js, /Format tjera të disponueshme/);
assert.match(js, /Tabela bazë/);
assert.match(js, /Formula e dozimit/);
assert.match(js, /Format e disponueshme/);
assert.match(js, /sectionSq\(section\.title\)/);
assert.match(css, /\.dz-common-vial-card/);
assert.match(css, /\.dz-common-formulation-status/);
assert.match(js, /function addWeightShortcuts\(/);
assert.match(js, /function resolvedAgeInfo\(/);
assert.match(js, /MASTER_WEIGHT_AGE_CORE/);
assert.doesNotMatch(js, /const REFERENCE_AGES =/);
assert.match(js, /MOSHA AUTO NGA PESHA/);
assert.match(css, /\.dz-common-age-auto/);
assert.match(js, /function inferredAgeFitsRegimen\(/, 'Master auto-age must respect regimen age boundaries');
assert.match(js, /validAgeMonths\(/, 'Zero-month newborn age must remain representable');
assert.match(js, /uniqueDrug === drug/, 'A unique pediatric search result should open directly into its calculator');
assert.match(js, /querySelectorAll\(':scope > details\.dz-common-drug\[open\]'\)/, 'Phone drug cards must behave as a compact accordion');
assert.match(css, /env\(safe-area-inset-bottom\)/, 'Phone layout must respect the iPhone home indicator');
assert.match(css, /env\(safe-area-inset-left\)/, 'Landscape iPhone layout must respect the notch safe area');
assert.match(css, /\.dz-common-weight-quick button\{[\s\S]{0,180}?min-height:44px/, 'Quick weight chips must meet 44px touch targets on phones');
assert.match(css, /\.dz-common-weight-field \.dz-number input\{[\s\S]{0,180}?font-size:30px/, 'Weight must be the dominant mobile input');
assert.match(css, /\.dz-common-volume-dose strong\{[\s\S]{0,180}?font-size:34px/, 'Practical mL output must be visually dominant on phones');
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
assert.deepStrictEqual(commonReference.sections[0].drugs[0].dose, ['15mg/kg/dose q8h','Pneumonia – 80-90mg/kg/day']);
assert.deepStrictEqual(commonReference.sections[0].drugs[0].formulations, ['Syp – 125/5, 250/5','Cap – 250mg, 500mg','Dps – 100/1']);
assert.deepStrictEqual(commonReference.sections[5].drugs[1].dose, ['<3m – 12mg BD','3m -6m – 20mg BD','6m – 1yr – 25mg BD','>1y –','≤ 15kg – 30mgBD','15-23 kg – 45 mg BD','23-40kg – 60mg BD','>40kg – 75mg BD']);
assert.deepStrictEqual(commonReference.sections[8].drugs[2].formulations, ['Tab 150mg','Syp 75/5','Injection – 25mg/1 , 2ml ampoule']);
assert.deepStrictEqual(commonReference.sections[9].drugs[1].dose, ['50-150mg/kg/day']);

console.log('PASS: Master frontend ownership, shell, API wiring, pediatric reference and invalidation');
