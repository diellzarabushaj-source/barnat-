'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const library = require('../lib/user-library.js');

const server = read('lib/user-library.js');
const resolver = read('lib/personal-registry-supabase.js');
const gateway = read('lib/medindex-data-api.js');
const migration = read('supabase/migrations/20260827111357_native_user_notes_and_profile_avatars.sql');

assert.equal(library._test.noteRegistryNumber('drug-note:registry:2508'), 2508);
assert.equal(library._test.noteRegistryNumber('drug-note:fallback:x'), null);
assert.equal(library._test.isDrugNoteKey('protocol', 'drug-note:registry:3'), true);
assert.equal(library._test.isDrugNoteKey('drug', 'drug-note:registry:3'), false);

assert.match(gateway, /'user_notes'/);
assert.match(gateway, /PRIVATE_SERVER_RELATIONS/);
assert.match(server, /fetchRows\('user_notes'/);
assert.match(server, /upsert\('user_notes', 'user_id,entity_type,entity_key'/);
assert.match(server, /authUidFromRequest/);
assert.match(resolver, /nativeNoteKeysForUser/);
assert.match(resolver, /user_notes\?\$\{params\.toString\(\)\}/);
assert.match(migration, /legacy_user_id = uf\.user_id/);
assert.match(migration, /add column if not exists deleted_at timestamptz/i);
assert.match(migration, /char_length\(content\) <= 2000/i);

console.log('Native user_notes persistence contract passed (Supabase runtime).');
