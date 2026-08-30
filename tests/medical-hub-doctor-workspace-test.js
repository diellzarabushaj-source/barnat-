'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('medical-hub.html');
const js = read('medical-hub-v2.js');
const css = read('medical-hub-v2.css');

assert.match(html, /data-drx-app="medical-hub-v2"/);
const cssAssetVersion = html.match(/medical-hub-v2\\.css\\?v=(\\d+)/)?.[1] || '';
const jsAssetVersion = html.match(/medical-hub-v2\\.js\\?v=(\\d+)/)?.[1] || '';
assert.match(cssAssetVersion,/^\\d+$/);
assert.equal(jsAssetVersion,cssAssetVersion,'Medical Hub CSS/JS cache versions must stay in sync');
assert.match(html, /drx-dashboard-stripe\.css\?v=drx-dashboard-stripe-v4/);
assert.match(html, /drx-unified-sidebar/);
assert.match(html, /\/brand\/drx-horizontal-on-dark\.svg/);
assert.match(html, /id="learningSearch"/);
assert.match(html, /id="learningSearchClear"/);
assert.match(html, /id="learningCategory"/);
assert.match(html, /id="learningTopic"/);
assert.match(html, /id="learningResultStatus"/);
assert.match(html, /id="previousTopicButton"/);
assert.match(html, /id="nextTopicButton"/);
assert.match(html, /id="learningTopicPosition"/);
assert.doesNotMatch(html, /tailadmin-|auth-client|clinical-knowledge\.css|medical-hub\.css/);

assert.match(js, /const INDEX_QUERY/);
assert.match(js, /const DETAIL_QUERY/);
assert.match(js, /_type == "learningTopic"/);
assert.match(js, /reviewStatus != "archived"/);
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
assert.match(js, /function syncUrl\(\)/);
assert.match(js, /function restoreUrl\(\)/);
assert.match(js, /data-hub-section/);
assert.match(js, /data-topic-jump/);
assert.match(js, /sidebar-taxonomy-v3/);
assert.match(js, /ensureAuth\(\)/);
assert.match(js, /ensureSanity\(\)/);

const indexQuery = js.match(/const INDEX_QUERY = \`([\s\S]*?)\`;/)?.[1] || '';
assert.ok(indexQuery, 'Medical Hub index query must be extractable');
assert.doesNotMatch(indexQuery, /steps\[\]|prescriptions\[\]|redFlags|whenToRefer|relatedProtocols\[\]->/, 'Medical Hub index query must stay lightweight');

const detailQuery = js.match(/const DETAIL_QUERY = \`([\s\S]*?)\`;/)?.[1] || '';
assert.match(detailQuery, /steps\[\]/);
assert.match(detailQuery, /prescriptions\[\]/);
assert.match(detailQuery, /redFlags/);
assert.match(detailQuery, /whenToRefer/);
assert.match(detailQuery, /relatedProtocols\[\]->/);
assert.doesNotThrow(() => new Function(js));

assert.match(css, /Medical Hub reader v2 — canonical clinical document/);
assert.match(css, /\.hub-command-footer/);
assert.match(css, /\.hub-topic-nav/);
assert.match(css, /\.hub-search-clear/);
assert.match(css, /\.ck-review-badge/);
assert.match(css, /\.ck-quick-summary/);
assert.match(css, /\.ck-section-index/);
assert.match(css, /\.ck-step-number/);
assert.match(css, /\.ck-rx-title/);
assert.match(css, /\.ck-protocol-list/);
assert.match(css, /\.ck-document-pagination/);
assert.match(css, /\.ck-loading-spinner/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);

console.log('Medical Hub v2 scalable Stripe clinical reader contract passed.');
