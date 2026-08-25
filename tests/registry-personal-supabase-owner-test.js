'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const helper = read('lib/personal-registry-supabase.js');
const api = read('api/drug-search.js');
const lite = read('registry-desktop-lite.js');
const marker = 'registry-personal-supabase-owner-v1';

assert.ok(helper.includes("UserStore.userFromSession(request)"), 'Personal membership must be scoped from the authenticated MedIndex session.');
assert.ok(helper.includes("user_favorites?${params.toString()}"), 'Favorites/Notes membership must come from Supabase user_favorites.');
assert.ok(helper.includes("params.set('user_id', `eq.${userId}`)"), 'Every personal membership query must explicitly filter user_id.');
assert.ok(helper.includes("params.set('deleted_at', 'is.null')"), 'Deleted/tombstoned personal rows must never reappear.');
assert.ok(helper.includes("fetchDrugsBy('pdid'"), 'Current composite favorite keys must resolve through the indexed Supabase PDID path.');
assert.ok(helper.includes('exactMembershipMatch(row, wanted)'), 'Targeted drug candidates must be revalidated against the full favorite identity.');
assert.ok(helper.includes("payload.kind === 'drug-note'"), 'Notes must use the canonical encrypted-library note membership contract.');

const personalStart = api.indexOf(`${marker}: Supabase-owned personal rows`);
const pageStart = api.indexOf('async function sendRegistryPage', personalStart);
assert.ok(personalStart >= 0 && pageStart > personalStart, 'Supabase-owned personal endpoint block is missing.');
const personalBlock = api.slice(personalStart, pageStart);
assert.ok(personalBlock.includes('PersonalRegistry.resolvePersonalDrugRows(req, mode)'), 'Personal endpoint must call the Supabase resolver.');
assert.ok(!personalBlock.includes('registryHandler.getRegistryDataset()'), 'Personal endpoint must not scan the legacy registry dataset.');
assert.ok(!personalBlock.includes('personalIdentifiers(req)'), 'Browser identifiers must not authorize Favorites/Notes membership.');
assert.ok(personalBlock.includes("'supabase-personal'"), 'Personal endpoint must identify Supabase as its data source.');

assert.ok(lite.includes("'Si të shënohet në recetë':clean(row.prescriptionNotation)"), 'Canonical row must carry the prescription notation instead of rendering a dash.');
assert.ok(lite.includes("'ProtocolNo':clean(row.protocolNo)"), 'Canonical row must carry the protocol number.');
assert.ok(lite.includes("'Popullata e aprovuar':clean(row.approvedPopulation)"), 'Canonical row must carry the approved population.');
assert.ok(lite.includes(`${marker}: sync membership before read`), 'A local favorite/note mutation must sync before the authoritative Supabase read.');
assert.ok(lite.includes('MedIndexUserLibrary?.syncNow'), 'Personal read must flush the user library without requiring Ctrl+Shift+R.');
assert.ok(lite.includes('mode:state.personalMode'), 'Personal request must tell the server only which personal view is requested.');
const fetchStart = lite.indexOf('async function fetchPersonalLogicalPage');
const fetchEnd = lite.indexOf('function setBusy', fetchStart);
const fetchBlock = lite.slice(fetchStart, fetchEnd);
assert.ok(!fetchBlock.includes('identifiers:state.personalIdentifiers'), 'The browser must not send its local membership list as server authority.');
assert.ok(lite.includes(`${marker}: self-heal restored personal view`), 'BFCache/tab restore must refresh the active personal subset automatically.');

console.log('✓ Supabase personal registry owner passed: authenticated per-user membership, indexed drug hydration, complete Barnat row contract, and no hard-refresh dependency.');
