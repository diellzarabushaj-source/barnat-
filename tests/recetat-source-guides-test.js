'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('recetat.html');
const js = read('recetat-v2.js');
const css = read('recetat-v2.css');
const api = read('api/medical-hub.js');

assert.match(html, /id="rxPrescriptionLibrary"/);
assert.match(html, /id="rxSourceChapterSelect"/);
assert.match(html, /id="rxSourceLessonSelect"/);
assert.match(html, /id="rxSourceGuideList"/);
assert.match(html, /id="rxSourceGuideNav"/);
assert.match(html, /id="rxSourceSearch"/);
// The static legend that spelled out this vocabulary is gone. It lives on the
// connectors between steps, which is where the reader actually meets it.
assert.match(js, /RELATION_LABELS = Object\.freeze\(\{ and:'DHE', or:'OSE', plus:'PLUS', conditional:'NËSE' \}\)/);
assert.doesNotMatch(html, /rx-source-legend/, 'the notation legend strip stays removed');
assert.match(html, /recetat-v2\.css\?v=20/);
assert.match(html, /recetat-v2\.js\?v=20/);

assert.match(api, /PRESCRIPTION_CHAPTER_QUERY/);
assert.match(api, /PRESCRIPTION_GUIDE_QUERY/);
assert.match(api, /PRESCRIPTION_SEARCH_INDEX_QUERY/);
assert.match(api, /requestedRoute === 'prescription-search'/);
assert.match(api, /function fuzzyTokenScore\(/);
assert.match(api, /function scorePrescriptionSearch\(/);
assert.match(api, /requestedRoute === 'prescription-library'/);
assert.match(api, /logicBlocks\[\]\{[\s\S]*?_key[\s\S]*?items\[\]\{/);
assert.match(api, /source:'sanity-prescription-guides'/);

assert.match(js, /RELATION_LABELS = Object\.freeze\(\{ and:'DHE', or:'OSE', plus:'PLUS', conditional:'NËSE' \}\)/);
assert.match(js, /function smartNumberedBlocks\(input\)/);
assert.match(js, /previous\.smartSuffix = 'A'/);
assert.match(js, /block\.smartLabel = `\$\{alternativeBase\}\$\{block\.smartSuffix\}`/);
assert.match(js, /Zgjidh preparatin/);
assert.match(js, /Rrjedha klinike/);
assert.match(js, /function filteredItems\(\)/);
assert.match(js, /function lessonLabel\(/);
assert.match(js, /function runSmartSearch\(/);
assert.match(js, /function openSearchResult\(/);
assert.match(js, /SEARCH_API = '\/api\/medical-hub\?_route=prescription-search'/);
assert.match(js, /data-rx-source-select/);
assert.match(js, /reviewStatus === 'source-imported'/);
assert.match(js, /data-rx-source-use/);
assert.match(js, /data-rx-source-drug/);
assert.match(js, /beginSourceGuideDraft/);
assert.match(js, /reason:'draft-not-empty'/);
assert.match(js, /state\.composerOrigin = 'manual'/);
assert.match(js, /Skema nga Doctor on Duty u vendos vetëm si draft/);

const draftFunction = js.match(/function beginSourceGuideDraft\(payload = \{\}\) \{([\s\S]*?)\n  \}\n\n  window\.MedIndexRecetaWorkspace/)?.[1] || '';
assert.ok(draftFunction, 'Source-guide draft bridge must be extractable');
assert.doesNotMatch(draftFunction, /saveCurrent\s*\(/, 'Source guide must never auto-save a prescription');
assert.doesNotMatch(draftFunction, /copyCurrent\s*\(/, 'Source guide must never auto-copy a prescription');
assert.doesNotMatch(draftFunction, /printCurrent\s*\(/, 'Source guide must never auto-print a prescription');

assert.match(css, /\.rx-source-library/);
assert.match(css, /Recetat V18 — smart clinical pathway UI/);
assert.match(css, /Recetat V19 — Stripe-style clinical master-detail workspace/);
assert.match(css, /Recetat V20 — lessons \+ global smart search refinement/);
assert.match(css, /\.rx-source-lesson-picker/);
assert.match(css, /\.rx-source-search-scope/);
assert.match(css, /\.rx-source-step-rail/);
assert.match(css, /\.rx-source-flow-title/);
assert.match(css, /\.rx-source-connector\.is-or/);
assert.match(css, /\.rx-source-connector\.is-conditional/);
assert.match(css, /@media\(max-width:760px\)/);

console.log('Recetat source-guides contract passed: chapters + lessons + global typo-tolerant search + draft-only handoff.');
