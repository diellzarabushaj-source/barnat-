'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const runtime = read('registry-desktop-column-lite.js');
const desktop = read('registry-desktop-lite.js');
const api = read('api/drug-search.js');
const patch = read('scripts/patch-phase14-column-lite.js');
const wiring = read('scripts/patch-phase12-targeted-detail-wiring.js');
const decorator = read('registry-column-picker-tailwind.js');

for (const file of [
  'registry-desktop-column-lite.js',
  'scripts/patch-phase14-column-lite.js',
]) execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio:'pipe' });

assert.match(index, /registry-desktop-column-lite\.js\?v=20260812-1/);
assert.match(runtime, /registry-desktop-column-lite-v1/);
assert.match(runtime, /const CHUNK = 50/);
assert.match(runtime, /const CONCURRENCY = 3/);
assert.match(runtime, /view:'registry-columns'/);
assert.match(runtime, /columns:keys\.join\(','\)/);
assert.match(runtime, /ids:ids\.join\(','\)/);
assert.match(runtime, /remoteCache = new Map\(\)/);
assert.match(runtime, /MEDINDEX_DESKTOP_LITE\?\.sortBy/);
assert.match(runtime, /MedIndexRegistryUnified\?\.setView\?\.\('full'\)/);
assert.match(runtime, /column-prescription-notation/, 'Only the unstructured prescription-label column may explicitly request full mode.');
assert.doesNotMatch(runtime, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|source_payload|indexedDB/, 'Column customization must never read the full registry or source payload.');
assert.match(runtime, /data\.columnLiteValue === signature/, 'Remote column DOM writes must be signature-idempotent.');
assert.match(runtime, /if \(!existed \|\| column\.remote\)/, 'Existing base cells must be preserved instead of rewritten.');
assert.match(runtime, /if \(changed\) window\.MedIndexRegistryUnified\?\.refresh\?\.\(\)/, 'Unified table refresh must happen only after a real structural/value change.');
assert.doesNotMatch(runtime, /addEventListener\('medindex:registry-table-stable'/, 'Phase 14 must not create stable→refresh feedback loops.');

const buildPanel = runtime.match(/function buildPanel\(\)[\s\S]*?function syncPanelChecks/)?.[0] || '';
assert(buildPanel, 'Column picker builder must exist.');
assert.doesNotMatch(buildPanel, /fetch\s*\(/, 'Opening/building the column picker must be zero-network.');
assert.match(buildPanel, /Shfaqi të gjitha/);
assert.match(buildPanel, /Fshihi të gjitha/);
assert.match(buildPanel, /Si shënohet në recetë/);

assert.match(api, /REGISTRY_COLUMN_LITE_RUNTIME = 'phase14-column-lite-v1'/);
assert.match(api, /REGISTRY_COLUMN_BATCH_MAX_IDS = 50/);
assert.match(api, /REGISTRY_COLUMN_BATCH_MAX_FIELDS = 12/);
assert.match(api, /const REGISTRY_COLUMN_FIELD_MAP = Object\.freeze/);
assert.match(api, /protocol:'protocol_no'/);
assert.match(api, /packaging:'packaging'/);
assert.match(api, /mah:'marketing_authorization_holder'/);
assert.match(api, /manufacturer:'manufacturer'/);
assert.match(api, /'ma-certificate':'ma_certificate'/);
assert.match(api, /'wholesale-price':'wholesale_price'/);
assert.match(api, /'margin-price':'wholesale_with_margin'/);
assert.match(api, /vat:'vat_text'/);
assert.match(api, /validity:'validity_text'/);
assert.match(api, /view === 'registry-columns'/);
assert.match(api, /params\.set\('select', \['id', \.\.\.fields\]\.join\(','\)\)/);
assert.match(api, /params\.set\('limit', String\(ids\.length\)\)/);
const batchBuilder = api.match(/function buildRegistryColumnsPath[\s\S]*?function rowForRegistryColumns/)?.[0] || '';
assert(batchBuilder, 'Registry column batch builder must exist.');
assert.doesNotMatch(batchBuilder, /source_payload|SELECT \*|select.*\*/, 'Visible-column batch must remain explicit and lightweight.');

assert.match(desktop, /DESKTOP_COLUMN_LITE_RUNTIME = 'phase14-column-lite-v1'/);
assert.match(desktop, /sortBy:sortByColumn/);
assert.doesNotMatch(desktop, /\['colPickerBtn', 'column-picker'\]/, 'Opening Kolonat must not hand off to full registry.');
assert.match(patch, /source = source\.replace\("      \['colPickerBtn', 'column-picker'\],\\n", ''\)/);
assert.match(wiring, /patch-phase14-column-lite\.js/);
assert.match(wiring, /registry-desktop-column-lite\.js\?v=20260812-1/);
assert.doesNotMatch(decorator, /fetch\s*\(/, 'Tailwind column picker decoration must remain presentation-only.');

for (const forbidden of [
  'desktop-large-page-size', 'form-picker', 'prescription-selection',
  'select-page-for-prescription', 'prescription-builder', 'column-picker',
]) assert(!desktop.includes(forbidden), `Normal desktop path must not retain ${forbidden} full-registry handoff.`);

console.log('Phase 14 final desktop column customization uses bounded whitelisted visible-row Neon reads; normal registry interactions stay off the full-registry path.');
