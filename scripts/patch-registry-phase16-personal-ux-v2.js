'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ui = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');
const html = read('index.html');

function requireText(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

requireText(ui, "PHASE8_UX_VERSION = 'registry-personal-ux-phase8-v1'", 'Phase 8 UX marker is missing from canonical personalization source.');
requireText(ui, 'let libraryReady = false', 'Phase 8 library readiness state is missing.');
requireText(ui, "let librarySyncState = 'loading'", 'Phase 8 library sync state is missing.');
requireText(ui, 'function settleLibrary(detail = {})', 'Phase 8 library readiness bridge is missing.');
requireText(ui, 'window.MEDINDEX_LIBRARY_READY', 'Phase 8 must wait for canonical user-library readiness.');
requireText(ui, 'function personalTotal()', 'Phase 8 canonical personal total is missing.');
requireText(ui, 'function personalFilteredCount()', 'Phase 8 filtered-count bridge is missing.');
requireText(ui, 'runtime()?.getFilteredCount?.()', 'Phase 8 must use native pre-pagination filtered counts.');
requireText(ui, 'medindex-personal-filtered-empty', 'Phase 8 filtered-empty state is missing.');
requireText(ui, 'Asnjë rezultat me filtrat aktualë', 'Phase 8 filtered-empty copy is missing.');
requireText(ui, 'Ende nuk ke barna të ruajtura', 'Phase 8 Favorites empty state is missing.');
requireText(ui, 'Nuk ke ende shënime', 'Phase 8 Notes empty state is missing.');
requireText(ui, "librarySyncState = 'saving'", 'Phase 8 saving state is missing.');
requireText(ui, "librarySyncState = 'pending'", 'Phase 8 pending state is missing.');
requireText(ui, "librarySyncState = 'synced'", 'Phase 8 synced state is missing.');
requireText(ui, 'data-personal-banner-sync', 'Phase 8 canonical sync-status surface is missing.');
requireText(ui, 'role="status" aria-live="polite"', 'Phase 8 sync feedback must remain accessible.');
requireText(ui, 'Ruajtur lokalisht · sinkronizimi në pritje', 'Phase 8 pending persistence copy is missing.');
requireText(ui, 'Ruajtur lokalisht · offline', 'Phase 8 offline persistence copy is missing.');
requireText(ui, '✓ Sinkronizuar', 'Phase 8 synced confirmation copy is missing.');
requireText(ui, 'data-mi-phase8-favorite-count', 'Phase 8 mobile Favorite count bridge is missing.');
requireText(ui, 'data-mi-phase8-note-count', 'Phase 8 mobile Notes count bridge is missing.');

const applyStart = ui.indexOf('function applyRuntimeView()');
const setPersonalView = ui.indexOf('if (api.setPersonalView) api.setPersonalView(activeView);', applyStart);
const clearLoading = ui.indexOf("document.body.classList.remove('medindex-personal-view-loading');", applyStart);
if (!(applyStart >= 0 && setPersonalView > applyStart && clearLoading > setPersonalView)) {
  throw new Error('Phase 8 must apply the personal runtime filter before revealing rows.');
}

const setViewStart = ui.indexOf('function setView(view)');
const addLoading = ui.indexOf("document.body.classList.add('medindex-personal-view-loading')", setViewStart);
const applyRuntime = ui.indexOf('applyRuntimeView()', setViewStart);
if (!(setViewStart >= 0 && addLoading > setViewStart && applyRuntime > addLoading)) {
  throw new Error('Phase 8 personal-view transition must enter loading before runtime handoff.');
}

requireText(css, '/* registry-personal-ux-phase8-v1 */', 'Phase 8 UX CSS marker is missing.');
requireText(css, 'medindex-personal-view-loading #registryContent #tbody{visibility:hidden!important}', 'Phase 8 stale-row hiding is missing.');
requireText(css, 'Duke përgatitur pamjen personale', 'Phase 8 loading feedback is missing.');
requireText(css, 'medindex-personal-empty-visible #dataTable', 'Phase 8 canonical empty-state table suppression is missing.');
requireText(css, 'data-personal-banner-sync][data-state="saving"]', 'Phase 8 saving style is missing.');
requireText(css, 'data-personal-banner-sync][data-state="pending"]', 'Phase 8 pending style is missing.');
requireText(css, 'data-personal-banner-sync][data-state="synced"]', 'Phase 8 synced style is missing.');
requireText(css, 'prefers-reduced-motion:reduce', 'Phase 8 reduced-motion support is missing.');

requireText(html, 'registry-user-personalization.css?v=20260816-7&ux=20260817-1', 'Phase 8 CSS publication version is missing.');
requireText(html, 'registry-user-personalization.js?v=20260816-7&ux=20260817-1', 'Phase 8 JS publication version is missing.');

if (/setInterval\s*\(/.test(ui)) throw new Error('Phase 8 personalization must remain event-driven.');
if (/MutationObserver/.test(ui)) throw new Error('Phase 8 personalization must not add DOM observers.');

console.log('Phase 8 personal UX polish passed: canonical source already owns loading, empty/filter states, unified counts and sync feedback; this stage is audit-only.');
