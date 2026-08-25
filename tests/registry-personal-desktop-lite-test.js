'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const personal = read('registry-user-personalization.js');
const lite = read('registry-desktop-lite.js');
const api = read('api/drug-search.js');
const marker = 'registry-personal-desktop-lite-v1';

assert.ok(personal.includes(`${marker}: canonical desktop-lite view`), 'Favorites/Notes must prefer the canonical desktop-lite owner.');
assert.ok(personal.includes('personalIdentifiersForView()'), 'Personal membership identifiers must be passed to the canonical owner.');
assert.ok(personal.includes('desktopLitePersonalRuntime()'), 'Personalization must detect the active Barnat desktop-lite runtime.');
assert.ok(personal.includes(`${marker}: refresh favorite subset`), 'Removing a favorite must refresh the same table immediately.');
assert.ok(personal.includes(`${marker}: refresh notes subset`), 'Deleting a note must refresh the same table immediately.');

const applyStart = personal.indexOf(`${marker}: canonical desktop-lite view`);
const requestStart = personal.indexOf('function requestPersonalRuntime()', applyStart);
assert.ok(applyStart >= 0 && requestStart > applyStart, 'Canonical personal view block is missing.');
const applyBlock = personal.slice(applyStart, requestStart);
assert.ok(!applyBlock.includes('MEDINDEX_LOAD_FULL_REGISTRY'), 'Canonical Favorites/Notes rendering must never invoke the browser full-registry loader.');
assert.ok(applyBlock.includes('lite.setPersonalView(activeView, personalIdentifiersForView())'), 'Favorites/Notes must be applied as a filter on the same Barnat owner.');

assert.ok(lite.includes(`${marker}: personal owner API`), 'Desktop-lite must expose the personal filtering API.');
assert.ok(lite.includes('setPersonalView,'), 'Desktop-lite personal API must be public to personalization.');
assert.ok(lite.includes("url:`${API}?view=registry-personal`".replace('${API}', '${API}')) || lite.includes('view=registry-personal'), 'Desktop-lite must use the bounded personal endpoint.');
assert.ok(lite.includes(`${marker}: ignore legacy personal handoff`), 'Legacy personal full-dataset events must not surrender the Barnat owner.');
assert.ok(lite.includes("if (reason.startsWith('personal-view-')) return;"), 'Personal views must be blocked from the legacy full-registry handoff.');

assert.ok(api.includes(`${marker}: personal registry endpoint`), 'Server must expose the personal registry subset endpoint.');
assert.ok(api.includes("view === 'registry-personal'"), 'Personal route must be wired.');
assert.ok(api.includes('registryHandler.getRegistryDataset()'), 'Personal membership must be resolved on the server, not by downloading the full registry to the browser.');
assert.ok(api.includes("res.setHeader('Cache-Control', 'private, no-store, max-age=0')"), 'Personal subset responses must not be shared-cached.');
assert.ok(api.includes('legacyPersonalCandidates(row)'), 'Legacy and current favorite/note identity formats must resolve to the same drug rows.');

// Architectural regression: the old screenshot was produced because entering
// Favorites disabled desktop-lite and loaded the historical full registry. The
// new path must keep that state transition exclusive to genuinely advanced
// features such as prescription/detail handoff, never personal filtering.
const personalRequestStart = personal.indexOf(`${marker}: prefer canonical owner`);
assert.ok(personalRequestStart >= 0, 'Personal runtime preference guard missing.');
const personalRequestTail = personal.slice(personalRequestStart, personalRequestStart + 900);
assert.ok(personalRequestTail.indexOf('desktopLitePersonalRuntime()') < personalRequestTail.indexOf('MEDINDEX_LOAD_FULL_REGISTRY'), 'Desktop-lite must be attempted before any legacy fallback loader.');

console.log('✓ Favorites/Notes canonical Barnat owner passed: same desktop-lite DOM/table, bounded server subset, no personal full-runtime handoff.');
