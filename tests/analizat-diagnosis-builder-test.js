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
const dataApi = read('lib/medindex-data-api.js');
const api = read('lib/icd-api-base.js');
const baseMigration = read('supabase/migrations/20260828214754_add_lab_indication_order_builder.sql');
const liverCorrection = read('supabase/migrations/20260828215737_correct_liver_panel_alp_mapping.sql');
const migrationHistory = JSON.parse(read('supabase/migration-history.json'));
const integrityMigration = read('supabase/migrations/20260828221042_harden_lab_indication_integrity.sql');
const serviceWorker = read('sw.js');

assert.match(html, /data-drx-app="analizat-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /analizat-v2\.css\?v=1/);
assert.match(html, /analizat-v2\.js\?v=2/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /id="labDiseaseTrigger"/);
assert.match(html, /id="labDiseasePopover"/);
assert.match(html, /id="labDiseaseSearch"/);
assert.match(html, /id="labDiseaseList"/);
assert.match(html, /aria-multiselectable="true"/);
assert.match(html, /aria-haspopup="listbox"/);
assert.match(html, /id="labPlanStatus" role="status" aria-live="polite"/);
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
const pageRuntimes = scripts.filter(src => !/sidebar-taxonomy-v3\.js/.test(src));

assert.equal(styles.length, 2, 'Analizat V2 must load only page CSS + canonical Stripe shell');
assert.ok(styles[0].includes('analizat-v2.css?v=1'));
assert.ok(styles[1].includes('drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8'));
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5'), 'Analizat V2 shared sidebar runtime is missing');
assert.equal(pageRuntimes.length, 1, 'Analizat V2 must own one page runtime in addition to the shared sidebar runtime');
assert.ok(pageRuntimes[0].includes('analizat-v2.js?v=2'));
assert.doesNotMatch(html, /tailadmin-|analizat-polish|medical-hub\.css|lab-sheet-data|auth-client\.js|clean-medindex-ui|clinical-density|app-polish|performance\.css/);
assert.doesNotMatch(html, /<\/div>\s*<\/div>\s*<\/main>/, 'Analizat V2 main wrapper must stay balanced');

assert.match(js, /fetch\('\/api\/icd\?dataset=labs'/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v4/);
assert.match(js, /const TIER_ORDER = Object\.freeze\(\{ core:0, recommended:1, conditional:2, manual:3 \}\)/);
assert.match(js, /const map = new Map\(\)/);
assert.match(js, /map\.has\(test\.id\)/);
assert.match(js, /map\.set\(test\.id/);
assert.match(js, /function buildPlanEntries\(\)/);
assert.match(js, /function toggleIndication\(id\)/);
assert.match(js, /function pruneExcludedTests\(\)/);
assert.match(js, /ArrowDown/);
assert.match(js, /ArrowUp/);
assert.match(js, /function addManualTest\(id\)/);
assert.match(js, /function togglePlannedTest\(id, checked\)/);
assert.match(js, /catalogGaps/);
assert.match(js, /url\.searchParams\.set\('dx'/);
assert.match(js, /function copyPlanText\(\)/);
assert.match(js, /Panel orientues klinik/);
assert.doesNotThrow(() => new Function(js));

assert.match(css, /Analizat V2 — diagnosis-driven order builder/);
assert.match(css, /Visual geometry, colors, spacing and responsive shell authority live in drx-dashboard-stripe\.css v6/);
assert.doesNotMatch(css, /\.sidebar\{[^}]*background:#1c1e54/);
assert.doesNotMatch(css, /\.topbar\{[^}]*background:/);
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

assert.match(baseMigration, /create table if not exists public\.lab_indications/);
assert.match(baseMigration, /create table if not exists public\.lab_indication_tests/);
assert.match(baseMigration, /enable row level security/);
assert.match(baseMigration, /published lab indications are readable/);
assert.match(baseMigration, /published lab indication tests are readable/);
assert.match(liverCorrection, /Fosfataza alkaline/);
assert.match(liverCorrection, /Alkaline Phosphatase/);
assert.match(liverCorrection, /catalog_gaps='\[\]'::jsonb/);
assert.ok(migrationHistory.migrations.some(item =>
  item.version === '20260828214754' && item.name === 'add_lab_indication_order_builder'
));
assert.ok(migrationHistory.migrations.some(item =>
  item.version === '20260828215737' && item.name === 'correct_liver_panel_alp_mapping'
));
assert.match(integrityMigration, /lab_indications_slug_format_check/);
assert.match(integrityMigration, /lab_indications_catalog_gaps_array_check/);
assert.ok(migrationHistory.migrations.some(item =>
  item.version === '20260828221042' && item.name === 'harden_lab_indication_integrity'
));
assert.match(serviceWorker, /\/analizat-v2\.css/);
assert.match(serviceWorker, /\/analizat-v2\.js/);
assert.doesNotMatch(serviceWorker, /analizat-polish|analizat-tailwind-cards-v2|lab-sheet-data\.js|['"]\/analizat\.js/);

console.log('Analizat V2 diagnosis-driven Supabase order builder contract passed.');
