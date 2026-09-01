'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const drugSearch = require('../api/drug-search.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'registry-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'registry-v2.js'), 'utf8');
const doseCss = fs.readFileSync(path.join(root, 'registry-v2-dose-calculator.css'), 'utf8');
const doseJs = fs.readFileSync(path.join(root, 'registry-v2-dose-calculator.js'), 'utf8');
const doseRuntime = fs.readFileSync(path.join(root, 'dose-runtime-browser.js'), 'utf8');

assert.match(html, /data-drx-app="registry-v2"/);
assert.match(html, /\/registry-v2\.css\?v=[^"\s]+/);
assert.match(html, /\/registry-v2\.js\?v=[^"\s]+/);
assert.match(html, /\/registry-v2-dose-calculator\.css\?v=[^"\s]+/);
assert.match(html, /\/dose-core\.js\?v=drx-dose-core-v1/);
assert.match(html, /\/dose-runtime-browser\.js\?v=drx-dose-runtime-browser-v1/);
assert.match(html, /\/registry-v2-dose-calculator\.js\?v=[^"\s]+/);
assert.match(html, /\/drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v6/);

const corePos=html.indexOf('/dose-core.js');
const runtimePos=html.indexOf('/dose-runtime-browser.js');
const registryPos=html.indexOf('/registry-v2.js');
const calculatorPos=html.indexOf('/registry-v2-dose-calculator.js');
assert.ok(corePos>=0 && runtimePos>corePos && registryPos>runtimePos && calculatorPos>registryPos);
assert.doesNotMatch(html, /registry-mobile-|registry-ux-phase|registry-unified-table|registry-table-tools|tailadmin-/);

[
  'searchInput',
  'filterPanel',
  'formPickerButton',
  'formPickerPanel',
  'formPickerSearch',
  'formPickerList',
  'registryTable',
  'registryRows',
  'prevPageButton',
  'nextPageButton',
  'detailDrawer',
  'drawerBody',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));

assert.match(css, /--accent:#635bff/);
assert.match(css, /\.detail-drawer/);
assert.match(css, /\.form-picker-panel/);
assert.match(css, /\.form-category/);
assert.match(css, /\.form-option/);
assert.match(css, /is-pediatric-only/);
assert.match(css, /population-badge/);
assert.match(css, /@media\(max-width:760px\)/);
assert.doesNotMatch(css, /!important/);

assert.match(js, /view:'registry-page'/);
assert.match(js, /\/api\/dosage\?view=cards/);
assert.match(js, /view=registry-detail/);
assert.match(js, /\/api\/dosage\?view=card/);
assert.match(js, /AbortController/);
assert.match(js, /requestId/);
assert.match(js, /escapeHtml/);
assert.match(js, /FORM_GROUPS/);
assert.match(js, /formExact/);
assert.match(js, /formCategory/);
assert.match(js, /approvedPopulation/);
assert.match(js, /Grupi \/ Klasa/);
assert.match(js, /Për çka përdoret/);
assert.match(js, /Popullata/);
assert.match(js, /Vetëm pediatrik/);
assert.match(js, /data-dose-calculator-open/);
assert.match(js, /data-registry-number/);
assert.match(js, /data-row-favorite/);
assert.match(js, /data-row-note/);
assert.match(js, /loadPersonalLibrary/);
assert.match(js, /DRxPhase9Personal/);
assert.match(js, /toggleFavorite\('product'/);
assert.match(js, /saveNote\('product'/);
assert.match(js, /deleteNote\('product'/);
assert.match(css, /\.registry-more-trigger/);
assert.match(css, /\.registry-more-menu/);
assert.match(css, /\.registry-note-dialog/);
assert.doesNotThrow(() => new Function(js));

assert.match(doseCss, /\.drx-dose-modal/);
assert.match(doseCss, /\.drx-dose-open/);
assert.match(doseCss, /@media\(max-width:760px\)/);
assert.doesNotMatch(doseCss, /!important/);

assert.match(doseJs, /view=product-rules&registryNumber=/);
assert.match(doseJs, /DRxDoseRuntime/);
assert.match(doseJs, /Runtime\(\)\.requiredMeasureTypes|Runtime\(\)\?\.requiredMeasureTypes/);
assert.match(doseJs, /data-dose-crcl/);
assert.match(doseJs, /data-dose-egfr/);
assert.match(doseJs, /data-dose-treatment-day/);
assert.match(doseJs, /data-dose-variant/);
assert.match(doseJs, /data-dose-hepatic/);
assert.match(doseJs, /no-store/);
assert.match(doseJs, /fail-closed|failClosed/i);
assert.doesNotMatch(doseJs, /compatibility-catalog|offline-cache/);
assert.doesNotThrow(() => new Function(doseJs));
assert.doesNotThrow(() => new Function(doseRuntime));

const page = drugSearch.buildPageRequest({
  page:'2',
  pageSize:'50',
  includeTotal:'true',
  q:'amoxicillin',
  status:'Gjenerik',
  atc:'N02',
  form:'Tabletë',
  sort:'name',
  direction:'desc',
});

assert.equal(page.page, 2);
assert.equal(page.pageSize, 50);
assert.equal(page.includeTotal, true);
assert.equal(page.sort, 'name');
assert.equal(page.direction, 'desc');
assert.equal(page.atc, 'N02');
assert.match(page.path, /is_published=eq\.true/);
assert.match(page.path, /editorial_status=eq\.published/);
assert.match(page.path, /limit=50/);
assert.match(page.path, /offset=50/);
assert.match(page.path, /registry_search_text=ilike/);
assert.match(decodeURIComponent(page.path), /approved_population/);
assert.match(decodeURIComponent(page.path), /atc_code=ilike\.N02\*/);

const mapped = drugSearch.listRow({ id:'11111111-1111-4111-8111-111111111111', approved_population:'Pediatric only' });
assert.equal(mapped.approvedPopulation, 'Pediatric only');

const capped = drugSearch.buildPageRequest({ pageSize:'500' });
assert.equal(capped.pageSize, drugSearch.REGISTRY_MAX_PAGE_SIZE);

console.log('registry-v2-contract-test: ok');
