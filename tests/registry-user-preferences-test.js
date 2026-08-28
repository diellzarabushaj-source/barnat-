'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const prefs = require('../lib/user-ui-preferences.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const js = read('registry-v2.js');
const authApi = read('api/auth.js');
const authClient = read('auth-client.js');
const profileAvatar = read('lib/profile-avatar.js');

assert.deepEqual(
  prefs._test.normalizeColumns(['price','atc','price']),
  ['name','price','atc'],
  'Required drug-name column must be restored and duplicates removed',
);
assert.deepEqual(
  prefs._test.normalizeColumns(['unknown']),
  ['name'],
  'Unknown column ids must not enter persisted preferences',
);
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('adultDose'));
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('pediatricDose'));
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('price'));

assert.match(authApi, /scope.*ui-preferences|uiPreferencesRequested/);
assert.match(authApi, /UserUiPreferences\.handle/);

assert.match(html, /id="columnPickerButton"/);
assert.match(html, /id="columnPickerPanel"/);
assert.match(html, /id="columnPickerList"/);
assert.match(html, /id="columnSaveStatus"/);
assert.doesNotMatch(html, /id="statusFilter"/);
for (const id of prefs._test.COLUMN_IDS) {
  assert.match(html, new RegExp(`data-col="${id}"`), `Missing table column marker ${id}`);
}

assert.match(js, /PREFERENCES_API = '\/api\/auth\?scope=ui-preferences'/);
assert.match(js, /COLUMN_CACHE_PREFIX = 'drx_registry_columns_v2:'/);
assert.match(js, /loadColumnPreferences\(authPayload\)/);
assert.match(js, /persistColumnPreferences\(\)/);
assert.match(js, /Ruajtur në profil/);
assert.match(js, /state\.preferenceOwner/);
assert.match(js, /localStorage\.setItem\(key/);
assert.match(js, /data-column-toggle/);
assert.doesNotMatch(js, /statusFilter/);
assert.doesNotMatch(js, /state\.status/);

assert.doesNotMatch(authClient, /drx_registry_columns_v2:/, 'Logout must not delete account column preferences cache');
assert.match(profileAvatar, /supabase-data-api/);
assert.doesNotMatch(profileAvatar, /neonRequest|neon-data-api/);

console.log('Per-account persistent registry columns and canonical Supabase profile photo contract passed.');
