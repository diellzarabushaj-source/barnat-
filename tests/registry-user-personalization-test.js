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
const server = read('lib/user-library.js');
const shell = read('tailadmin-shell-legacy.js');
const pkg = read('package.json');
const runtimePatch = read('scripts/patch-registry-personalization-runtime.js');
const runtime = read('app-runtime.js');

assert.doesNotThrow(() => new Function(ui), 'Personalization UI must parse as JavaScript');
assert.doesNotThrow(() => new Function(uxPhase1), 'Registry UX phase 1 must parse as JavaScript');
assert.doesNotThrow(() => new Function(client), 'User library client must parse as JavaScript');
assert.doesNotThrow(() => new Function(server), 'User library server must parse as JavaScript');
assert.doesNotThrow(() => new Function(runtimePatch), 'Registry personalization runtime patch must parse as JavaScript');

assert.match(html, /registry-user-personalization\.css\?v=20260810-3/, 'Latest personalization CSS is not loaded');
assert.match(html, /registry-user-personalization\.js\?v=20260810-2/, 'Latest personalization JS is not loaded');
assert.match(html, /registry-ux-phase1\.css\?v=20260810-1/, 'Phase 1 premium registry CSS is not loaded');
assert.match(html, /registry-ux-phase1\.js\?v=20260810-1/, 'Phase 1 instant interaction layer is not loaded');
assert.doesNotMatch(html, /registry-personalization-polish\.js/, 'Duplicate personalization controller must not be loaded');
assert.ok(html.indexOf('registry-unified-table.js') < html.indexOf('registry-user-personalization.js'), 'Personalization must run after unified table');
assert.ok(html.indexOf('registry-user-personalization.js') < html.indexOf('registry-ux-phase1.js'), 'Phase 1 UX must enhance the stable personalization layer, not race it');
assert.doesNotMatch(html, /<option value="4006"[^>]*>Favoritet<\/option>/, 'Favorites must not use a page-size hack');

assert.match(pkg, /patch-registry-personalization-runtime\.js/, 'Native favorites runtime patch must run in the production build');
assert.match(runtimePatch, /rows = rows\.filter\(registryRowIsFavorite\)/, 'Runtime patch must filter favorites before pagination');
assert.match(runtimePatch, /new Set\(\[50, 100, 250, 500\]\)/, 'Runtime patch must keep bounded page sizes');
assert.match(runtimePatch, /state\.pageSize = sanitizeRegistryPageSize\(requested\)/, 'Runtime must fail closed on oversized page-size requests');
assert.match(runtimePatch, /medindex:registry-rendered/, 'Runtime must expose deterministic render completion instead of DOM polling');
assert.match(runtime, /favoritesOnly: false/, 'Generated runtime is missing favorites state');
assert.match(runtime, /rows = rows\.filter\(registryRowIsFavorite\)/, 'Generated runtime is missing native favorites filtering');
assert.match(runtime, /window\.MedIndexRegistryRuntime = Object\.freeze/, 'Generated runtime is missing personalization API');
assert.match(runtime, /state\.pageSize = sanitizeRegistryPageSize\(requested\)/, 'Generated runtime still accepts arbitrary page sizes');
assert.doesNotMatch(runtime, /REGISTRY_ALLOWED_PAGE_SIZES = new Set\(\[50, 100, 250, 500, 4006\]\)/, 'Generated runtime must not retain the 4006-row favorites path');

assert.match(ui, /Shënime personale/, 'Personal notes column is missing');
assert.match(ui, /data-personal-note/, 'Direct table note editor is missing');
assert.match(ui, /data-clear-personal-note/, 'Fast note clearing action is missing');
assert.match(ui, /maxlength="\$\{NOTE_MAX\}"/, 'Personal notes must have a bounded length');
assert.match(ui, /registryNumber\(row\)/, 'Notes must use stable registry identity when available');
assert.match(ui, /NOTE_SAVE_DELAY = 280/, 'Notes autosave should feel immediate without writing on every keystroke');
assert.match(ui, /MedIndexUserLibrary\?\.syncNow/, 'Notes and favorites must schedule persistent user-library sync');
assert.match(ui, /setFavoritesOnly/, 'Favorites sidebar must use native registry filtering');
assert.match(ui, /refreshFavorites/, 'Favorite changes must invalidate the native registry filter immediately');
assert.match(ui, /medindex:registry-rendered/, 'Personalization must refresh from the deterministic render event');
assert.match(ui, /data-row-favorite-toggle/, 'One-click favorite action must be available in every visible row');
assert.match(ui, /metaKey \|\| event\.ctrlKey/, 'Personal note keyboard save shortcut is missing');
assert.doesNotMatch(ui, /ALL_ROWS_PAGE_SIZE|10000/, 'Favorites must never force the full registry into the DOM');
assert.doesNotMatch(ui, /setInterval\s*\(/, 'Personalization must be event-driven, not poll the page continuously');
assert.doesNotMatch(ui, /MutationObserver/, 'Deterministic registry render events make a personalization DOM observer unnecessary');

assert.match(css, /registry-personal-note-cell/, 'Notes column styling is missing');
assert.match(css, /registry-row-favorite-toggle/, 'One-click favorite styling is missing');
assert.match(css, /drug-action-item\.favorite\{display:none!important\}/, 'Legacy duplicate favorite control must be retired from the menu');
assert.doesNotMatch(css, /medindex-favorites-only[^\n]*#pagination|medindex-favorites-only[^\n]*\.pagination/, 'Favorites pagination must stay available when a user has more than one page');
assert.match(css, /@media\(max-width:720px\)/, 'Personalization must keep a dedicated mobile treatment');
assert.match(css, /prefers-reduced-motion/, 'Personalization must respect reduced-motion preferences');

assert.match(uxPhase1, /requestIdleCallback/, 'Phase 1 noncritical polish must be deferred off the critical path');
assert.match(uxPhase1, /Control\+K Meta\+K/, 'Phase 1 must expose a fast keyboard search shortcut');
assert.match(uxPhase1, /event\.key === '\/'/, 'Phase 1 must support slash-to-search when the user is not editing');
assert.match(uxPhase1, /registryQuickFavorites/, 'Phase 1 must provide a one-click toolbar favorites control');
assert.match(uxPhase1, /MedIndexRegistryPersonalization/, 'Quick favorites must reuse the audited personalization controller');
assert.doesNotMatch(uxPhase1, /MutationObserver|setInterval\s*\(/, 'Phase 1 must remain deterministic and event-driven');
assert.match(uxPhase1Css, /position:sticky!important/, 'The registry command surface should stay reachable while scanning');
assert.match(uxPhase1Css, /mi-registry-search-shell/, 'Phase 1 must visually prioritize search');
assert.match(uxPhase1Css, /registry-quick-favorites/, 'Phase 1 quick favorites styling is missing');
assert.match(uxPhase1Css, /prefers-reduced-motion/, 'Phase 1 must respect reduced-motion preferences');

assert.match(client, /regjistriBarnave_shenime_v1/, 'Per-user notes local cache is missing');
assert.match(client, /NOTE_ENTITY_TYPE = 'protocol'/, 'Notes must stay compatible with the existing user_favorites schema');
assert.match(client, /NOTE_ENTITY_PREFIX = 'drug-note:'/, 'Notes must use an isolated namespaced entity key');
assert.match(client, /payload:\{ kind:'drug-note'/, 'Synced notes must be distinguishable from real protocol favorites');
assert.match(client, /localStorage\.removeItem\(NOTES_KEY\)/, 'Notes must be removed from the browser on logout');
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

console.log('Fast native favorites, compact notes and Phase 1 instant registry UX audit passed.');
