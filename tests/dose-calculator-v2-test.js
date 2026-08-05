'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const syntax = relativePath => execFileSync(process.execPath, ['--check', path.join(ROOT, relativePath)], { stdio:'pipe' });

syntax('api/dosage.js');
syntax('lib/dosage-handler.js');
syntax('lib/dose-calculator-handler.js');
syntax('registry-dose-calculator.js');
syntax('registry-dose-calculator-fast-ui.js');
syntax('registry-dose-table-button.js');
syntax('registry-dose-modal-accessibility.js');
syntax('registry-unified-table.js');

const apiSource = read('lib/dose-calculator-handler.js');
const routerSource = read('api/dosage.js');
const uiSource = read('registry-dose-calculator.js');
const fastUiSource = read('registry-dose-calculator-fast-ui.js');
const tableUiSource = read('registry-dose-table-button.js');
const modalA11ySource = read('registry-dose-modal-accessibility.js');
const unifiedSource = read('registry-unified-table.js');
const html = read('index.html');
const css = read('registry-dosage-columns.css');
const fastCss = read('registry-dose-calculator-fast-ui.css');
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
assert.match(apiSource, /Sesioni nuk është aktiv/);
assert.match(apiSource, /conversion_status/);
assert.match(routerSource, /view.*calculator/s);
assert.match(routerSource, /doseCalculatorHandler/);
assert.ok(vercel.rewrites.some(item => item.source === '/api/dose-calculator'
  && item.destination === '/api/dosage?view=calculator'), 'Dose calculator rewrite is missing');

assert.match(html, /registry-dose-calculator\.js\?v=/);
assert.match(html, /registry-dose-calculator-fast-ui\.js\?v=/);
assert.match(html, /registry-dose-calculator-fast-ui\.css\?v=/);
assert.match(html, /registry-dose-table-button\.js\?v=/);
assert.match(html, /registry-dose-table-button\.css\?v=/);
assert.match(html, /registry-dose-modal-accessibility\.js\?v=/);
assert.match(html, /registry-dosage-columns\.css\?v=/);
assert.match(uiSource, /Kalkulo dozën/);
assert.match(uiSource, /Indikacioni/);
assert.match(uiSource, /Grupmosha/);
assert.match(uiSource, /Mosha/);
assert.match(uiSource, /Pesha/);
assert.match(uiSource, /Preparati/);
assert.match(uiSource, /Si u llogarit\?/);
assert.match(uiSource, /Burimi zyrtar:/);
assert.match(uiSource, /nuk rekomandohet nën \$\{ageLabel\}/);
assert.match(uiSource, /tabletSplitAllowed/);
assert.match(uiSource, /Doza nuk mund të kalkulohet/);
assert.match(uiSource, /if \(!raw\) return null/);
assert.equal((uiSource.match(/root\.id = 'doseCalculatorModal'/g) || []).length, 1,
  'The registry must create exactly one reusable dose calculator modal');
assert.doesNotMatch(uiSource, /localStorage|sessionStorage/);
assert.match(css, /\.dose-calculator-modal/);
assert.match(css, /\.dose-calculator-result\.is-error/);
assert.match(css, /dose-calculator-group-pediatric_only/);

assert.match(fastUiSource, /Doza në 10 sekonda/);
assert.match(fastUiSource, /AUTO_DELAY_MS = 220/);
assert.match(fastUiSource, /WEIGHT_PRESETS/);
assert.match(fastUiSource, /inferGroupFromAge/);
assert.match(fastUiSource, /scheduleAutomaticCalculation/);
assert.match(fastUiSource, /modal\.submit\.click\(\)/);
assert.match(fastUiSource, /event\.key !== 'Enter'/);
assert.doesNotMatch(fastUiSource, /localStorage|sessionStorage/);
assert.match(fastCss, /dose-calculator-group-choices/);
assert.match(fastCss, /dose-calculator-weight-presets/);
assert.match(fastCss, /dose-calculator-fast-hidden/);

assert.match(tableUiSource, /dose-table-button-manual-qa-v5/);
assert.match(tableUiSource, /pendingRows = new Set\(\)/);
assert.match(tableUiSource, /FRAME_BUDGET_MS = 7/);
assert.match(tableUiSource, /requestIdleCallback/);
assert.match(tableUiSource, /requestAnimationFrame/);
assert.match(tableUiSource, /dataset\.doseTableSignature/);
assert.match(tableUiSource, /dataset\.doseHeaderMeta/);
assert.match(tableUiSource, /if \(!pendingRows\.size && headerDirty\)/,
  'Header counting must run only after the row queue is drained');
assert.match(tableUiSource, /\$\{readyCount\} në këtë faqe/);
assert.match(tableUiSource, /MutationObserver/);
assert.match(tableUiSource, /ignoredMutations/);
assert.match(tableUiSource, /tableScans/);
assert.match(tableUiSource, /headerUpdates/);
assert.match(tableUiSource, /maxRunMs/);
assert.match(tableUiSource, /metrics:\(\)/);
assert.equal((tableUiSource.match(/addEventListener\('click'/g) || []).length, 1,
  'The main table dose action must use one delegated click listener');
assert.doesNotMatch(tableUiSource, /replaceChildren|insertAdjacentHTML|\.innerHTML\s*=/,
  'The table polish layer must never rewrite calculator cell children');
assert.doesNotMatch(tableUiSource, /setAttribute\([^\n]+dose-calculator-open|classList\.add\('dose-table-button'/,
  'The table polish layer must not mutate calculator button markup');
assert.doesNotMatch(tableUiSource, /localStorage|sessionStorage/);
assert.match(tableCss, /position:\s*sticky\s*!important/);
assert.match(tableCss, /min-height:\s*44px/);
assert.match(tableCss, /touch-action:\s*manipulation/);
assert.match(tableCss, /aria-selected="true"/);
assert.match(tableCss, /\.dose-calculator-open::before/);
assert.match(tableCss, /\.dose-calculator-open::after/);
assert.match(tableCss, /content:\s*"Kalkulo"/);
assert.match(tableCss, /content:\s*"Doza"/);
assert.match(tableCss, /prefers-reduced-motion:\s*reduce/);
assert.match(tableCss, /forced-colors:\s*active/);
assert.match(tableCss, /@media print/);

assert.match(modalA11ySource, /dose-modal-accessibility-v2/);
assert.match(modalA11ySource, /restoreTriggerFocus/);
assert.match(modalA11ySource, /event\.key !== 'Tab'/);
assert.match(modalA11ySource, /Ky preparat nuk përdoret te fëmijët/);
assert.match(modalA11ySource, /Ky preparat nuk përdoret te të rriturit/);
assert.doesNotMatch(modalA11ySource, /setAttribute\('aria-expanded'/,
  'Modal accessibility must preserve calculator button innerHTML');
assert.doesNotMatch(modalA11ySource, /localStorage|sessionStorage/);

assert.match(unifiedSource, /'clinical-action', 'dose-calculator'/);
assert.match(unifiedSource, /DYNAMIC_KEYS = new Set\(\[[\s\S]*'dose-calculator'/);
assert.match(unifiedSource, /dataset\.registryDoseCalculatorColumn === 'dose-calculator'/);
assert.match(unifiedSource, /'dose-calculator':128/);
assert.match(unifiedSource, /key === 'dose-calculator'/);

const dosageApi = require(path.join(ROOT, 'api/dosage.js'));
const helpers = dosageApi._doseCalculatorTest;
assert.equal(dosageApi.isCalculatorRequest({ url:'/api/dosage?view=calculator' }), true);
assert.equal(dosageApi.isCalculatorRequest({ url:'/api/dosage' }), false);
assert.equal(helpers.groupCovers('pediatric_and_adult', 'pediatric_only'), true);
assert.equal(helpers.groupCovers('adult_only', 'pediatric_only'), false);
assert.equal(helpers.statusAllowed('verified'), true);
assert.equal(helpers.statusAllowed('draft'), false);
assert.equal(helpers.validHttps('https://cima.aemps.es/test'), true);
assert.equal(helpers.validHttps('http://example.test'), false);

const source = {
  source_key:'SRC-TEST', source_name:'SmPC zyrtare', publisher:'Autoriteti', source_type:'smPC',
  source_url:'https://example.test/smpc', document_date:'2026-01-01', section_page:'4.2',
};
const indication = { indication_name:'Ezofagit nga refluksi', icd_code:'K21.0' };
const rule = {
  rule_key:'RULE-TEST', indication_key:'IND-TEST', patient_group:'pediatric_and_adult',
  calculation_method:'fixed_dose', dose_min_value:40, dose_max_value:40, dose_unit:'mg', dose_basis:'per_dose',
  weight_basis:'none', frequency_mode:'once', times_per_day:1, max_single_dose_mg:40, max_daily_dose_mg:40,
  max_doses_24h:1, duration_mode:'range_days', duration_min_days:28, duration_max_days:56,
  min_age_months:144, route:'PO', out_of_range_action:'block', verified_by:'Clinical owner',
  verified_at:'2026-08-05T12:00:00Z', plain_language_template:'Jep 1 tabletë (40 mg) një herë në ditë.', version_no:1,
};
const link = { conversion_enabled:true, tablet_split_allowed:false, conversion_status:'automatic' };
const mappedRule = helpers.rulePublic(rule, indication, source, link);
assert.equal(mappedRule.doseMinValue, 40);
assert.equal(mappedRule.minAgeMonths, 144);
assert.equal(mappedRule.conversion.tabletSplitAllowed, false);
assert.equal(mappedRule.source.official, true);

const product = helpers.productPublic({
  product_key:'PROD-TEST', drug_id:'drug-id', registry_number:408, pdid:'1425',
  trade_name:'Pantoprazol Aristo 40 mg', active_substance:'Pantoprazole', atc_code:'A02BC02',
  pharmaceutical_form:'Gastro-resistant tablet', route:'PO', patient_group:'pediatric_and_adult',
  numerator_value:40, numerator_unit:'mg', denominator_value:1, denominator_unit:'tablet',
  tablet_split_denominator:1, is_scored:false, rounding_mode:'exact', version_no:1,
}, [mappedRule]);
assert.equal(product.pdid, '1425');
assert.equal(product.rules.length, 1);
assert.equal(product.denominatorUnit, 'tablet');
assert.equal(product.patientGroup, 'pediatric_and_adult');

console.log('Dose calculator V2, 10-second workflow and HTML-preserving canonical table contract passed.');
