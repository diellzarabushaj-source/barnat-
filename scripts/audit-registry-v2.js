'use strict';

const fs = require('node:fs');
const path = require('node:path');

require('./stabilize-registry-v2-column-picker.js');
require('./stabilize-registry-v2-dose-autoload.js');
require('./stabilize-dosage-cache-isolation.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('registry-v2.css');
const js = read('registry-v2.js');
const worker = read(fs.existsSync(path.join(root, 'sw-resilient-v3.js')) ? 'sw-resilient-v3.js' : 'sw-resilient.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const legacyAssets = [
  'styles.css',
  'ui-controls.css',
  'clean-medindex-ui.css',
  'tailadmin-medindex.css',
  'registry-unified-table.css',
  'registry-mobile-critical.css',
  'registry-mobile-lite.css',
  'registry-mobile-phase3.css',
  'registry-mobile-phase4.css',
  'registry-mobile-design-audit.css',
  'registry-mobile-phone-hardening.css',
  'registry-ux-phase1.css',
  'registry-ux-phase2.css',
  'registry-ux-phase3.css',
  'registry-table-tools.css',
  'registry-list-view.css',
  'tailadmin-professional.css',
  'tailadmin-shell.js',
  'tailadmin-professional.js',
  'registry-fast-start.js',
  'registry-runtime-loader.js',
  'registry-unified-table.js',
  'registry-table-tools.js',
  'auth-client.js',
  'offline-runtime.js',
];

assert(/data-drx-app="registry-v2"/.test(html), 'Registry v2 document marker is missing.');
assert(/href="\/registry-v2\.css\?v=[^"]+"/.test(html), 'Registry v2 stylesheet is not published.');
assert(/src="\/registry-v2\.js\?v=[^"]+"/.test(html), 'Registry v2 runtime is not published.');

const stylesheetLinks = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]);
const scriptSources = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);

assert(stylesheetLinks.length === 3, `Registry v2 must load registry CSS, dose-calculator CSS and the shared Stripe shell; found ${stylesheetLinks.length}.`);
assert(scriptSources.length === 5, `Registry v2 must load dose core/runtime, shared sidebar taxonomy, registry runtime and calculator runtime; found ${scriptSources.length}.`);
assert(stylesheetLinks[0].startsWith('/registry-v2.css'), 'Unexpected registry page stylesheet authority.');
assert(stylesheetLinks[1].startsWith('/registry-v2-dose-calculator.css'), 'Dose calculator stylesheet must remain second.');
assert(stylesheetLinks[2] === '/drx-dashboard-stripe.css?v=drx-dashboard-stripe-v8', 'Shared Stripe shell v8 must load last.');
assert(scriptSources[0].startsWith('/dose-core.js'), 'Dose core must load first.');
assert(scriptSources[1].startsWith('/dose-runtime-browser.js'), 'Dose browser runtime must load after dose core.');
assert(scriptSources[2] === '/sidebar-taxonomy-v3.js?v=sidebar-taxonomy-v5', 'Shared sidebar taxonomy v5 must load before the registry runtime.');
assert(scriptSources[3].startsWith('/registry-v2.js'), 'Registry runtime must load after shared sidebar taxonomy.');
assert(scriptSources[4].startsWith('/registry-v2-dose-calculator.js'), 'Dose calculator runtime must load last.');

for (const asset of legacyAssets) {
  assert(!html.includes(asset), `Legacy registry asset is still loaded by index.html: ${asset}`);
}

[
  'id="searchInput"',
  'id="filterPanel"',
  'id="registryTable"',
  'id="registryRows"',
  'id="prevPageButton"',
  'id="nextPageButton"',
  'id="detailDrawer"',
  'id="drawerBody"',
].forEach(needle => assert(html.includes(needle), `Registry v2 surface is missing ${needle}.`));

[
  "view:'registry-page'",
  "/api/drug-search?",
  "/api/dosage?view=cards",
  "view=registry-detail",
  "/api/dosage?view=card",
  "includeTotal:'true'",
  "state.pageSize",
  "state.sort",
  "state.direction",
].forEach(needle => assert(js.includes(needle), `Registry v2 runtime contract is missing: ${needle}`));

assert(js.includes("credentials:'same-origin'"), 'Authenticated API requests must keep same-origin credentials.');
assert(js.includes("response.status === 401 || response.status === 403"), 'Registry v2 must fail closed on unauthenticated API responses.');
assert(js.includes('escapeHtml'), 'Registry v2 must escape rendered text.');
assert(js.includes('AbortController'), 'Registry v2 requests must have bounded timeouts.');
assert(js.includes('requestId'), 'Registry v2 must discard stale concurrent responses.');
assert(js.includes('220'), 'Registry v2 search must be debounced.');

assert(js.includes("const COLUMN_PICKER_STABILITY = 'registry-column-picker-stability-v2'"), 'Transactional Registry v2 column picker patch is missing.');
assert(js.includes('columnPickerDraft: null'), 'Column picker must keep an isolated draft while open.');
assert(js.includes('columnPickerDirty: false'), 'Column picker must track whether the draft differs from the committed table state.');
assert(js.includes('preferenceInteractionVersion: 0'), 'Profile preference loading must be guarded against live user interaction.');
assert(js.includes('function sameColumnSelection('), 'Column picker must compare draft and committed selections deterministically.');
assert(js.includes('function syncColumnPickerState()'), 'Column picker must update checkbox state without rebuilding its open DOM.');
assert(js.includes('preferenceSaveInFlight: false'), 'Column preference writes must be serialized.');
assert(js.includes('state.preferenceRevision += 1;'), 'Committed column changes must carry a stale-response revision guard.');
assert(js.includes('interactionVersion !== state.preferenceInteractionVersion'), 'A late profile GET must not overwrite a live checkbox interaction.');
assert(js.includes("el.columnPickerPanel.addEventListener('change'"), 'Column toggles must use native checkbox change events.');
assert(js.includes('registryColumns:snapshot'), 'Column preference persistence must write an immutable visible-column snapshot.');
assert(js.includes('el.columnPickerList.scrollTop = 0;'), 'Column picker must open at a deterministic scroll position.');
assert(!js.includes("querySelector('input:not(:disabled)')?.focus"), 'Column picker must not auto-focus an internal checkbox and trigger WebKit scroll jumps.');

const persistStart = js.indexOf('async function persistColumnPreferences()');
const persistEnd = js.indexOf('function scheduleColumnSave()', persistStart);
assert(persistStart >= 0 && persistEnd > persistStart, 'Column preference persistence function is missing.');
const persistBody = js.slice(persistStart, persistEnd);
assert(!persistBody.includes('state.visibleColumns = new Set'), 'A delayed PUT acknowledgement must not repaint visible columns.');

assert(js.includes("const REGISTRY_DOSE_AUTOLOAD = 'registry-dose-autoload-retry-v2'"), 'Cache-safe registry dosage hydration patch is missing.');
assert(js.includes("const LEGACY_DOSAGE_CACHE = 'medindex-private-resilient-v2'"), 'Registry must know the legacy shared dosage cache key.');
assert(js.includes('async function clearLegacySharedDosageCache()'), 'Registry must evict the old bare dosage cache entry before hydration.');
assert(js.includes('navigator.serviceWorker.getRegistration()'), 'Registry must request a service-worker update after the cache fix deploys.');
assert(js.includes('const maxAttempts = 3;'), 'Visible dosage hydration must retry automatically after a transient failure.');
assert(js.includes('fetchJson(url, {}, 14000)'), 'Visible dosage hydration needs a bounded but generous clinical deadline.');
assert(js.includes('Stale dosage cache returned cards from another registry page'), 'Registry must reject dosage cards that belong to another page.');
assert(js.includes("setDoseLoadMessage('Duke ringarkuar dozën…')"), 'Transient dosage failures must stay in an automatic retry state.');
assert(js.includes("setDoseLoadMessage('Doza s’u ngarkua', 'error')"), 'Transport/cache failure must not be mislabeled as an unpublished dose.');
const doseStart = js.indexOf('async function loadDosageForVisibleRows(requestId)');
const doseEnd = js.indexOf('function doseMarkup', doseStart);
assert(doseStart >= 0 && doseEnd > doseStart, 'Visible dosage loader is missing.');
const doseBody = js.slice(doseStart, doseEnd);
assert(doseBody.includes('await clearLegacySharedDosageCache();'), 'Every visible-page dosage hydration must clear the legacy shared cache key.');

assert(worker.includes("const DOSAGE_CACHE_ISOLATION = 'dosage-query-cache-isolation-v1'"), 'Service worker dosage cache isolation patch is missing.');
assert(worker.includes("if (path === '/api/dosage')"), 'Service worker must give dosage its own query-aware cache-key path.');
assert(worker.includes('normalized.searchParams.sort();'), 'Dosage cache key must retain and canonicalize query parameters.');
assert(worker.includes('async function dosageDataResponse(event, url)'), 'Dosage requests need a dedicated network-first service-worker path.');
assert(worker.includes("cloneWithHeader(response, 'dosage-network')"), 'Online dosage must prefer the exact network response.');
assert(worker.includes("cloneWithHeader(cached, 'dosage-query-hit')"), 'Offline dosage fallback must use only the exact query cache entry.');
assert(worker.includes("privateCache.delete(requestFor('/api/dosage'"), 'Updated worker must evict the old bare dosage cache entry on activation.');
assert(worker.includes("if (url.pathname === '/api/dosage') return event.respondWith(dosageDataResponse(event, url));"), 'Dosage fetches must bypass generic pathname-only private caching.');

assert(css.includes('--accent:#635bff'), 'Stripe-style accent token is missing.');
assert(css.includes('.data-card'), 'Canonical table card style is missing.');
assert(css.includes('.detail-drawer'), 'Detail drawer style is missing.');
assert(css.includes('@media(max-width:760px)'), 'Mobile registry layout is missing.');
assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'Reduced-motion support is missing.');
assert(css.includes('registry-column-picker-scroll-stability-v2'), 'Column picker scroll stability marker is missing.');
assert(css.includes('overflow-anchor:none'), 'Column picker must disable browser scroll anchoring while selections change.');
assert(css.includes('scrollbar-gutter:stable'), 'Column picker must reserve a stable scrollbar gutter.');
assert(!css.includes('!important'), 'Registry v2 stylesheet must not rely on !important overrides.');

const tableHeaderCount = (html.match(/<th\b/g) || []).length;
assert(tableHeaderCount >= 10 && tableHeaderCount <= 15, `Registry v2 table column count is unexpected: ${tableHeaderCount}.`);

console.log(JSON.stringify({
  ok:true,
  architecture:'registry-v2',
  stylesheets:stylesheetLinks,
  scripts:scriptSources,
  shellVersion:'drx-dashboard-stripe-v8',
  tableHeaderCount,
  columnPickerStability:'registry-column-picker-stability-v2',
  dosageAutoload:'registry-dose-autoload-retry-v2',
  dosageCacheIsolation:'dosage-query-cache-isolation-v1',
  legacyAssetsLoaded:0,
}, null, 2));
