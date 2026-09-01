'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const library = read('lib/user-library.js');
const sidebar = read('sidebar-taxonomy-v3.js');
const client = read('phase9-personal-entities-client.js');

assert.match(library, /exactCount/);
assert.match(library, /function getPersonalSummary\(/);
assert.match(library, /queryValue\(req, 'view'\) === 'summary'/);
assert.match(library, /countPrivateRows\('user_favorites'[\s\S]*entity_type:'eq\.product'/);
assert.match(library, /countPrivateRows\('user_notes'[\s\S]*entity_type:'eq\.product'/);
assert.match(library, /deleted_at', 'is\.null'/);
assert.match(library, /prefer:'count=exact'/);
assert.match(library, /Range:'0-0'/);

assert.match(sidebar, /PERSONAL_SUMMARY_API = '\/api\/user-library\?view=summary'/);
assert.match(sidebar, /PERSONAL_COUNT_CACHE_KEY/);
assert.match(sidebar, /applyPersonalCounts\(/);
assert.match(sidebar, /syncPersonalCounts\(/);
assert.match(sidebar, /drx:phase9-personal-changed/);
assert.match(sidebar, /find\('\/index\.html#favorites'\), find\('\/index\.html#notes'\), find\('\/recetat\.html'\)/);

assert.match(client, /clientUpdatedAt:text\(row\.clientUpdatedAt\)/);
assert.match(client, /serverUpdatedAt:text\(row\.serverUpdatedAt\)/);

assert.doesNotThrow(() => new Function(sidebar));
assert.doesNotThrow(() => new Function(client));

console.log('Personal library summary, site-wide badges and timestamp contract passed.');
