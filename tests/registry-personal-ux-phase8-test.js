'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');
const html = read('index.html');
const patch = read('scripts/patch-registry-phase16-personal-ux-v2.js');
const offlineManifestPatch = read('scripts/patch-offline-shell-manifest.js');

for (const file of [
  'registry-user-personalization.js',
  'scripts/patch-registry-phase16-personal-ux-v2.js',
  'scripts/patch-offline-shell-manifest.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });
}

assert.match(ui, /PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1'/, 'Built personalization controller must carry the Phase 8 UX marker.');
assert.match(ui, /let libraryReady = false/);
assert.match(ui, /let librarySyncState = 'loading'/);
assert.match(ui, /function settleLibrary\(detail = \{\}\)/, 'Library readiness must be explicit rather than inferred from cached counts.');
assert.match(ui, /window\.MEDINDEX_LIBRARY_READY/, 'Personal views must wait for the canonical user-library readiness promise when available.');

assert.match(ui, /function personalTotal\(\)/, 'Personal total must come from the canonical Favorites\/Notes cache.');
assert.match(ui, /function personalFilteredCount\(\)/, 'Filtered count must come from the native registry runtime.');
assert.match(ui, /runtime\(\)\?\.getFilteredCount\?\.\(\)/, 'Filtered-empty UX must use the native pre-pagination runtime count.');
assert.match(ui, /medindex-personal-filtered-empty/, 'Filtered-empty and true-empty states must remain distinguishable.');
assert.match(ui, /Asnjë rezultat me filtrat aktualë/, 'Filtered-empty copy is missing.');
assert.match(ui, /Ende nuk ke barna të ruajtura/, 'True Favorites empty state is missing.');
assert.match(ui, /Nuk ke ende shënime/, 'True Notes empty state is missing.');

assert.match(ui, /librarySyncState = 'saving'/, 'Saving state is missing.');
assert.match(ui, /librarySyncState = 'pending'/, 'Pending state is missing.');
assert.match(ui, /librarySyncState = 'synced'/, 'Synced state is missing.');
assert.match(ui, /data-personal-banner-sync/, 'Personal view needs one canonical live sync status surface.');
assert.match(ui, /role="status" aria-live="polite"/, 'Sync feedback must be announced accessibly.');
assert.match(ui, /Ruajtur lokalisht · sinkronizimi në pritje/, 'Pending persistence copy is missing.');
assert.match(ui, /Ruajtur lokalisht · offline/, 'Offline persistence copy is missing.');
assert.match(ui, /✓ Sinkronizuar/, 'Synced confirmation copy is missing.');

assert.match(ui, /data-mi-phase8-favorite-count/, 'Mobile Favorite count must share the canonical update path.');
assert.match(ui, /data-mi-phase8-note-count/, 'Mobile Notes count must share the canonical update path.');

const applyStart = ui.indexOf('function applyRuntimeView()');
const setViewIndex = ui.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
const clearLoadingIndex = ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
assert(applyStart >= 0 && setViewIndex > applyStart && clearLoadingIndex > setViewIndex, 'The runtime must apply the personal filter before stale rows can become visible.');

const setStart = ui.indexOf('function setView(view)');
const addLoadingIndex = ui.indexOf("document.body.classList.add('medindex-personal-view-loading')", setStart);
const applyIndex = ui.indexOf('applyRuntimeView()', setStart);
assert(setStart >= 0 && addLoadingIndex > setStart && applyIndex > addLoadingIndex, 'Personal-view transition must enter loading state before runtime handoff.');

assert.match(css, /registry-personal-ux-phase8-v1/, 'Phase 8 CSS marker is missing.');
assert.match(css, /medindex-personal-view-loading #registryContent #tbody\{visibility:hidden!important\}/, 'Stale personal rows must be hidden during handoff.');
assert.match(css, /Duke përgatitur pamjen personale/, 'Personal-view loading state needs visible feedback.');
assert.match(css, /medindex-personal-empty-visible #dataTable/, 'Canonical empty state must not compete visually with an empty table.');
assert.match(css, /data-personal-banner-sync\]\[data-state="saving"\]/);
assert.match(css, /data-personal-banner-sync\]\[data-state="pending"\]/);
assert.match(css, /data-personal-banner-sync\]\[data-state="synced"\]/);
assert.match(css, /prefers-reduced-motion:reduce/, 'Loading polish must respect reduced motion.');

assert.match(html, /registry-user-personalization\.css\?v=20260816-7&ux=20260817-1/, 'Phase 8 CSS cache-buster is missing.');
assert.match(html, /registry-user-personalization\.js\?v=20260816-7&ux=20260817-1/, 'Phase 8 JS cache-buster is missing.');
assert.match(offlineManifestPatch, /require\('\.\/patch-registry-phase16-personal-ux-v2\.js'\)/, 'Phase 8 UX patch must run deterministically before the final offline manifest.');
assert.match(patch, /Phase 8 personal UX polish passed/, 'Phase 8 patch needs its own build audit.');
assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'patch-registry-phase16-personal-ux.js')), false, 'Superseded broken Phase 8 patch must stay deleted.');

assert.doesNotMatch(ui, /setInterval\s*\(/, 'Phase 8 UX must remain event-driven.');
assert.doesNotMatch(ui, /MutationObserver/, 'Phase 8 UX must not add DOM polling/observers.');

console.log('Phase 9 regression lock passed: Phase 8 personal-view loading, empty/filter states, unified counts and sync feedback are protected by CI.');
