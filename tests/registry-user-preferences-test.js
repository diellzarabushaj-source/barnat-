'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const prefs = require('../lib/user-ui-preferences.js');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const html = read('index.html');
const js = read('registry-v2.js');
const css = read('registry-v2.css');
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

// The picker must be transactional while open. A checkbox change updates only
// the draft selection; table layout and profile persistence happen once the
// panel closes, so the row under the pointer cannot move during the click.
assert.match(js, /registry-column-picker-stability-v2/);
assert.match(js, /columnPickerDraft: null/);
assert.match(js, /columnPickerDirty: false/);
assert.match(js, /preferenceInteractionVersion: 0/);
assert.match(js, /function sameColumnSelection\(/);
assert.match(js, /state\.columnPickerDraft = new Set\(state\.visibleColumns\)/);
assert.match(js, /state\.columnPickerDirty = !sameColumnSelection/);
assert.match(js, /interactionVersion !== state\.preferenceInteractionVersion/);
assert.match(js, /el\.columnPickerPanel\.addEventListener\('change'/);
assert.match(js, /el\.columnPickerList\.scrollTop = 0/);
assert.match(js, /Ndryshimet ruhen kur mbyllet/);
assert.doesNotMatch(js, /querySelector\('input:not\(:disabled\)'\)\?\.focus/);
assert.match(css, /registry-column-picker-scroll-stability-v2/);
assert.match(css, /overflow-anchor:none/);
assert.match(css, /scrollbar-gutter:stable/);

// A successful PUT is an acknowledgement only. It must not copy a delayed
// server payload back into visibleColumns and undo a newer local checkmark.
const persistStart = js.indexOf('async function persistColumnPreferences()');
const persistEnd = js.indexOf('function scheduleColumnSave()', persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart, 'Persistence function must be present');
const persistBody = js.slice(persistStart, persistEnd);
assert.match(persistBody, /registryColumns:snapshot/);
assert.doesNotMatch(persistBody, /state\.visibleColumns = new Set/);
assert.match(persistBody, /revision === state\.preferenceRevision/);

assert.doesNotMatch(authClient, /drx_registry_columns_v2:/, 'Logout must not delete account column preferences cache');
assert.match(profileAvatar, /supabase-data-api/);
assert.doesNotMatch(profileAvatar, /neonRequest|neon-data-api/);

console.log('Per-account persistent registry columns and stable transactional picker contract passed.');
