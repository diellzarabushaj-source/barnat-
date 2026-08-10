'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const ui = read('registry-user-personalization.js');
const css = read('registry-user-personalization.css');
const client = read('user-library-client.js');
const server = read('lib/user-library.js');
const shell = read('tailadmin-shell-legacy.js');

assert.doesNotThrow(() => new Function(ui), 'Personalization UI must parse as JavaScript');
assert.doesNotThrow(() => new Function(client), 'User library client must parse as JavaScript');
assert.doesNotThrow(() => new Function(server), 'User library server must parse as JavaScript');

assert.match(html, /registry-user-personalization\.css\?v=20260810-1/, 'Personalization CSS is not loaded');
assert.match(html, /registry-user-personalization\.js\?v=20260810-1/, 'Personalization JS is not loaded');
assert.ok(html.indexOf('registry-unified-table.js') < html.indexOf('registry-user-personalization.js'), 'Personalization must run after unified table');
assert.doesNotMatch(html, /<option value="4006"[^>]*>Favoritet<\/option>/, 'Favorites must not use the stale page-size option');

assert.match(ui, /Shënime personale/, 'Personal notes column is missing');
assert.match(ui, /data-personal-note/, 'Direct table note editor is missing');
assert.match(ui, /maxlength=\\?"\$\{NOTE_MAX\}/, 'Personal notes must have a bounded length');
assert.match(ui, /registryNumber\(row\)/, 'Notes must use stable registry identity when available');
assert.match(ui, /NOTE_SAVE_DELAY = 550/, 'Notes must autosave with debounce');
assert.match(ui, /MedIndexUserLibrary\?\.syncNow/, 'Notes must schedule persistent user-library sync');
assert.match(ui, /\[data-nav="favorites"\],\[data-mi-shell-action="favorites"\]/, 'Favorites sidebar action is not intercepted');
assert.match(ui, /ALL_ROWS_PAGE_SIZE = '10000'/, 'Favorites mode must be able to inspect the whole registry, not only the current page');
assert.match(ui, /isFavoriteRow/, 'Favorites-only filtering is missing');
assert.match(ui, /Shfaq të gjitha/, 'Favorites-only mode needs a clear exit action');
assert.match(css, /medindex-favorites-only/, 'Favorites-only visual state is missing');
assert.match(css, /registry-personal-note-cell/, 'Notes column styling is missing');

assert.match(client, /regjistriBarnave_shenime_v1/, 'Per-user notes local cache is missing');
assert.match(client, /entityType:'drug-note'/, 'Notes are not synchronized as scoped user-library entities');
assert.match(client, /localStorage\.removeItem\(NOTES_KEY\)/, 'Notes must be removed from the browser on logout');
assert.match(server, /'drug-note'/, 'Server does not accept drug-note entities');
assert.match(server, /user_id=eq\./, 'User library reads must stay scoped to authenticated user ID');
assert.match(server, /MAX_NOTE_CHARS = 2000/, 'Server must bound personal note size');
assert.match(shell, /regjistriBarnave_favoritet_v1/, 'Sidebar favorite badge must use the canonical favorites key');

const library = require('../lib/user-library.js');
const note = library._test.normalizedFavorite({
  entityType:'drug-note',
  entityKey:'registry:2508',
  payload:{ text:'Kontrollo dozimin para përdorimit.' },
  clientUpdatedAt:new Date().toISOString(),
});
assert.equal(note.entityType, 'drug-note');
assert.equal(note.entityKey, 'registry:2508');
assert.equal(note.payload.text, 'Kontrollo dozimin para përdorimit.');
assert.throws(() => library._test.normalizedFavorite({
  entityType:'drug-note',
  entityKey:'registry:2508',
  payload:{ text:'x'.repeat(2001) },
}), /maksimum 2000/i, 'Oversized personal notes must fail closed');

console.log('Per-user favorites and personal table notes regression audit passed.');
