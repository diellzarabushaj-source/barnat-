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
// An account that has never saved anything must open on the full table, not on
// the single required column.
assert.deepEqual(
  prefs._test.normalizeColumns(null),
  [...prefs._test.DEFAULT_COLUMNS],
  'A missing preference must fall back to the default table',
);
assert.deepEqual(
  prefs._test.normalizeColumns(undefined),
  [...prefs._test.DEFAULT_COLUMNS],
  'An absent preference must fall back to the default table',
);
assert.ok(
  prefs._test.DEFAULT_COLUMNS.length > 1,
  'The default table is more than the required drug-name column',
);
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('adultDose'));
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('pediatricDose'));
assert.ok(prefs._test.DEFAULT_COLUMNS.includes('price'));

// The regression that made checkmarks vanish on refresh: the picker offered
// columns the persistence layer silently dropped, so the save round-trip came
// back without them. Every column the picker can tick must be storable.
const pickerColumnIds = [...js.matchAll(/\{ id:'([A-Za-z]+)', label:/g)].map(match => match[1]);
assert.ok(pickerColumnIds.length >= 13, 'Column definitions must be readable from registry-v2.js');
for (const id of pickerColumnIds) {
  assert.ok(
    prefs._test.COLUMN_IDS.includes(id),
    `Column "${id}" can be ticked in the picker but cannot be persisted by the API`,
  );
}
assert.deepEqual(
  prefs._test.normalizeColumns(pickerColumnIds),
  pickerColumnIds,
  'A full selection must survive the API round-trip unchanged',
);
for (const id of ['drugClass', 'use', 'population']) {
  assert.ok(prefs._test.COLUMN_IDS.includes(id), `Clinical column ${id} must persist`);
  assert.ok(prefs._test.normalizeColumns(['name', id]).includes(id), `Clinical column ${id} must survive a save`);
}

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
// The panel must not be a scroll container of its own: an overflow:hidden panel
// is still scrollable, and the focus the checkbox takes on click scrolled the
// panel's own header out of sight on every tick.
const pickerPanelRule = css
  .slice(css.indexOf('.column-picker-panel{'), css.indexOf('.column-picker-panel[hidden]'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
assert.match(pickerPanelRule, /overflow:clip/);
assert.doesNotMatch(pickerPanelRule, /overflow:hidden/);
assert.match(css, /max-height:var\(--column-picker-max,none\)/);
assert.match(js, /function fitColumnPickerToViewport\(\)/, 'the panel footer must stay above the fold');

// A successful PUT is an acknowledgement only. It must not copy a delayed
// server payload back into visibleColumns and undo a newer local checkmark.
const persistStart = js.indexOf('async function persistColumnPreferences()');
const persistEnd = js.indexOf('function scheduleColumnSave()', persistStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart, 'Persistence function must be present');
const persistBody = js.slice(persistStart, persistEnd);
assert.match(persistBody, /registryColumns:snapshot/);
assert.doesNotMatch(persistBody, /state\.visibleColumns = new Set/);
assert.match(persistBody, /revision === state\.preferenceRevision/);

// A ticked row is a prescription in progress: it must outlive a refresh, a page
// change and a walk through another workspace, and a pending column save must
// not be lost when the tab goes away mid-debounce.
assert.match(js, /SELECTION_STORAGE_KEY = 'drx_registry_v2_selection'/);
assert.match(js, /function restoreSelection\(\)/);
assert.match(js, /function persistSelection\(\)/);
assert.match(js, /restoreSelection\(\);\n\s+updateSelectedCount\(\);/);
const toggleStart = js.indexOf('function toggleSelection(row, selected)');
const toggleEnd = js.indexOf('function persistSelection()', toggleStart);
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, 'Selection toggle must be present');
assert.match(js.slice(toggleStart, toggleEnd), /persistSelection\(\);/, 'Every tick must be persisted immediately');
assert.match(js, /function flushColumnSave\(\)/);
assert.match(js, /keepalive:true/);
assert.match(js, /window\.addEventListener\('pagehide', flushColumnSave\)/);
assert.match(js, /COLUMN_DEVICE_OWNER/, 'Column cache must survive a missing profile id');

assert.doesNotMatch(authClient, /drx_registry_columns_v2:/, 'Logout must not delete account column preferences cache');
assert.match(authClient, /drx_registry_v2_selection/, 'Logout must clear the prescription selection');
assert.match(profileAvatar, /supabase-data-api/);
assert.doesNotMatch(profileAvatar, /neonRequest|neon-data-api/);

console.log('Per-account persistent registry columns and stable transactional picker contract passed.');
