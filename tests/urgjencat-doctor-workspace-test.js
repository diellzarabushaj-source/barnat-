'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('urgjencat.html');
const js = read('urgjencat-v2.js');
const css = read('urgjencat-v2.css');
const auth = read('auth-client.js');

assert.match(html, /data-drx-app="urgjencat-v2"/);
assert.match(html, /urgjencat-v2\.css\?v=5/);
assert.match(html, /urgjencat-v2\.js\?v=5/);
assert.match(html, /id="emergencyChapterSelect"/);
assert.match(html, /id="emergencyLessonSelect"/);
assert.match(html, /id="emergencySearch"/);
assert.match(html, /id="emergencyDetail"/);
assert.match(html, /id="emergencySearchClear"/);
assert.match(html, /id="emergencyResultStatus"/);
assert.match(html, /id="previousLessonButton"/);
assert.match(html, /id="nextLessonButton"/);
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);
assert.doesNotMatch(html, /tailadmin-|auth-client|emergency-curriculum|medical-hub\.css/);

assert.match(js, /_type == "emergencySection"/);
assert.match(js, /_type == "emergencyLesson"/);
assert.match(js, /reviewStatus != "archived"/);
assert.match(js, /translatedTables/);
assert.match(js, /figures/);
assert.match(js, /lessonSections/);
assert.match(js, /rx\[\]/);
assert.match(js, /function renderChapters\(\)/);
assert.match(js, /function renderReaderNavigation\(\)/);
assert.match(js, /function selectAdjacentLesson\(delta\)/);
assert.match(js, /function clearSearch\(/);
assert.match(js, /const FIGURE_DETAIL_QUERY/);
assert.match(js, /function ensureLessonFigures\(/);
assert.match(js, /const lessonSearchIndex = new Map\(\)/);
assert.match(js, /function scheduleSearch\(/);
assert.match(js, /data-lesson-jump/);
assert.match(js, /emergencyChapterSelect/);
assert.match(js, /emergencyLessonSelect/);
assert.match(js, /function reviewMeta\(status\)/);
assert.match(js, /Material burimor/);
assert.match(js, /ensureAuth\(\)/);
assert.match(js, /ensureSanity\(\)/);
assert.match(js, /sidebar-taxonomy-v3/);
assert.match(js, /profile-unified-v1/);
const indexQuery = js.match(/const QUERY = \`([\\s\\S]*?)\`;/)?.[1] || '';
assert.ok(indexQuery, 'Urgjencat initial Sanity query must be extractable');
assert.doesNotMatch(indexQuery, /imageDataUrl|imageDataChunks|asset->/, 'Initial Urgjencat query must not preload heavy figure media');
assert.match(js, /FIGURE_DETAIL_QUERY[\\s\\S]*imageDataUrl[\\s\\S]*imageDataChunks/, 'Heavy figure media must load only through the detail query');
assert.doesNotThrow(() => new Function(js));

assert.match(css, /Urgjencat V2 — one document, one command bar/);
assert.match(css, /\.emergency-command/);
assert.match(css, /Emergency reader navigation v3/);
assert.match(css, /\.emergency-command-footer/);
assert.match(css, /\.emergency-lesson-nav/);
assert.match(css, /Emergency lazy media state v5/);
assert.match(css, /Emergency document pagination v5/);
assert.match(css, /\.ec-media-loading/);
assert.match(css, /\.ec-document-pagination/);
assert.match(css, /\.ec-rx/);
assert.match(css, /\.ec-clinical-table/);
assert.match(css, /\.ec-review-banner/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

assert.match(auth, /confirmSessionAfterUnauthorized/);
assert.match(auth, /Revalidate the session before interpreting it as a logout event/);
assert.doesNotMatch(auth, /&& !String\(target\)\.includes\('\/api\/auth'\)\) showExpired\(\)/);

console.log('Urgjencat V2 single-owner Stripe workspace and safe auth contract passed.');
