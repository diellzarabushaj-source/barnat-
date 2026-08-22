'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const core = read('urgjencat.js');
const sanityClient = read('sanity-clinical-client.js');
const taxonomy = read('emergency-taxonomy.js');
const chaptersCss = read('emergency-chapters.css');
const learning = read('emergency-summary-learn.js');
const learningCss = read('emergency-summary-learn.css');
const polishCss = read('emergency-summary-learn-polish.css');
const assist = read('emergency-directory-assist.js');
const assistCss = read('emergency-directory-assist.css');
const priority = read('emergency-directory-priority.js');
const triageFilter = read('emergency-triage-filter.js');
const triageFilterCss = read('emergency-triage-filter.css');

assert.ok(
  html.indexOf('sanity-clinical-client.js') < html.indexOf('emergency-taxonomy.js')
  && html.indexOf('emergency-taxonomy.js') < html.indexOf('emergency-summary-learn.js')
  && html.indexOf('emergency-summary-learn.js') < html.indexOf('urgjencat.js'),
  'Sanity, taxonomy and learning layers must be ready before the emergency core query runs.',
);
assert.doesNotMatch(html, /emergency-doctor-mode\.(?:js|css)/);
assert.doesNotMatch(html, /emergency-clinician-timeline\.(?:js|css)/);
assert.doesNotMatch(html, /<script[^>]+emergency-directory-priority\.js/);
assert.match(html, /emergency-summary-learn\.css\?v=20260819-1/);
assert.match(html, /emergency-summary-learn-polish\.css\?v=20260819-3/);
assert.match(html, /emergency-directory-assist\.css\?v=20260819-2/);
assert.match(html, /emergency-directory-assist\.js\?v=20260819-1/);
assert.match(html, /emergency-triage-filter\.css\?v=20260819-1/);
assert.match(html, /emergency-chapters\.css\?v=20260822-1/);
assert.match(html, /emergency-taxonomy\.js\?v=20260822-1/);
assert.match(html, /urgjencat\.js\?v=20260822-1/);
assert.ok(
  html.indexOf('emergency-summary-learn-polish.css') < html.indexOf('tailadmin-professional.css'),
  'Emergency polish must stay before the canonical final TailAdmin stylesheet.',
);
const stylesheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match => match[1]);
assert.match(
  stylesheets.at(-1),
  /^tailadmin-professional\.css\?v=20260728-1(?:&build=[^"]+)?$/,
  'Professional TailAdmin must remain the final static stylesheet.',
);
assert.match(html, /emergency-summary-learn\.js\?v=20260819-2/);
assert.match(html, /Përmbledhje/);
assert.match(html, /Mëso/);
assert.match(html, /Kapituj dhe nënkapituj/);
assert.match(html, /id="emergencyChapterExplorer"/);
assert.match(html, /id="emergencyChapterNav"/);
assert.match(html, /id="emergencySubchapterNav"/);
assert.match(html, /id="emergencyChapterReset"/);
assert.match(html, /class="ck-legacy-category-filter"/);

assert.match(core, /reviewStatus != "archived"/);
assert.match(core, /reviewStatus,reviewedBy,lastReviewedAt,reviewDueAt,version/);
assert.match(core, /chapterKey,chapterTitle,chapterOrder,subchapterKey,subchapterTitle,subchapterOrder/);
assert.match(core, /primaryCareSteps/);
assert.match(core, /secondaryCareSteps/);
assert.match(core, /sources/);
assert.match(core, /const TRIAGE_RANK/);
assert.match(core, /function chapterInventory/);
assert.match(core, /function renderChapterNavigation/);
assert.match(core, /function groupFilteredItems/);
assert.match(core, /function breadcrumbMarkup/);
assert.match(core, /ck-emergency-breadcrumb/);
assert.match(core, /data-chapter-key=/);
assert.match(core, /data-subchapter-key=/);
assert.match(core, /searchParams\.set\('chapter'/);
assert.match(core, /searchParams\.set\('subchapter'/);
assert.match(core, /searchParams\.set\('emergency'/);
assert.match(core, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]\.includes\(event\.key\)/);
assert.match(core, /event\.key === 'ArrowRight'/);
assert.match(core, /state\.chapterKey/);
assert.match(core, /state\.subchapterKey/);
assert.match(core, /taxonomy\.chapterTitle,taxonomy\.subchapterTitle/);
assert.match(sanityClient, /window\.MedIndexSanity = Object\.freeze/);

assert.match(taxonomy, /window\.MedIndexEmergencyTaxonomy = Object\.freeze/);
assert.match(taxonomy, /const CHAPTERS = \[/);
assert.match(taxonomy, /key: 'qasja-reanimimi', order: 1/);
assert.match(taxonomy, /key: 'kardiovaskulare', order: 2/);
assert.match(taxonomy, /key: 'pediatrike', order: 14/);
assert.match(taxonomy, /key: 'barnat-urgjences', order: 18/);
assert.match(taxonomy, /Qasja fillestare & reanimimi/);
assert.match(taxonomy, /Urgjencat kardiovaskulare/);
assert.match(taxonomy, /Urgjencat neurologjike/);
assert.match(taxonomy, /Urgjencat pediatrike/);
assert.match(taxonomy, /Barnat kryesore të urgjencës/);
assert.match(taxonomy, /function resolve\(item\)/);
assert.match(taxonomy, /function summarize\(items\)/);
assert.match(taxonomy, /function categoryText\(item\)/);
assert.match(taxonomy, /function identityText\(item\)/);
assert.match(taxonomy, /const categoryMatch = CHAPTERS\.find/);
assert.match(taxonomy, /item\?\.chapterKey/);
assert.match(taxonomy, /item\?\.subchapterKey/);
assert.equal((taxonomy.match(/\n\s*key: '[^']+', order: \d+,\n\s*title:/g) || []).length, 18, 'Taxonomy must expose exactly 18 canonical top-level chapters.');

assert.match(chaptersCss, /\.ck-chapter-explorer/);
assert.match(chaptersCss, /\.ck-chapter-tabs/);
assert.match(chaptersCss, /\.ck-subchapter-tabs/);
assert.match(chaptersCss, /\.ck-directory-chapter/);
assert.match(chaptersCss, /\.ck-directory-subchapter/);
assert.match(chaptersCss, /\.ck-emergency-breadcrumb/);
assert.match(chaptersCss, /\.ck-chapter-reset\{[\s\S]*min-height:44px/);
assert.match(chaptersCss, /\.ck-subchapter-tabs button\{[\s\S]*min-height:44px/);
assert.match(chaptersCss, /html\[data-theme="dark"\]/);
assert.match(chaptersCss, /@media\(max-width:760px\)/);
assert.match(chaptersCss, /prefers-reduced-motion:reduce/);
assert.match(chaptersCss, /ck-legacy-category-filter\{display:none!important\}/);
assert.match(chaptersCss, /:has\(\.ck-list-button:not\(\[hidden\]\)\)/);
assert.doesNotMatch(chaptersCss, /font-size:(?:7|8|9|10)(?:\.\d+)?px/);

assert.match(learning, /value === 'learn' \? 'learn' : 'summary'/);
assert.match(learning, /data-ck-mode="summary"/);
assert.match(learning, /data-ck-mode="learn"/);
assert.match(learning, /Përmbledhje/);
assert.match(learning, /Mëso/);
assert.match(learning, /Çfarë bëj tani\?/);
assert.match(learning, /Trajtimi i parë/);
assert.match(learning, /Veprimi i parë/);
assert.match(learning, /MËSIMI I PLOTË/);
assert.match(learning, /FLASHCARDS/);
assert.match(learning, /Pyetje të krijuara vetëm nga ky mësim/);
assert.match(learning, /data-flash-reveal/);
assert.match(learning, /data-flash-known/);
assert.match(learning, /data-flash-repeat/);
assert.match(learning, /aria-expanded/);
assert.match(learning, /aria-controls/);
assert.match(learning, /role="progressbar"/);
assert.match(learning, /aria-live="polite"/);
assert.match(learning, /#emergencyList \.ck-list-button\.is-active\[data-id\]/);
assert.match(learning, /String\(item\?\._id \|\| ''\) === String\(activeId\)/);
assert.match(learning, /new Set\(stored\.known\.filter/);
assert.match(learning, /window\.MedIndexSanity = Object\.freeze/);
assert.doesNotMatch(learning, /client\.query\s*=/);
assert.doesNotMatch(learning, /client\.__summaryLearnWrapped\s*=/);
assert.match(learning, /sourceLabel/);
assert.match(learning, /item\.primaryCareSteps/);
assert.match(learning, /item\.secondaryCareSteps/);
assert.match(learning, /item\.redFlags/);
assert.match(learning, /item\.doNotDo/);
assert.match(learning, /item\.referral/);
assert.match(learning, /originalSections\.hidden = true/);
assert.match(learning, /buttonMode === 'simulation'/);
assert.match(learning, /button\.remove\(\)/);

assert.match(learningCss, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(learningCss, /data-ck-learning-mode="summary"/);
assert.match(learningCss, /data-ck-learning-mode="learn"/);
assert.match(learningCss, /ck-sl-therapy/);
assert.match(learningCss, /ck-sl-flashcard/);
assert.match(learningCss, /@media\(max-width:760px\)/);

assert.match(polishCss, /font-family:var\(--mi-font\)!important/);
assert.match(polishCss, /\.ck-sl-therapy-copy p\{[\s\S]*font-size:14px/);
assert.match(polishCss, /\.ck-sl-step p\{[\s\S]*font-size:13\.5px/);
assert.match(polishCss, /\.ck-sl-lesson-action\{[\s\S]*font-size:13\.5px/);
assert.match(polishCss, /\.ck-sl-flash-answer p\{[\s\S]*font-size:14px/);
assert.match(polishCss, /\.ck-sl-flash-controls>button,\.ck-sl-recall button\{[\s\S]*min-height:44px/);
assert.match(polishCss, /#ckDetailOverlay \.ck-drawer-head>div>span\{font-size:11px/);
assert.match(polishCss, /#ckDetailOverlay \.ck-drawer-close\{width:44px;height:44px\}/);
assert.match(polishCss, /#ckDetailOverlay \.ck-source-list small\{font-size:11px/);
assert.match(polishCss, /#ckDetailOverlay \.ck-source-missing\{font-size:12px/);
assert.match(polishCss, /#ckDetailOverlay \.ck-drawer-review b\{font-size:11px\}/);
assert.match(polishCss, /#ckDetailOverlay \.ck-chip\{min-height:28px;font-size:11px\}/);
assert.match(polishCss, /:focus-visible/);
assert.match(polishCss, /html\[data-theme="dark"\]/);
assert.match(polishCss, /prefers-reduced-motion:reduce/);
assert.match(polishCss, /\.ck-sl-flash-controls\.is-hidden-answer>span\{display:none\}/);
assert.match(polishCss, /overflow-wrap:anywhere/);
assert.doesNotMatch(polishCss, /font-size:(?:8|9|10)(?:\.\d+)?px/);

assert.match(assist, /META_QUERY/);
assert.match(assist, /sources\[\]\{title,url,publishedAt\}/);
assert.match(assist, /event\.key === 'ArrowDown'/);
assert.match(assist, /event\.key === 'ArrowUp'/);
assert.match(assist, /aria-current/);
assert.doesNotMatch(assist, /ck-doctor-console/);
assert.doesNotMatch(assist, /installCopyAction/);
assert.doesNotMatch(assist, /Kopjo protokollin/);

assert.match(assistCss, /\.ck-directory-tag\{[\s\S]*font-size:11px!important/);
assert.match(assistCss, /\.ck-directory-review,\.ck-directory-source-count\{[\s\S]*font-size:11px!important/);
assert.match(assistCss, /min-height:25px/);
assert.match(assistCss, /:focus-visible/);
assert.doesNotMatch(assistCss, /font-size:(?:7|7\.5|8|9|10|10\.5)px/);
assert.doesNotMatch(assistCss, /ck-doctor-source-actions/);

assert.match(priority, /TRIAGE_RANK/);
assert.match(triageFilter, /triageLevel/);
assert.match(triageFilter, /sessionStorage/);
assert.match(triageFilter, /moveSelection:true/);
assert.match(triageFilter, /subtree: true/);
assert.match(triageFilterCss, /\.ck-triage-filter-copy strong\{[\s\S]*font-size:13px/);
assert.match(triageFilterCss, /\.ck-triage-filter-copy span\{[\s\S]*font-size:11\.5px/);
assert.match(triageFilterCss, /\.ck-triage-filter-group button\{[\s\S]*min-height:44px[\s\S]*font:700 12px/);
assert.match(triageFilterCss, /\.ck-triage-filter-group b\{[\s\S]*font-size:11px/);
assert.match(triageFilterCss, /\.ck-triage-filter-status\{[\s\S]*font-size:11px/);
assert.match(triageFilterCss, /:focus-visible/);
assert.doesNotMatch(triageFilterCss, /font-size:(?:7|7\.5|8|8\.5|9|10|10\.5)px/);

console.log('Urgjencat chaptered Summary / Learn workspace contract passed.');
