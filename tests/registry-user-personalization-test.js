'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const ui = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');
const uxPhase1 = read('registry-ux-phase1.js');
const uxPhase1Css = read('registry-ux-phase1.css');
const client = read('user-library-client.js');
const authClient = read('auth-client.js');
const server = read('lib/user-library.js');
const shell = read('tailadmin-shell-core.js');
const pkg = read('package.json');
const runtimePatch = read('scripts/patch-registry-personalization-runtime.js');
const runtime = read('app-runtime.js');

assert.doesNotThrow(() => new Function(ui), 'Personalization UI must parse as JavaScript');
assert.doesNotThrow(() => new Function(uxPhase1), 'Registry UX phase 1 must parse as JavaScript');
assert.doesNotThrow(() => new Function(client), 'User library client must parse as JavaScript');
assert.doesNotThrow(() => new Function(authClient), 'Auth client must parse as JavaScript');
assert.doesNotThrow(() => new Function(server), 'User library server must parse as JavaScript');
assert.doesNotThrow(() => new Function(runtimePatch), 'Registry personalization runtime patch must parse as JavaScript');

assert.match(html, /registry-user-personalization\.css\?v=20260816-7/, 'Latest mobile-bridge personalization CSS is not loaded');
assert.match(html, /registry-user-personalization\.js\?v=20260816-7/, 'Latest mobile-bridge personalization JS is not loaded');
assert.match(html, /registry-ux-phase1\.css\?v=20260810-1/, 'Phase 1 premium registry CSS is not loaded');
assert.match(html, /registry-ux-phase1\.js\?v=20260816-2/, 'Latest canonical toolbar UX is not loaded');
assert.doesNotMatch(html, /registry-personalization-polish\.js|registry-favorites-control\.js|registry-favorites-control\.css/, 'Duplicate personalization controllers must not be loaded');
assert.ok(html.indexOf('registry-unified-table.js') < html.indexOf('registry-user-personalization.js'), 'Personalization must run after unified table');
assert.ok(html.indexOf('registry-user-personalization.js') < html.indexOf('registry-ux-phase1.js'), 'Phase 1 UX must enhance the stable personalization layer, not race it');
assert.doesNotMatch(html, /<option value="4006"[^>]*>Favoritet<\/option>/, 'Favorites must not use a page-size hack');

assert.match(pkg, /patch-registry-personalization-runtime\.js/, 'Native personal-view runtime patch must run in the production build');
assert.match(runtimePatch, /rows = rows\.filter\(registryRowIsFavorite\)/, 'Runtime patch must filter favorites before pagination');
assert.match(runtimePatch, /rows = rows\.filter\(registryRowHasNote\)/, 'Runtime patch must filter notes before pagination');
assert.match(runtimePatch, /setNotesOnly:setRegistryNotesOnly/, 'Runtime patch must expose native notes filtering');
assert.match(runtimePatch, /setPersonalView:setRegistryPersonalView/, 'Runtime patch must expose one personal-view API');
assert.match(runtimePatch, /new Set\(\[50, 100, 250, 500\]\)/, 'Runtime patch must keep bounded page sizes');
assert.match(runtimePatch, /state\.pageSize = sanitizeRegistryPageSize\(requested\)/, 'Runtime must fail closed on oversized page-size requests');
assert.match(runtimePatch, /medindex:registry-rendered/, 'Runtime must expose deterministic render completion instead of DOM polling');
assert.match(runtime, /favoritesOnly: false/, 'Generated runtime is missing favorites state');
assert.match(runtime, /notesOnly: false/, 'Generated runtime is missing notes state');
assert.match(runtime, /rows = rows\.filter\(registryRowIsFavorite\)/, 'Generated runtime is missing native favorites filtering');
assert.match(runtime, /rows = rows\.filter\(registryRowHasNote\)/, 'Generated runtime is missing native notes filtering');
assert.match(runtime, /setPersonalView:setRegistryPersonalView/, 'Generated runtime is missing unified personal-view API');
assert.match(runtime, /window\.MedIndexRegistryRuntime = Object\.freeze/, 'Generated runtime is missing personalization API');
assert.match(runtime, /state\.pageSize = sanitizeRegistryPageSize\(requested\)/, 'Generated runtime still accepts arbitrary page sizes');
assert.doesNotMatch(runtime, /REGISTRY_ALLOWED_PAGE_SIZES = new Set\(\[50, 100, 250, 500, 4006\]\)/, 'Generated runtime must not retain the 4006-row favorites path');

assert.match(ui, /VERSION = 'registry-user-personalization-v3\.3\.0'/, 'Canonical v3.3 personalization controller is not active');
assert.match(ui, /VIEW_ALL = 'all'/, 'All view is missing');
assert.match(ui, /VIEW_FAVORITES = 'favorites'/, 'Favorites view is missing');
assert.match(ui, /data-row-actions-menu/, 'Each visible full-runtime row must expose the stable canonical three-dot action trigger');
assert.match(ui, /registryRowActionsMenu/, 'The canonical singleton row-actions menu is missing');
assert.match(ui, /data-row-menu-favorite/, 'The singleton menu must expose the canonical favorite action');
assert.match(ui, /data-row-menu-note/, 'The singleton menu must expose the canonical note action');
assert.doesNotMatch(ui, /function favoriteButton\(/, 'Legacy per-row favorite button injection must stay retired after Phase 2');
assert.doesNotMatch(ui, /function noteButton\(/, 'Legacy per-row note button injection must stay retired after Phase 2');
assert.doesNotMatch(ui, /data-row-favorite-toggle/, 'Legacy per-row favorite controls must not return after Phase 2');
assert.doesNotMatch(ui, /data-row-note-toggle/, 'Legacy per-row note controls must not return after Phase 2');
assert.match(ui, /tbody\.addEventListener\('click', handleTableActionsClick\)/, 'Row actions must use one delegated tbody listener');
assert.match(ui, /dataset\.registryRowActionsBound === 'true'/, 'Delegated row-action binding must be idempotent');
assert.match(ui, /registryNoteDialog/, 'Canonical personal-note dialog is missing');
assert.match(ui, /data-note-dialog-text/, 'Note dialog editor is missing');
assert.match(ui, /data-note-dialog-save/, 'Note save action is missing');
assert.match(ui, /data-note-dialog-delete/, 'Note delete action is missing');
assert.match(ui, /maxlength="\$\{NOTE_MAX\}"/, 'Personal notes must have a bounded length');
assert.match(ui, /registryNumber\(row\)/, 'Notes must use stable registry identity when available');
assert.match(ui, /MedIndexUserLibrary\?\.syncNow/, 'Notes and favorites must schedule persistent user-library sync');
assert.match(ui, /refreshFavorites/, 'Favorite changes must invalidate the native registry filter immediately');
assert.match(ui, /refreshNotes/, 'Note changes must invalidate the native registry filter immediately');
assert.match(ui, /setPersonalView/, 'Sidebar and toolbar personal views must share one runtime view setter');
assert.match(ui, /#shenimet/, 'Notes URL state is missing');
assert.match(ui, /data-toolbar-note-count/, 'Toolbar notes count is missing');
assert.match(ui, /notesNavCount/, 'Sidebar notes count is missing');
assert.match(ui, /metaKey \|\| event\.ctrlKey/, 'Personal note keyboard save shortcut is missing');
assert.match(ui, /const favoriteInFlight = new Set\(\)/, 'Favorite mutations need an in-flight lock');
assert.match(ui, /const noteInFlight = new Set\(\)/, 'Note mutations need an in-flight lock');
assert.match(ui, /const pendingSync = new Set\(\)/, 'Local-first mutations need explicit pending persistence state');
assert.match(ui, /async function syncMutation/, 'Personal mutations need one synchronization path');
assert.match(ui, /favoriteAction\.disabled = favoriteBusy/, 'In-flight favorite actions must be locked in the singleton menu');
assert.match(ui, /noteAction\.disabled = noteBusy/, 'In-flight note actions must be locked in the singleton menu');
assert.match(ui, /Ruajtur lokalisht/, 'Pending local-first persistence must stay visible in the singleton menu');

assert.match(ui, /const PHONE_OWNER_QUERY = '\(max-width: 767px\)'/, 'Canonical controller must know the phone ownership boundary');
assert.match(ui, /function phoneLiteOwnsViewport\(\)/, 'Canonical controller must stay alive as a phone bridge');
assert.match(ui, /dataset\.registryMobileLiteState !== 'handoff'/, 'Canonical controller must activate fully after mobile handoff');
assert.match(ui, /dataset\.registryPersonalization = 'mobile-lite-bridge'/, 'Phone bridge must be explicitly observable');
assert.match(ui, /function noteKeyForData\(data\)/, 'Mobile card notes must use the canonical note identity contract');
assert.match(ui, /function editNoteForData\(data\)/, 'Mobile cards must reuse the canonical note editor');
assert.match(ui, /editNoteForData,/, 'Canonical mobile note editor must be exported');
assert.match(ui, /hasNoteForData,/, 'Canonical mobile note state resolver must be exported');
assert.doesNotMatch(ui, /registry-personalization-phone-deferred-v1/, 'Canonical controller must not disappear on phone before handoff');

assert.doesNotMatch(ui, /ALL_ROWS_PAGE_SIZE|10000/, 'Personal views must never force a page-size sentinel into the DOM');
assert.doesNotMatch(ui, /setInterval\s*\(/, 'Personalization must be event-driven, not poll the page continuously');
assert.doesNotMatch(ui, /MutationObserver/, 'Deterministic registry render events make a personalization DOM observer unnecessary');

assert.match(css, /\[data-registry-column-key="personal-note"\]/, 'Legacy note-column retirement rule is missing');
assert.match(css, /\.registry-quick-favorites\s*\{?/, 'Legacy quick Favorites control must be suppressed if a stale client creates it');
assert.match(css, /display:none!important/, 'Legacy note/quick-favorites surfaces must not remain interactive');
assert.match(css, /registry-row-more-toggle/, 'Stable three-dot row-action styling is missing');
assert.match(css, /registry-row-actions-menu/, 'Singleton row-action menu styling is missing');
assert.match(css, /registry-row-actions-menu-item/, 'Singleton menu item styling is missing');
assert.match(css, /registry-note-dialog/, 'Note dialog styling is missing');
assert.match(css, /registry-personal-view-actions/, 'Shared Favorites/Notes toolbar styling is missing');
assert.match(css, /registry-personal-view-banner/, 'Shared personal-view banner styling is missing');
assert.match(css, /registry-row-actions-menu-status/, 'Pending persistence status styling is missing from the singleton menu');
assert.match(css, /:disabled/, 'Mutation lock styling is missing');
assert.match(css, /drug-action-item\.favorite\{display:none!important\}/, 'Legacy duplicate favorite control must be retired from the menu');
assert.doesNotMatch(css, /medindex-favorites-only[^\n]*#pagination|medindex-favorites-only[^\n]*\.pagination/, 'Favorites pagination must stay available when a user has more than one page');
assert.match(css, /@media\(max-width:767px\)/, 'Personalization must keep a dedicated phone treatment');
assert.match(css, /prefers-reduced-motion/, 'Personalization must respect reduced-motion preferences');

assert.match(uxPhase1, /requestIdleCallback/, 'Phase 1 noncritical polish must be deferred off the critical path');
assert.match(uxPhase1, /Control\+K Meta\+K/, 'Phase 1 must expose a fast keyboard search shortcut');
assert.match(uxPhase1, /event\.key === '\/'/, 'Phase 1 must support slash-to-search when the user is not editing');
assert.match(uxPhase1, /canonicalFavoritesButton/, 'Phase 1 must resolve the canonical Favorites toolbar control');
assert.match(uxPhase1, /#registryPersonalViews \[data-personal-view="favorites"\]/, 'Phase 1 must reuse the shared Favorites/Notes toolbar group');
assert.match(uxPhase1, /retireLegacyQuickFavorites/, 'Any legacy quick-favorites duplicate must be actively retired');
assert.match(uxPhase1, /MedIndexRegistryPersonalization/, 'Phase 1 must reuse the audited personalization controller');
assert.doesNotMatch(uxPhase1, /button\.id = 'registryQuickFavorites'|createElement\('button'\).*registryQuickFavorites/, 'Phase 1 must not create another Favorites toolbar button');
assert.doesNotMatch(uxPhase1, /MutationObserver|setInterval\s*\(/, 'Phase 1 must remain deterministic and event-driven');
assert.match(uxPhase1Css, /position:sticky!important/, 'The registry command surface should stay reachable while scanning');
assert.match(uxPhase1Css, /mi-registry-search-shell/, 'Phase 1 must visually prioritize search');
assert.match(uxPhase1Css, /prefers-reduced-motion/, 'Phase 1 must respect reduced-motion preferences');

assert.match(client, /regjistriBarnave_shenime_v1/, 'Per-user notes local cache is missing');
assert.match(client, /NOTE_ENTITY_TYPE = 'protocol'/, 'Notes must stay compatible with the existing user_favorites schema');
assert.match(client, /NOTE_ENTITY_PREFIX = 'drug-note:'/, 'Notes must use an isolated namespaced entity key');
assert.match(client, /payload:\{ kind:'drug-note'/, 'Synced notes must be distinguishable from real protocol favorites');
assert.match(client, /localStorage\.removeItem\(NOTES_KEY\)/, 'Notes must be removed from the browser on logout');

assert.match(authClient, /async function syncPersonalLibraryBeforeLogout\(\)/, 'Logout must have an explicit personal-library sync gate');
assert.match(authClient, /MedIndexUserLibrary\?\.syncNow/, 'Logout must use the current revision-aware user-library sync API');
assert.match(authClient, /LOGOUT_SYNC_TIMEOUT_MS = 5000/, 'Logout sync must be bounded instead of hanging indefinitely');
assert.match(authClient, /if \(!synced\)[\s\S]{0,320}Dalja u anulua/, 'A failed personal-library sync must block logout and preserve local data');
assert.match(authClient, /if \(!response\.ok\)/, 'Private browser data must not be cleared when the auth logout fails');
assert.match(authClient, /regjistriBarnave_favoritet_v1/, 'Favorites must be cleared locally after a confirmed logout');
assert.match(authClient, /regjistriBarnave_shenime_v1/, 'Notes must be cleared locally after a confirmed logout');
assert.match(authClient, /regjistriBarnave_barnat_personale_v1/, 'Personal drugs must be cleared locally after a confirmed logout');
assert.match(authClient, /medindex_user_library_meta_v1/, 'User-library sync metadata must be cleared after a confirmed logout');
const logoutSync = authClient.indexOf('const synced = await syncPersonalLibraryBeforeLogout()');
const logoutDelete = authClient.indexOf("authRequest({ method:'DELETE' })");
const logoutClear = authClient.indexOf('await clearPrivateBrowserData()');
assert.ok(logoutSync >= 0 && logoutDelete > logoutSync && logoutClear > logoutDelete,
  'Logout order must be sync gate → auth DELETE → private local clear');

assert.match(server, /NOTE_ENTITY_PREFIX = 'drug-note:'/, 'Server note namespace is missing');
assert.match(server, /payload\.kind === 'drug-note'/, 'Server does not validate namespaced drug notes');
assert.match(server, /user_id=eq\./, 'User library reads must stay scoped to authenticated user ID');
assert.match(server, /MAX_NOTE_CHARS = 2000/, 'Server must bound personal note size');
assert.match(shell, /regjistriBarnave_favoritet_v1/, 'Sidebar favorite badge must use the canonical favorites key');

const library = require('../lib/user-library.js');
const note = library._test.normalizedFavorite({
  entityType:'protocol',
  entityKey:'drug-note:registry:2508',
  payload:{ kind:'drug-note', text:'Kontrollo dozimin para përdorimit.' },
  clientUpdatedAt:new Date().toISOString(),
});
assert.equal(note.entityType, 'protocol');
assert.equal(note.entityKey, 'drug-note:registry:2508');
assert.equal(note.payload.kind, 'drug-note');
assert.equal(note.payload.text, 'Kontrollo dozimin para përdorimit.');
assert.throws(() => library._test.normalizedFavorite({
  entityType:'protocol',
  entityKey:'drug-note:registry:2508',
  payload:{ kind:'drug-note', text:'x'.repeat(2001) },
}), /maksimum 2000/i, 'Oversized personal notes must fail closed');

console.log('Canonical Favorites + Notes singleton row menu, mobile bridge, native personal views, mutation locks, fail-closed logout and pending persistent sync audit passed.');
