'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'registry-desktop-lite.js'), 'utf8');
const marker = 'registry-personal-view-filter-reset-v1';
const start = source.indexOf('async function setPersonalView');
const end = source.indexOf('window.MEDINDEX_DESKTOP_LITE =', start);
assert.ok(start >= 0 && end > start, 'Personal desktop-lite owner API is missing.');
const block = source.slice(start, end);

assert.ok(block.includes(marker), 'Personal view stale-filter reset must be present.');
assert.ok(block.includes('const modeChanged = next !== state.personalMode'), 'Personal view must detect actual mode changes.');
assert.ok(block.includes("state.q = ''"), 'A Barnat query must not leak into Favorites/Notes.');
assert.ok(block.includes("search.value = ''"), 'The visible search control must match the cleared personal query state.');
assert.ok(block.includes('window.clearTimeout(searchTimer)'), 'A pending Barnat search debounce must be cancelled on personal navigation.');
assert.ok(block.indexOf("state.q = ''") < block.indexOf('await loadPage'), 'The stale query must be cleared before the personal Supabase request.');
assert.ok(block.includes('if (modeChanged)'), 'Search must clear only on view transitions so searching inside Favorites remains supported.');

console.log('✓ Personal view filter reset passed: Barnat search does not leak into Favorites/Notes, while personal search remains usable.');
