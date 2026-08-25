'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'registry-desktop-lite.js'), 'utf8');
const marker = 'registry-personal-supabase-immediate-v1';
const start = source.indexOf('async function fetchPersonalLogicalPage');
const end = source.indexOf('function setBusy', start);
assert.ok(start >= 0 && end > start, 'Personal desktop-lite fetch block is missing.');
const block = source.slice(start, end);

assert.ok(block.includes(marker), 'Deterministic Supabase mutation barrier must be present.');
assert.ok(block.includes('library.diagnostics()'), 'Personal fetch must inspect actual library revision state.');
assert.ok(block.includes('diagnostics?.dirty'), 'Dirty local membership must be detected.');
assert.ok(block.includes('localRevision > syncedRevision'), 'Unsynced revision ordering must be detected.');
assert.ok(block.includes('await library.syncNow()'), 'A pending favorite/note mutation must reach Supabase before personal rows are read.');
assert.ok(!block.includes('setTimeout(resolve, 1600)'), 'Personal fetch must not race Supabase sync against a fixed timeout.');
assert.ok(!block.includes('Promise.race(['), 'Personal fetch must not permit a stale timeout winner.');
assert.ok(block.indexOf('await library.syncNow()') < block.indexOf("fetch(API + '?view=registry-personal'"), 'Supabase membership sync must complete before the personal row request.');

console.log('✓ Immediate Supabase personal read passed: existing views do not resync unnecessarily, pending revisions are flushed before readback, and no Ctrl+Shift+R race remains.');
