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
const phase15 = read('scripts/patch-phase15-lazy-dose-runtimes.js');
const wiring = read('scripts/patch-phase12-targeted-detail-wiring.js');
const decorator = read('registry-column-picker-tailwind.js');
const release = read('registry-ui-release.js');

for (const file of [
  'registry-desktop-column-lite.js',
  'registry-column-picker-tailwind.js',
  'registry-ui-release.js',
  'scripts/patch-phase14-column-lite.js',
  'scripts/patch-phase15-lazy-dose-runtimes.js',
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
assert.doesNotMatch(runtime, /column-prescription-notation|advanced:true/, 'Prescription notation must remain on the lightweight path.');
assert.match(runtime, /key:'prescription-label'[\s\S]{0,180}raw:'Si të shënohet në recetë'[\s\S]{0,120}default:true/, 'Prescription notation must be a normal default lightweight column.');
assert.doesNotMatch(runtime, /\/api\/registry(?:\?|['"`])|DRUG_DATA_PARTS|source_payload|indexedDB/, 'Column customization must never read the full registry or source payload.');
assert.match(runtime, /cell\.dataset\.columnLiteValue === signature/, 'Remote column DOM writes must be signature-idempotent.');
assert.match(runtime, /if \(!existed \|\| column\.remote\)/, 'Existing base cells must be preserved instead of rewritten.');
assert.match(runtime, /if \(changed\) window\.MedIndexRegistryUnified\?\.refresh\?\.\(\)/, 'Unified table refresh must happen only after a real structural/value change.');
assert.doesNotMatch(runtime, /addEventListener\('medindex:registry-table-stable'/, 'Phase 14 must not create stable→refresh feedback loops.');

const numberPosition = runtime.indexOf("key:'number'");
const substancePosition = runtime.indexOf("key:'active-substance'");
const tradePosition = runtime.indexOf("key:'trade-name'");
assert.ok(numberPosition >= 0 && substancePosition > numberPosition && tradePosition > substancePosition,
  'Lightweight source order must be Nr → Substanca aktive → Emri tregtar.');
for (const [key, expected] of Object.entries({
  number:true,
  'active-substance':true,
  'trade-name':true,
  atc:false,
  'drug-class':true,
  use:true,
  strength:true,
  form:true,
  population:true,
  'prescription-label':true,
  status:false,
})) {
  const line = runtime.split('\n').find(item => item.includes(`key:'${key}'`)) || '';
  assert.ok(line.includes(`default:${expected ? 'true' : 'false'}`), `Default mismatch for ${key}.`);
}

const buildPanel = runtime.match(/function buildPanel\(\)[\s\S]*?function syncPanelChecks/)?.[0] || '';
assert(buildPanel, 'Column picker builder must exist.');
assert.doesNotMatch(buildPanel, /fetch\s*\(/, 'Opening/building the column picker must be zero-network.');
assert.match(buildPanel, /Shfaqi të gjitha/);
assert.match(buildPanel, /Fshihi të gjitha/);
assert.match(runtime, /Si shënohet në recetë/, 'Prescription-notation column must remain represented in the lightweight configuration.');

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
assert.match(api, /function registryPrescriptionNotation\(row\)/, 'Lightweight list source must build prescription notation without source_payload.');
assert.match(api, /prescriptionNotation:registryPrescriptionNotation\(row\)/, 'Registry-page rows must expose prescription notation directly.');
const listProjection = api.match(/const REGISTRY_LIST_SELECT = \[[\s\S]*?\]\.join\(','\);/)?.[0] || '';
assert.match(listProjection, /'packaging'/, 'Registry-page projection must include packaging for prescription notation.');
const batchBuilder = api.match(/function buildRegistryColumnsPath[\s\S]*?function rowForRegistryColumns/)?.[0] || '';
assert(batchBuilder, 'Registry column batch builder must exist.');
assert.doesNotMatch(batchBuilder, /source_payload|SELECT \*|select.*\*/, 'Visible-column batch must remain explicit and lightweight.');

assert.match(desktop, /DESKTOP_COLUMN_LITE_RUNTIME = 'phase14-column-lite-v1'/);
assert.match(desktop, /sortBy:sortByColumn/);
assert.doesNotMatch(desktop, /\['formPickerBtn', 'form-picker'\]/, 'Opening Forma farmaceutike must not hand off to full registry.');
assert.doesNotMatch(desktop, /\['colPickerBtn', 'column-picker'\]/, 'Opening Kolonat must not hand off to full registry.');
assert.match(patch, /source = source\.replace\("      \['colPickerBtn', 'column-picker'\],\\n", ''\)/);
assert.match(wiring, /patch-phase14-column-lite\.js/);
assert.match(wiring, /registry-desktop-column-lite\.js\?v=20260812-1/);
assert.doesNotMatch(decorator, /fetch\s*\(/, 'Tailwind column picker decoration must remain presentation-only.');
assert.match(decorator, /function writeLiteColumnPreference\(keys\)/,
  'Column picker must have a direct storage writer for deterministic bulk-action persistence.');
assert.match(decorator, /if \(persist\) writeLiteColumnPreference\(normalized\)/,
  'Show-all/hide-all application must persist the exact normalized set even while preference application is guarded.');
assert.doesNotMatch(decorator, /if \(persist\) persistLiteColumnPreference\(\)/,
  'Bulk actions must not call the guarded controller-based persistence path while preferenceApplying is true.');
assert.match(decorator, /DOSAGE_STORAGE_KEY = 'medindex-registry-dosage-columns-v2'/,
  'Bulk column actions must share the canonical dosage visibility storage key.');
assert.match(decorator, /DOSAGE_DEFAULT_MIGRATION_KEY = 'medindex-registry-dosage-defaults-20260816-v1'/,
  'Explicit dosage choices must share the dosage loader migration key.');
assert.match(decorator, /function writeDosageBulkPreference\(enabled\)/,
  'Bulk actions must have an explicit dosage preference writer even before the lazy dosage runtime is ready.');
assert.match(decorator, /writeDosageBulkPreference\(showAll\)/,
  'Show-all/hide-all must update adult and pediatric dosage columns together with the lightweight columns.');
assert.match(decorator, /localStorage\.setItem\(DOSAGE_DEFAULT_MIGRATION_KEY, '1'\)/,
  'An explicit bulk dosage choice must win over the later one-time default migration.');
assert.match(decorator, /data-registry-dosage-picker[\s\S]{0,180}dispatchEvent\(new Event\('change', \{ bubbles:true \}\)\)/,
  'When dosage controls are mounted, bulk changes must synchronize their live runtime state as well as storage.');
assert.match(decorator, /DOSE_CALCULATOR_STORAGE_KEY = 'medindex\.registry\.dose-calculator\.visible\.v1'/,
  'Bulk actions must share the dose-calculator visibility storage key used by registry table tools.');
assert.match(decorator, /function writeDoseCalculatorBulkPreference\(enabled\)/,
  'Bulk actions must explicitly synchronize the optional dose-calculator column.');
assert.match(decorator, /writeDoseCalculatorBulkPreference\(showAll\)/,
  'Show-all/hide-all must include the optional dose-calculator column.');
assert.match(decorator, /dataset\.registryDoseColumnVisible = String\(next\)/,
  'Dose-calculator bulk visibility must update the live root contract immediately.');
assert.match(decorator, /data-registry-dose-column-toggle[\s\S]{0,220}dispatchEvent\(new Event\('change', \{ bubbles:true \}\)\)/,
  'A mounted dose-calculator toggle must receive the same bulk state and run its canonical change handler.');
assert.match(decorator, /MEDINDEX_DESKTOP_LITE\?\.handoff\?\.\('column-dose-calculator'\)/,
  'Showing all columns before the dose toggle mounts must still request the audited full-runtime handoff.');
const bulkHandler = decorator.match(/function handleLitePanelAction\(event\)[\s\S]*?function enhance\(\)/)?.[0] || '';
assert(bulkHandler, 'Column picker bulk handler must exist.');
assert.doesNotMatch(bulkHandler, /if \(!liteActive\(\)\) return/,
  'Full-registry show-all/hide-all must still synchronize dosage and dose-calculator preferences.');
assert.match(bulkHandler, /if \(liteActive\(\)\) \{[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopImmediatePropagation\(\)[\s\S]*applyLiteColumnPreference/,
  'Only lightweight mode may take exclusive ownership of the bulk click.');
assert.match(bulkHandler, /writeDosageBulkPreference\(showAll\);[\s\S]*writeDoseCalculatorBulkPreference\(showAll\);/,
  'Both lightweight and full-registry bulk actions must synchronize external column preferences.');

assert.match(release, /VIEW_STORAGE_KEY = 'medindex\.registry\.view\.v2'/,
  'The release guard must know the legacy unified-table view preference key.');
assert.match(release, /COLUMN_PREFERENCE_STORAGE_KEY = 'medindex\.registry\.columns\.v20260820'/,
  'View migration must recognize current column preferences and preserve users who already customized the new release.');
assert.match(release, /VIEW_DEFAULT_MIGRATION_KEY = 'medindex\.registry\.view-defaults\.20260820-v1'/,
  'The new default-full transition must be one-time.');
assert.match(release, /!hasCurrentColumnPreferences && localStorage\.getItem\(VIEW_STORAGE_KEY\) === 'clinical'[\s\S]{0,120}localStorage\.removeItem\(VIEW_STORAGE_KEY\)/,
  'Only stale pre-release clinical view state may be cleared.');
assert.match(release, /localStorage\.setItem\(VIEW_DEFAULT_MIGRATION_KEY, '1'\)/,
  'View-default migration must remember completion so later user choices are never reset.');
assert.match(release, /migrateRegistryViewDefault\(\);[\s\S]{0,180}DOMContentLoaded/,
  'View migration must run synchronously before deferred unified-table startup.');
assert.ok(index.indexOf('registry-ui-release.js') < index.indexOf('registry-unified-table.js'),
  'The view-default migration script must execute before the unified-table controller.');

assert.match(phase15, /function validateDesktopLiteColumns\(\)/, 'Phase 15 must validate committed lightweight column source.');
assert.match(phase15, /function validatePickerPreferences\(\)/, 'Phase 15 must validate committed picker preferences.');
assert.match(phase15, /function validateColumnLiteRegression\(\)/, 'Phase 15 must validate the regression test instead of rewriting it.');
assert.doesNotMatch(phase15, /function updateColumnLiteRegression\(\)|function enforcePickerPreferences\(\)|function ensurePrescriptionListData\(\)/,
  'Phase 15 must never rewrite the column regression, picker preferences, or lightweight API source.');

for (const forbidden of [
  'desktop-large-page-size', 'prescription-selection',
  'select-page-for-prescription', 'prescription-builder',
]) assert(!desktop.includes(forbidden), `Normal desktop path must not retain ${forbidden} full-registry handoff.`);

console.log('Phase 14 final desktop column customization uses bounded whitelisted visible-row reads; bulk actions stay coherent in lightweight/full modes, old clinical-view state migrates once to the new default-full contract, and Phase 15 validates canonical source without rewriting tests.');