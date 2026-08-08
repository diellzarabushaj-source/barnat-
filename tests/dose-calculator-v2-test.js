'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const syntax = relativePath => execFileSync(process.execPath, ['--check', path.join(ROOT, relativePath)], { stdio:'pipe' });

[
  'api/dosage.js',
  'lib/dosage-handler.js',
  'lib/dose-calculator-handler.js',
  'registry-dose-calculator.js',
  'registry-dose-table-button.js',
  'registry-dose-modal-accessibility.js',
  'registry-unified-table.js',
].forEach(syntax);

const apiSource = read('lib/dose-calculator-handler.js');
const routerSource = read('api/dosage.js');
const uiSource = read('registry-dose-calculator.js');
const tableUiSource = read('registry-dose-table-button.js');
const modalA11ySource = read('registry-dose-modal-accessibility.js');
const unifiedSource = read('registry-unified-table.js');
const html = read('index.html');
const css = read('registry-dosage-columns.css');
const tableCss = read('registry-dose-table-button.css');
const vercel = JSON.parse(read('vercel.json'));

assert.match(apiSource, /dose_sources_v2/);
assert.match(apiSource, /dose_indications_v2/);
assert.match(apiSource, /dose_products_v2/);
assert.match(apiSource, /dose_rules_v2/);
assert.match(apiSource, /dose_rule_products_v2/);
assert.match(apiSource, /editorial_status.*in\.\(verified,published\)/s);
assert.match(apiSource, /officialVerifiedOnly:true/);
assert.match(apiSource, /failClosed:true/);
assert.match(apiSource, /validHttps/);
assert.match(apiSource, /verified_by/);
assert.match(apiSource, /verified_at/);
assert.match(apiSource, /linkEligible/);
assert.match(routerSource, /view.*calculator/s);
assert.ok(vercel.rewrites.some(item => item.source === '/api/dose-calculator'
  && item.destination === '/api/dosage?view=calculator'), 'Dose calculator rewrite is missing');

assert.match(html, /registry-dose-calculator\.js\?v=20260809-1/);
assert.match(html, /registry-dose-modal-accessibility\.js\?v=20260809-1/);
assert.doesNotMatch(html, /registry-dose-calculator-fast-ui\.(?:js|css)/);
assert.match(html, /registry-dose-table-button\.js\?v=/);
assert.match(html, /registry-dose-table-button\.css\?v=/);

assert.match(uiSource, /registry-dose-calculator-v2\.2\.0/);
assert.match(uiSource, /Indikacioni/);
assert.match(uiSource, /Mosha/);
assert.match(uiSource, /Pesha/);
assert.match(uiSource, /Rezultati llogaritet automatikisht/);
assert.match(uiSource, /maybeCalculate/);
assert.match(uiSource, /ageMatchedRules/);
assert.match(uiSource, /modal\.indicationWrap\.hidden = indications\.size <= 1/);
assert.match(uiSource, /modal\.weightWrap\.hidden = !needsWeight/);
assert.match(uiSource, /if \(ageMonths === null\) return \[\]/);
assert.match(uiSource, /Kopjo udhëzimin/);
assert.match(uiSource, /Pacient i ri/);
assert.match(uiSource, /Si u llogarit\?/);
assert.match(uiSource, /Burimi zyrtar:/);
assert.match(uiSource, /Konvertimi në .* kërkon verifikim manual/);
assert.match(uiSource, /tabletSplitAllowed/);
assert.match(uiSource, /MAX_AGE_MONTHS/);
assert.match(uiSource, /MAX_WEIGHT_KG/);
assert.doesNotMatch(uiSource, /data-dose-group|Grupmosha|ADULT_MONTHS/,
  'Age bands must be authoritative; there must be no manual or hard-coded adult-group gate');
assert.doesNotMatch(uiSource, /dose-calculator-submit/,
  'The canonical flow must not require a second calculate click');
assert.equal((uiSource.match(/root\.id = 'doseCalculatorModal'/g) || []).length, 1,
  'The registry must create exactly one reusable dose calculator modal');
assert.doesNotMatch(uiSource, /localStorage|sessionStorage/);

assert.match(uiSource, /conversion\.status === 'automatic'/);
assert.match(uiSource, /conversion\.status === 'not_allowed'/);
assert.match(uiSource, /Konvertimi automatik në këtë preparat nuk lejohet/);

assert.match(tableUiSource, /pendingRows = new Set\(\)/);
assert.equal((tableUiSource.match(/addEventListener\('click'/g) || []).length, 1);
assert.doesNotMatch(tableUiSource, /replaceChildren|insertAdjacentHTML|\.innerHTML\s*=/);
assert.match(tableCss, /position:\s*sticky\s*!important/);
assert.match(tableCss, /min-height:\s*44px/);
assert.match(tableCss, /\.dose-calculator-open::before/);
assert.match(tableCss, /content:\s*"Kalkulo"/);
assert.match(tableCss, /prefers-reduced-motion:\s*reduce/);
assert.match(tableCss, /forced-colors:\s*active/);
assert.match(tableCss, /@media print/);
assert.match(css, /\.dose-calculator-modal/);
assert.match(css, /\.dose-calculator-result\.is-error/);

assert.match(modalA11ySource, /dose-modal-accessibility-v3/);
assert.match(modalA11ySource, /restoreTriggerFocus/);
assert.match(modalA11ySource, /event\.key !== 'Tab'/);
assert.doesNotMatch(modalA11ySource, /Grupmosha|data-dose-group/);
assert.doesNotMatch(modalA11ySource, /localStorage|sessionStorage/);

assert.match(unifiedSource, /'clinical-action', 'dose-calculator'/);
assert.match(unifiedSource, /DYNAMIC_KEYS = new Set\(\[[\s\S]*'dose-calculator'/);
assert.match(unifiedSource, /dataset\.registryDoseCalculatorColumn === 'dose-calculator'/);

const dosageApi = require(path.join(ROOT, 'api/dosage.js'));
const helpers = dosageApi._doseCalculatorTest;
assert.equal(dosageApi.isCalculatorRequest({ url:'/api/dosage?view=calculator' }), true);
assert.equal(dosageApi.isCalculatorRequest({ url:'/api/dosage' }), false);
assert.equal(helpers.statusAllowed('verified'), true);
assert.equal(helpers.statusAllowed('draft'), false);
assert.equal(helpers.validHttps('https://dailymed.nlm.nih.gov/test'), true);
assert.equal(helpers.validHttps('http://example.test'), false);

const ruleMap = new Map([['RULE-TEST', { rule_key:'RULE-TEST' }]]);
assert.equal(helpers.linkEligible({
  product_key:'PROD-TEST', rule_key:'RULE-TEST', editorial_status:'verified',
  conversion_enabled:false, conversion_status:'not_allowed',
}, ruleMap), true, 'A valid clinical rule must survive even when product-unit conversion is not allowed');
assert.equal(helpers.linkEligible({ product_key:'PROD-TEST', rule_key:'RULE-TEST', editorial_status:'draft' }, ruleMap), false);

const source = {
  source_key:'SRC-TEST', source_name:'SmPC zyrtare', publisher:'Autoriteti', source_type:'smPC',
  source_url:'https://example.test/smpc', document_date:'2026-01-01', section_page:'4.2',
};
const indication = { indication_name:'Dhimbje', icd_code:'R52' };
const rule = {
  rule_key:'RULE-TEST', indication_key:'IND-TEST', patient_group:'pediatric_and_adult',
  calculation_method:'fixed_dose', dose_min_value:200, dose_max_value:400, dose_unit:'mg', dose_basis:'per_dose',
  weight_basis:'none', frequency_mode:'interval', interval_min_hours:4, interval_max_hours:6,
  max_single_dose_mg:400, max_daily_dose_mg:1200, max_doses_24h:6,
  duration_mode:'prn', min_age_months:144, route:'PO', out_of_range_action:'block',
  verified_by:'Clinical owner', verified_at:'2026-08-09T00:00:00Z', version_no:1,
};
const link = { conversion_enabled:false, tablet_split_allowed:false, conversion_status:'not_allowed' };
const mappedRule = helpers.rulePublic(rule, indication, source, link);
assert.equal(mappedRule.minAgeMonths, 144);
assert.equal(mappedRule.conversion.enabled, false);
assert.equal(mappedRule.conversion.status, 'not_allowed');
assert.equal(mappedRule.source.official, true);

console.log('Dose calculator V2.2 shared-engine, adaptive-flow and fail-closed contract passed.');
