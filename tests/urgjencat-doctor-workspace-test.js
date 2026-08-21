'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const core = read('urgjencat.js');
const sanityClient = read('sanity-clinical-client.js');
const learning = read('emergency-summary-learn.js');
const learningCss = read('emergency-summary-learn.css');
const polishCss = read('emergency-summary-learn-polish.css');
const assist = read('emergency-directory-assist.js');
const assistCss = read('emergency-directory-assist.css');
const priority = read('emergency-directory-priority.js');
const triageFilter = read('emergency-triage-filter.js');
const triageFilterCss = read('emergency-triage-filter.css');

assert.ok(
  html.indexOf('sanity-clinical-client.js') < html.indexOf('emergency-summary-learn.js')
  && html.indexOf('emergency-summary-learn.js') < html.indexOf('urgjencat.js'),
  'The learning layer must wrap the Sanity client before the emergency core query runs.',
);
assert.doesNotMatch(html, /emergency-doctor-mode\.(?:js|css)/);
assert.doesNotMatch(html, /emergency-clinician-timeline\.(?:js|css)/);
assert.match(html, /emergency-summary-learn\.css\?v=20260819-1/);
assert.match(html, /emergency-summary-learn-polish\.css\?v=20260819-3/);
assert.match(html, /emergency-directory-assist\.css\?v=20260819-2/);
assert.match(html, /emergency-directory-assist\.js\?v=20260819-1/);
assert.match(html, /emergency-triage-filter\.css\?v=20260819-1/);
assert.ok(
  html.indexOf('emergency-summary-learn-polish.css') < html.indexOf('tailadmin-professional.css'),
  'Emergency polish must stay before the canonical final TailAdmin stylesheet.',
);
const stylesheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match => match[1]);
// The build pins page assets to the release, so the href carries a `&build=`
// token afterwards and none before. What is asserted is which stylesheet comes
// last, not how the build stamped it.
assert.match(
  stylesheets.at(-1),
  /^tailadmin-professional\.css\?v=20260728-1(?:&build=[^"]+)?$/,
  'Professional TailAdmin must remain the final static stylesheet.',
);
assert.match(html, /emergency-summary-learn\.js\?v=20260819-2/);
assert.match(html, /Përmbledhje/);
assert.match(html, /Mëso/);

assert.match(core, /reviewStatus != "archived"/);
assert.match(core, /reviewStatus,reviewedBy,lastReviewedAt,reviewDueAt,version/);
assert.match(core, /primaryCareSteps/);
assert.match(core, /secondaryCareSteps/);
assert.match(core, /sources/);
assert.match(sanityClient, /window\.MedIndexSanity = Object\.freeze/);

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
assert.match(polishCss, /#ckDetailOverlay \.ck-source-list small\{font-size:11px\}/);
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
assert.match(triageFilterCss, /\.ck-triage-filter-copy strong\{[\s\S]*font-size:13px/);
assert.match(triageFilterCss, /\.ck-triage-filter-copy span\{[\s\S]*font-size:11\.5px/);
assert.match(triageFilterCss, /\.ck-triage-filter-group button\{[\s\S]*min-height:44px[\s\S]*font:700 12px/);
assert.match(triageFilterCss, /\.ck-triage-filter-group b\{[\s\S]*font-size:11px/);
assert.match(triageFilterCss, /\.ck-triage-filter-status\{[\s\S]*font-size:11px/);
assert.match(triageFilterCss, /:focus-visible/);
assert.doesNotMatch(triageFilterCss, /font-size:(?:7|7\.5|8|8\.5|9|10|10\.5)px/);

console.log('Urgjencat two-mode Summary / Learn workspace contract passed.');
