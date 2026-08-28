'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('analizat.html');
const css = read('analizat-v2.css');
const js = read('analizat-v2.js');
const reader = read('lib/neon-clinical-reader.js');
const dataApi = read('lib/neon-data-api.js');
const api = read('lib/icd-api-base.js');

assert.match(html, /data-drx-app="analizat-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /analizat-v2\.css\?v=1/);
assert.match(html, /analizat-v2\.js\?v=1/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /id="labDiseaseTrigger"/);
assert.match(html, /id="labDiseasePopover"/);
assert.match(html, /id="labDiseaseSearch"/);
assert.match(html, /id="labDiseaseList"/);
assert.match(html, /id="labManualSearch"/);
assert.match(html, /id="labManualResults"/);
assert.match(html, /id="labSelectedDiseases"/);
assert.match(html, /id="labPlanSections"/);
assert.match(html, /id="labGapList"/);
assert.match(html, /id="labCopyPlan"/);

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.equal(styles.length, 2, 'Analizat V2 must load only page CSS + canonical Stripe shell');
assert.ok(styles[0].includes('analizat-v2.css?v=1'));
assert.ok(styles[1].includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v4'));
assert.equal(scripts.length, 1, 'Analizat V2 must own one page runtime');
assert.ok(scripts[0].includes('analizat-v2.js?v=1'));
assert.doesNotMatch(html, /tailadmin-|analizat-polish|medical-hub\.css|lab-sheet-data|auth-client\.js|clean-medindex-ui|clinical-density|app-polish|performance\.css/);

assert.match(js, /fetch\('\/api\/icd\?dataset=labs'/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /const TIER_ORDER = Object\.freeze\(\{ core:0, recommended:1, conditional:2, manual:3 \}\)/);
assert.match(js, /const map = new Map\(\)/);
assert.match(js, /map\.has\(test\.id\)/);
assert.match(js, /map\.set\(test\.id/);
assert.match(js, /function buildPlanEntries\(\)/);
assert.match(js, /function toggleIndication\(id\)/);
assert.match(js, /function addManualTest\(id\)/);
assert.match(js, /function togglePlannedTest\(id, checked\)/);
assert.match(js, /catalogGaps/);
assert.match(js, /url\.searchParams\.set\('dx'/);
assert.match(js, /function copyPlanText\(\)/);
assert.match(js, /Panel orientues klinik/);
assert.doesNotThrow(() => new Function(js));

assert.match(css, /Analizat V2 — diagnosis-driven order builder/);
assert.match(css, /\.lab-disease-popover/);
assert.match(css, /\.lab-disease-option\.is-selected/);
assert.match(css, /\.lab-tier-section/);
assert.match(css, /data-tier="recommended"/);
assert.match(css, /\.lab-gap-item/);
assert.match(css, /\.lab-summary-card/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

assert.match(reader, /fetchPaged\('lab_indications'/);
assert.match(reader, /fetchPaged\('lab_indication_tests'/);
assert.match(reader, /source:'Supabase'/);
assert.match(reader, /catalogGaps:Array\.isArray\(indication\.catalog_gaps\)/);
assert.match(reader, /tests:\(linksByIndication\.get\(indication\.id\)/);
assert.match(dataApi, /'lab_indications'/);
assert.match(dataApi, /'lab_indication_tests'/);
assert.match(api, /wrap\(data, 'supabase'/);
assert.doesNotMatch(api, /wrap\(data, 'neon'/);

console.log('Analizat V2 diagnosis-driven Supabase order builder contract passed.');
