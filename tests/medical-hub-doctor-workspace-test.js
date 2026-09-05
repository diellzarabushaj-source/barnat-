'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('medical-hub.html');
const js = read('medical-hub-v2.js');
const css = read('medical-hub-v2.css');
const api = read('api/medical-hub.js');
const imageApi = read('lib/medical-hub-image-handler.js');
const imageProxy = require('../lib/medical-hub-image-handler.js');
const icdRuntime = read('icd-v2.js');
const smokeServer = read('tests/clinical-smoke-server.js');
const {
  BOOK:fixtureBook,
  FIXTURE_GENERATED_AT,
  indexItems:fixtureIndexItems,
  detailsById:fixtureDetailsById,
  medicalHubFixtureResponse,
} = require('./medical-hub-browser-fixture.js');

assert.match(html, /data-drx-app="medical-hub-v2"/);
const cssAssetVersion = html.match(/medical-hub-v2\.css\?v=(\d+)/)?.[1] || '';
const jsAssetVersion = html.match(/medical-hub-v2\.js\?v=(\d+)/)?.[1] || '';
assert.match(cssAssetVersion,/^\d+$/);
assert.equal(jsAssetVersion,cssAssetVersion,'Medical Hub CSS/JS cache versions must stay in sync');
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v8/);
assert.match(html, /drx-unified-sidebar/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /id="learningSearch"/);
assert.match(html, /id="learningSearchClear"/);
assert.match(html, /id="learningCategory"/);
assert.match(html, /id="learningTopic"/);
assert.match(html, /Mësimi \/ nënkapitulli/);
assert.match(html, /id="learningResultStatus"/);
assert.match(html, /id="previousTopicButton"/);
assert.match(html, /id="nextTopicButton"/);
assert.match(html, /id="learningTopicPosition"/);
assert.match(html, /id="hubNavigationDrawer"/);
assert.match(html, /id="learningChapterList"/);
assert.match(html, /id="learningTopicList"/);
assert.match(html, /id="hubBookSourceLink"/);
assert.doesNotMatch(html, /tailadmin-|auth-client|clinical-knowledge\.css|medical-hub\.css/);

assert.match(js, /const HUB_API = '\/api\/medical-hub'/);
assert.match(js, /hubApi\(\{ mode:'index' \}/);
assert.match(js, /mode:'search'/);
assert.match(js, /const detailCache = new Map\(\)/);
assert.match(js, /const detailRequests = new Map\(\)/);
assert.match(js, /const searchIndex = new Map\(\)/);
assert.match(js, /function ensureTopicDetail\(id\)/);
assert.match(js, /function renderSelectedDetail\(\)/);
assert.match(js, /function renderReaderNavigation\(\)/);
assert.match(js, /function selectAdjacentTopic\(delta\)/);
assert.match(js, /function scheduleSearch\(value\)/);
assert.match(js, /function clearSearch\(/);
assert.match(js, /function clearFilters\(/);
assert.match(js, /function syncUrl\(\{ push = false \} = \{\}\)/);
assert.match(js, /function restoreUrl\(\)/);
assert.match(js, /function restoreHistoryState\(\)/);
assert.match(js, /pushState/);
assert.match(js, /popstate/);
assert.match(js, /function chapterLessons\(key\)/);
assert.match(js, /function preferredChapterItem\(key\)/);
assert.match(js, /function readerNavigationItems\(\)/);
assert.match(js, /lessons\.length === 1/);
assert.match(js, /function bindFigureFallbacks\(detail\)/);
assert.match(js, /function figureDisplayUrl\(rawUrl\)/);
assert.match(js, /\/api\/medical-hub-image\?url=/);
assert.match(js, /ck-book-rx-alternative/);
assert.match(js, /function prescriptionFormLabel\(form\)/);
assert.match(js, /function hasContentOrder\(item\)/);
assert.match(js, /function orderedClinicalContentMarkup\(item\)/);
assert.match(js, /contentOrder/);
assert.match(js, /data-hub-section/);
assert.match(js, /data-topic-jump/);
assert.match(js, /sidebar-taxonomy-v3/);
assert.match(js, /ensureAuth\(\)/);
assert.match(js, /Burimi i publikuar/);
assert.match(js, /function renderMedicalTopicDetail\(item\)/);
assert.match(js, /function renderNavigationRails\(\)/);
assert.match(js, /function browseChapter\(key\)/);
assert.match(js, /Search is global across the complete book/);
assert.doesNotMatch(js, /chapter:state\.category/);
assert.doesNotMatch(js, /window\.MedIndexSanity/);
assert.doesNotMatch(js, /ensureSanity\(/);
assert.doesNotThrow(() => new Function(js));
assert.match(icdRuntime, /async function openHashCode\(code\)/);
assert.match(icdRuntime, /const opened = hash \? await openHashCode\(hash\) : false/);
assert.match(icdRuntime, /kodi i zgjedhur/);
assert.doesNotThrow(() => new Function(icdRuntime));

assert.match(api, /const INDEX_QUERY = `/);
assert.match(api, /const DETAIL_QUERY = `/);
assert.match(api, /const SEARCH_INDEX_QUERY = `/);
assert.match(api, /const MODERN_INDEX_QUERY = `/);
assert.match(api, /const MODERN_DETAIL_QUERY = `/);
assert.match(api, /const MODERN_SEARCH_INDEX_QUERY = `/);
assert.match(api, /_type == "learningTopic"/);
assert.match(api, /_type == "medicalTopic"/);
assert.match(api, /reviewStatus == "verified"/);
assert.match(api, /reviewStatus in \["review","verified"\]/);
assert.doesNotMatch(api, /prescriptionGuide" && reviewStatus != "archived"/);
assert.match(api, /perspective', 'published'/);
assert.match(api, /mode === 'search'/);
assert.match(api, /authorized\(req\)/);
assert.match(api, /source:'sanity-published-index'/);
assert.match(api, /source:'sanity-published-search'/);
assert.match(api, /medicalHubImageHandler/);
assert.match(api, /requestedRoute === 'image'/);
assert.match(smokeServer, /medicalHubFixtureResponse/);
assert.match(smokeServer, /url\.pathname === '\/api\/medical-hub'/);
const vercel = JSON.parse(read('vercel.json'));
assert.ok(
  vercel.rewrites.some(item => item.source === '/api/medical-hub-image' && item.destination === '/api/medical-hub?_route=image'),
  'Medical Hub image compatibility rewrite is missing'
);

const indexQuery = api.match(/const INDEX_QUERY = `([\s\S]*?)`;/)?.[1] || '';
assert.ok(indexQuery, 'Medical Hub backend index query must be extractable');
assert.doesNotMatch(
  indexQuery,
  /steps\[\]|prescriptions\[\]|redFlags|whenToRefer|relatedProtocols\[\]->/,
  'Medical Hub backend index query must stay lightweight'
);

const detailQuery = api.match(/const DETAIL_QUERY = `([\s\S]*?)`;/)?.[1] || '';
assert.match(detailQuery, /contentOrder\[\]/);
assert.match(detailQuery, /steps\[\]/);
assert.match(detailQuery, /prescriptions\[\]/);
assert.match(detailQuery, /redFlags/);
assert.match(detailQuery, /whenToRefer/);
assert.match(detailQuery, /relatedProtocols\[\]->/);

const searchQuery = api.match(/const SEARCH_INDEX_QUERY = `([\s\S]*?)`;/)?.[1] || '';
assert.match(searchQuery, /steps\[\]/);
assert.match(searchQuery, /prescriptions\[\]/);
assert.match(searchQuery, /figures\[\]/);
assert.match(searchQuery, /sources\[\]/);
assert.match(searchQuery, /nested/);
assert.doesNotThrow(() => new Function(api));

const fixtureIndex = medicalHubFixtureResponse('/api/medical-hub?mode=index');
assert.equal(fixtureIndex.status, 200);
assert.equal(fixtureIndex.payload.ok, true);
assert.equal(fixtureIndex.payload.generatedAt, FIXTURE_GENERATED_AT);
assert.equal(fixtureIndex.payload.count, fixtureIndexItems.length);
assert.equal(fixtureIndex.payload.book.sourceType, 'google-drive');
assert.equal(fixtureBook.sourceRevisionId, 'fixture-revision-2026-09-04');
assert.ok(fixtureIndex.payload.items.some(item => item.contentKind === 'chapter'));
assert.ok(fixtureIndex.payload.items.some(item => item.contentKind === 'lesson'));
assert.ok(fixtureIndex.payload.items.some(item => item.title.length > 100), 'Browser fixture must exercise long Medical Hub names');

const fixtureTopicId = 'medicalhub-dod-ch01-sub01';
const fixtureDetail = medicalHubFixtureResponse(`/api/medical-hub?id=${fixtureTopicId}`);
assert.equal(fixtureDetail.status, 200);
assert.equal(fixtureDetail.payload.item._id, fixtureTopicId);
assert.ok(fixtureDetail.payload.item.relatedTopics.length >= 2, 'Browser fixture must include nested lesson sections');
assert.ok(fixtureDetail.payload.item.contentOrder.length >= 3, 'Browser fixture must preserve source block order');
assert.ok(fixtureDetail.payload.item.sources[0].url.includes('drive.google.com/file/d/1c1UE1EYQYOji69nyn6OB3prY96YInmFv'));
assert.equal(fixtureDetail.payload.item.sourceDocument.revisionId, fixtureBook.sourceRevisionId);
assert.equal(fixtureDetail.payload.item.reviewStatus, 'verified');
assert.equal(fixtureDetail.payload.item.reviewedBy, 'Dr. Arta Krasniqi · QA fixture');
assert.equal(fixtureDetail.payload.item.lastReviewedAt, '2026-08-28T10:30:00.000Z');
assert.equal(fixtureDetailsById.has(fixtureTopicId), true);

const fixtureSearch = medicalHubFixtureResponse('/api/medical-hub?mode=search&q=komunikim&chapter=4');
assert.equal(fixtureSearch.status, 200);
assert.ok(fixtureSearch.payload.count >= 1);
assert.ok(fixtureSearch.payload.items.every(item => item.chapterNumber === 4));
assert.ok(fixtureSearch.payload.items.some(item => item.title.includes('Komunikimi')));
assert.equal(medicalHubFixtureResponse('/api/medical-hub?id=missing-topic').status, 404);
assert.equal(medicalHubFixtureResponse('/api/medical-hub?mode=unknown').status, 400);

assert.match(imageApi, /ALLOWED_HOSTS/);
assert.match(imageApi, /upload\.wikimedia\.org/);
assert.match(imageApi, /commons\.wikimedia\.org/);
assert.match(imageApi, /authorized\(req\)/);
assert.match(imageApi, /MAX_IMAGE_BYTES/);
assert.match(imageApi, /type\.startsWith\('image\/'\)/);
assert.equal(imageProxy._test.safeImageUrl('https://upload.wikimedia.org/example.png')?.hostname, 'upload.wikimedia.org');
assert.equal(imageProxy._test.safeImageUrl('https://commons.wikimedia.org/wiki/Special:Redirect/file/Test.jpg')?.hostname, 'commons.wikimedia.org');
assert.equal(imageProxy._test.safeImageUrl('http://upload.wikimedia.org/example.png'), null);
assert.equal(imageProxy._test.safeImageUrl('https://example.com/example.png'), null);

assert.match(css, /Medical Hub final reader v13 — canonical DRx clinical workspace/);
assert.match(css, /\.sr-only\s*\{[\s\S]*?clip:rect\(0,0,0,0\)/);
assert.match(css, /\.app-shell\s*\{\s*min-height:100vh/);
assert.match(css, /\.sidebar\s*\{[\s\S]*?position:fixed[\s\S]*?display:flex/);
assert.match(css, /\.nav-item\s*\{[\s\S]*?display:flex[\s\S]*?text-decoration:none/);
assert.match(css, /\.nav-icon \.icon\s*\{\s*width:18px;\s*height:18px/);
assert.match(css, /\.main-shell\s*\{\s*min-width:0;\s*margin-left:var\(--sidebar\)/);
assert.match(css, /\.topbar\s*\{[\s\S]*?position:sticky[\s\S]*?display:flex/);
assert.match(css, /\.icon\s*\{\s*display:block;\s*width:18px;\s*height:18px/);
assert.match(css, /@media\(max-width:1023px\)[\s\S]*?\.sidebar\.is-open\s*\{\s*transform:translateX\(0\)/);
assert.doesNotMatch(css, /Medical Hub reader v4|Medical Hub navigation v3|Screenshot fixes v11/);
assert.match(css, /\.hub-command-footer/);
assert.match(css, /\.hub-topic-nav/);
assert.match(css, /\.hub-search-clear/);
assert.match(css, /\.hub-search\.is-searching/);
assert.match(css, /\.ck-review-badge/);
assert.match(css, /\.ck-quick-summary/);
assert.match(css, /\.ck-section-index/);
assert.match(css, /\.ck-step-number/);
assert.match(css, /\.ck-rx-title/);
assert.match(css, /\.ck-rx-drug-line/);
assert.match(css, /\.ck-book-rx-alternative/);
assert.match(css, /\.ck-figure-fallback/);
assert.match(css, /\.ck-ordered-content/);
assert.match(css, /\.ck-protocol-list/);
assert.match(css, /\.ck-document-pagination/);
assert.match(css, /\.ck-loading-spinner/);
assert.match(css, /Medical Hub book workspace v20/);
assert.match(css, /\.hub-navigation-drawer/);
assert.match(css, /\.hub-rail-row/);
assert.match(css, /\.ck-source-panel/);
assert.match(css, /\.ck-modern-section-heading/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Medical Hub backend-first chapter/lesson reader contract passed.');
