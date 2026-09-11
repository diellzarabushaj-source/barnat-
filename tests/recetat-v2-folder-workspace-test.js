'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('recetat.html');
const css = read('recetat-v2.css');
const stripe = read('drx-dashboard-stripe.css');
const js = read('recetat-v2.js');
const library = read('lib/user-library.js');
const libraryClient = read('user-library-client.js');
const dosage = read('lib/prescription-dosage-handler.js');
const dataApi = read('lib/medindex-data-api.js');
const migration = read('supabase/migrations/20260828222548_add_prescription_chapters_and_folder_metadata.sql');
const history = JSON.parse(read('supabase/migration-history.json'));
const worker = read('sw.js');

// Shell and runtime contract.
assert.match(html, /data-drx-app="recetat-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /class="nav-item is-active" href="\/recetat\.html" aria-current="page"/);
assert.match(html, /recetat-v2\.css\?v=20/);
assert.match(html, /recetat-v2\.js\?v=20/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);

[
  'rxSourceSearch','rxSourceChapterSelect','rxSourceLessonSelect','rxSourceGuideNav','rxSourceGuideList',
  'rxSavedCount','rxFolderCount','rxActiveChapterCount','rxLibraryState',
  'rxDiagnosis','rxChapterSelect','rxComposer','rxSelectedDrugs','rxOrderBuilder','rxAddDrugButton',
  'rxFreeTextPanel','rxClinicalReview','rxPreview','rxSave','rxCopy','rxPrint',
  'rxChapterNav','rxChapterAllCount','rxSavedSearch','rxSavedList',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `Missing Recetat V2 node #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)].map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
const pageRuntimes = scripts.filter(src => !/sidebar-taxonomy-v3\.js/.test(src));
assert.equal(styles.length, 2, 'Recetat V2 must load only page CSS + shared shell CSS');
assert.equal(styles[0], '/recetat-v2.css?v=20-ui5');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8-polish1');
assert.ok(scripts.includes('/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5-polish1'));
assert.deepEqual(pageRuntimes, ['/recetat-v2.js?v=20-ui5']);

// 2026-09-11 UI reset: the page stylesheet must be a clean authority, not an override stack.
assert.match(css, /UI reset 2026-09-11: one calm workspace, no internal browsing sidebar/);
assert.equal((css.match(/!important/g) || []).length, 0, 'Recetat page CSS must not reintroduce !important overrides');
assert.ok(css.split(/\r?\n/).length < 900, 'Recetat page CSS should remain compact and maintainable');
assert.match(css, /\.rx-source-browser\{display:block/);
assert.match(css, /\.rx-source-index\{display:block/);
assert.doesNotMatch(css, /\.rx-source-browser\{[^}]*grid-template-columns:/,
  'Clinical source browser must not return to an internal side-by-side panel');
assert.match(css, /\.rx-source-commandbar\{display:grid;grid-template-columns:/);
assert.match(css, /\.rx-source-guide-nav\{display:flex;[^}]*overflow-x:auto/);
assert.match(css, /\.rx-back-to-list,\.rx-reading-toggle\{display:none\}/);
assert.match(css, /\.rx-source-connector\.is-or/);
assert.match(css, /\.rx-source-connector\.is-conditional/);
assert.match(css, /\.rx-source-connector p\{/);
assert.match(css, /\.rx-order-card/);
assert.match(css, /\.rx-free-text-panel/);
assert.match(css, /\.rx-preview-card\{position:sticky;top:76px\}/);
assert.match(css, /\.rx-library-layout/);
assert.match(css, /\.rx-folder-panel/);
assert.match(css, /@media\(max-width:640px\)/);
assert.match(css, /overflow-x:hidden/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(stripe, /DRx canonical collapsible sidebar v8/);
assert.doesNotMatch(css, /--drx-shell-sidebar-collapsed-width|drx-sidebar-collapsed \.(?:sidebar|main-shell|nav-item)/,
  'Recetat page CSS must not duplicate shared shell-collapse authority');

// Runtime/clinical-data behavior stays unchanged.
assert.match(js, /Recetat V20 — chapters \+ lessons \+ global typo-tolerant smart search/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /function structuredOrdersReady\(\)/);
assert.match(js, /function renderDrugSearchResults\(/);
assert.match(js, /clinicalReviewConfirmed/);
assert.match(js, /function updateOrderField\(/);
assert.match(js, /asnjë dozë nuk aplikohet pa konfirmimin tënd/i);
assert.match(js, /function chapterCatalog\(\)/);
assert.match(js, /function populateChapterSelect\(\)/);
assert.match(js, /function renderChapterNav\(/);
assert.match(js, /medindex:prescriptions-changed/);
assert.match(js, /fetch\('\/api\/gemini-prescription'/);
assert.doesNotMatch(js, /fetch\('\/api\/dosage'\s*,/, 'Recetat V2 must not fetch the full dosage dataset');
assert.match(js, /function ensurePrescriptionPrefix\(/);
assert.match(js, /EXACT_FORM_PREFIXES/);
assert.match(js, /core\.ensurePrescriptionPrefix\(drug\.prescriptionLine, drug\.form\)/);
assert.match(js, /RELATION_LABELS = Object\.freeze\(\{ and:'DHE', or:'OSE', plus:'PLUS', conditional:'NËSE' \}\)/);
assert.doesNotThrow(() => new Function(js));

// Persistence and dosage provenance contract remains intact.
assert.match(library, /chapter_key/);
assert.match(library, /function prescriptionChapterRows\(\)/);
assert.match(library, /prescriptionChapters/);
assert.match(libraryClient, /prescriptionChapters:\(\)/);
assert.match(libraryClient, /medindex:prescriptions-changed/);
assert.match(dataApi, /'prescription_chapters'/);
assert.match(dataApi, /const PRIVATE_SERVER_RELATIONS/);
assert.match(dosage, /X-MedIndex-Data-Source', 'supabase'/);
assert.match(dosage, /dataSource:'supabase'/);
assert.doesNotMatch(dosage, /dataSource:'neon'/);
assert.match(migration, /create table if not exists public\.prescription_chapters/);
assert.match(migration, /add column if not exists chapter_key text/);
assert.match(migration, /alter table public\.prescription_chapters enable row level security/);
assert.ok(history.migrations.some(item => item.version === '20260828222548' && item.name === 'add_prescription_chapters_and_folder_metadata'));
assert.match(worker, /\/recetat-v2\.css/);
assert.match(worker, /\/recetat-v2\.js/);

console.log('Recetat clean single-workspace UI, clinical runtime and Supabase persistence contract passed.');
