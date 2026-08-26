'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const syntax = file => execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

['registry-desktop-lite.js', 'registry-unified-table.js', 'registry-user-personalization.js'].forEach(syntax);

const desktop = read('registry-desktop-lite.js');
const unified = read('registry-unified-table.js');
const personal = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');

assert.match(desktop, /registry-row-actions-menu-phase2-v1: trigger is visible from first desktop render/);
assert.match(desktop, /data-row-actions-menu="true"/);
assert.doesNotMatch(
  desktop,
  /data-row-actions-menu="true"[^>]*\bhidden\b/,
  'The canonical desktop ⋯ trigger must be visible in first-render markup.'
);

assert.match(unified, /registry-row-actions-menu-phase2-v1: unified reconciliation keeps the trigger visible/);
assert.match(unified, /button\.hidden = false/);
assert.match(unified, /button\.removeAttribute\('aria-hidden'\)/);
assert.doesNotMatch(
  unified,
  /data-row-actions-menu="true"[^>]*\bhidden\b/,
  'Unified synthetic rows must not recreate a hidden ⋯ trigger.'
);

assert.match(personal, /registry-row-actions-menu-phase2-v1: one delegated table listener owns the canonical trigger/);
assert.match(personal, /function ensureActionsMenu\(\)/);
assert.match(personal, /menu\.id = 'registryRowActionsMenu'/);
assert.match(personal, /menu\.dataset\.registryRowActionsMenuSingleton = 'true'/);
assert.match(personal, /function bindTableActions\(\)/);
assert.match(personal, /tbody\.dataset\.registryRowActionsBound === 'true'/);
assert.equal(
  (personal.match(/tbody\.addEventListener\('click', handleTableActionsClick\)/g) || []).length,
  1,
  'Exactly one delegated click listener may own row actions on the current #tbody.'
);
assert.match(personal, /const trigger = event\.target\.closest\?\.\('\[data-row-actions-menu\]'\)/);
assert.match(personal, /const favoriteActive = isFavoriteRow\(row\)/);
assert.match(personal, /const noteActive = hasNoteKey\(profile\.noteKey\)/);
assert.match(personal, /favoriteLabel\.textContent = favoriteBusy \? 'Duke ruajtur…' : favoriteActive \? 'Hiqe nga Favoritet' : 'Ruaje si favorit'/);
assert.match(personal, /noteLabel\.textContent = noteBusy \? 'Duke ruajtur…' : noteActive \? 'Shiko \/ ndrysho shënimin' : 'Shto shënim'/);
assert.match(personal, /void toggleFavorite\(row, menuFavorite\)/);
assert.match(personal, /if \(row\) openNoteDialog\(row\)/);
assert.match(personal, /window\.addEventListener\('pageshow', \(\) => \{ closeActionsMenu\(\); schedule\(1\); \}\)/);
assert.match(personal, /if \(phoneLiteOwnsViewport\(\)\) return;/);

assert.doesNotMatch(personal, /function favoriteButton\(/, 'Legacy dynamic star injection must be removed.');
assert.doesNotMatch(personal, /function noteButton\(/, 'Legacy dynamic pencil injection must be removed.');
assert.doesNotMatch(personal, /data-row-favorite-toggle/, 'Desktop personalization must no longer create/listen for per-row favorite buttons.');
assert.doesNotMatch(personal, /data-row-note-toggle/, 'Desktop personalization must no longer create/listen for per-row note buttons.');

const toggleStart = personal.indexOf('async function toggleFavorite');
const optimisticMutation = personal.indexOf('favorites.add(key)', toggleStart);
const networkSync = personal.indexOf("await syncMutation('favorite', key)", toggleStart);
assert.ok(toggleStart >= 0 && optimisticMutation > toggleStart && networkSync > optimisticMutation,
  'Favorite state must update locally before waiting on Supabase sync.');

assert.match(css, /\/\* registry-row-actions-menu-phase2-v1 \*\//);
assert.match(css, /\.registry-row-actions-menu\{/);
assert.match(css, /\.registry-row-actions-menu\[hidden\]\{display:none!important\}/);
assert.match(css, /@media\(max-width:767px\)\{[\s\S]*\.registry-row-actions-menu,[\s\S]*\.registry-row-more-toggle\{display:none!important\}/,
  'Phone owner must stay untouched by the desktop menu.');
assert.match(css, /\.registry-row-favorite-toggle,[\s\S]*\.registry-row-note-toggle\{display:none!important\}/,
  'Any stale legacy row controls must be defensive-hidden on desktop.');

console.log('✓ Registry row actions Phase 2 passed: visible canonical ⋯, one #tbody delegation, one singleton menu, live Favorite/Note state, optimistic save, legacy row icons removed, and mobile ownership preserved.');
