'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('recetat.html');
const css = read('recetat-v2.css');
const js = read('recetat-v2.js');
const library = read('lib/user-library.js');
const libraryClient = read('user-library-client.js');
const dosage = read('lib/prescription-dosage-handler.js');
const dataApi = read('lib/medindex-data-api.js');
const migration = read('supabase/migrations/20260828222548_add_prescription_chapters_and_folder_metadata.sql');
const history = JSON.parse(read('supabase/migration-history.json'));
const worker = read('sw.js');

assert.match(html, /data-drx-app="recetat-v2"/);
assert.match(html, /class="drx-unified-sidebar"/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /class="nav-item is-active" href="\/recetat\.html" aria-current="page"/);
assert.match(html, /recetat-v2\.css\?v=1/);
assert.match(html, /recetat-v2\.js\?v=1/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v6/);

[
  'rxSavedCount','rxFolderCount','rxActiveChapterCount','rxLibraryState',
  'rxDiagnosis','rxChapterSelect','rxComposer','rxSelectedDrugs',
  'rxPreview','rxSave','rxCopy','rxPrint',
  'rxChapterNav','rxChapterAllCount','rxSavedSearch','rxSavedList',
].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `Missing Recetat V2 node #${id}`));

const styles = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi)]
  .map(match => match[1]);
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => match[1]);

assert.equal(styles.length, 2, 'Recetat V2 must load only page CSS + shared Stripe shell');
assert.equal(styles[0], '/recetat-v2.css?v=1');
assert.equal(styles[1], '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v6');
assert.deepEqual(scripts, ['/recetat-v2.js?v=1']);
assert.doesNotMatch(html, /tailadmin-|auth-client\.js|recetat\.css|recetat-audit\.css|recetat-style-loader\.js|recetat\.js/);

assert.match(css, /Recetat V2 — consolidated prescription workspace/);
assert.match(css, /Recetat V2 — Stripe prescription workspace/);
assert.match(css, /\.rx-library-layout/);
assert.match(css, /\.rx-folder-panel/);
assert.match(css, /\.rx-folder-item\.is-active/);
assert.match(css, /\.rx-saved-chapter/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

assert.match(js, /Recetat V2 — consolidated runtime with chapter folders/);
assert.match(js, /function loadSharedSidebarTaxonomy\(\)/);
assert.match(js, /sidebar-taxonomy-v3\.js\?v=sidebar-taxonomy-v3/);
assert.match(js, /async function ensureAuth\(\)/);
assert.match(js, /function chapterCatalog\(\)/);
assert.match(js, /function classifyChapter\(/);
assert.match(js, /function populateChapterSelect\(\)/);
assert.match(js, /function renderChapterNav\(/);
assert.match(js, /function moveSavedToChapter\(/);
assert.match(js, /function migrateLegacyChapterAssignments\(\)/);
assert.match(js, /migrateLegacyChapterAssignments\(\);/);
assert.match(js, /chapterManuallySelected/);
assert.match(js, /score \+= 10/);
assert.match(js, /score \+= 4/);
assert.match(js, /medindex:prescriptions-changed/);
assert.match(js, /prescriptionChapters:\(\)/);
assert.match(js, /fetch\('\/api\/gemini-prescription'/);
assert.match(js, /fetch\('\/api\/dosage'/);
assert.doesNotThrow(() => new Function(js));

assert.match(library, /chapter_key/);
assert.match(library, /function prescriptionChapterRows\(\)/);
assert.match(library, /prescriptionChapters/);
assert.match(library, /payload:encryptJson\(item\.payload/);
assert.match(library, /chapter_key:item\.chapterKey/);
assert.match(libraryClient, /prescriptionChapters:\(\)/);
assert.match(libraryClient, /medindex:prescriptions-changed/);
assert.match(dataApi, /'prescription_chapters'/);
assert.match(dataApi, /const PRIVATE_SERVER_RELATIONS/);

assert.match(dosage, /X-MedIndex-Data-Source', 'supabase'/);
assert.match(dosage, /dataSource:'supabase'/);
assert.doesNotMatch(dosage, /dataSource:'neon'/);

assert.match(migration, /create table if not exists public\.prescription_chapters/);
assert.match(migration, /add column if not exists chapter_key text/);
assert.match(migration, /user_prescriptions_chapter_key_fkey/);
assert.match(migration, /user_prescriptions_user_chapter_updated_idx/);
assert.match(migration, /alter table public\.prescription_chapters enable row level security/);
assert.match(migration, /'kardiovaskulare'/);
assert.match(migration, /'antiinfektive'/);
assert.match(migration, /'respiratore'/);
assert.match(migration, /'te-tjera'/);
assert.ok(history.migrations.some(item =>
  item.version === '20260828222548' && item.name === 'add_prescription_chapters_and_folder_metadata'
));

assert.match(worker, /\/recetat-v2\.css/);
assert.match(worker, /\/recetat-v2\.js/);
assert.doesNotMatch(worker, /['"]\/recetat\.js['"]/);

console.log('Recetat V2 folder-based Stripe workspace and Supabase chapter sync contract passed.');
