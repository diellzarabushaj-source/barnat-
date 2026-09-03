'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html');
const css = read('registry-v2.css');
const js = read('registry-v2.js');

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
assert(scriptSources[2].startsWith('/sidebar-taxonomy-v3.js'), 'Shared sidebar taxonomy must load before the registry runtime.');
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
assert(js.includes("escapeHtml"), 'Registry v2 must escape rendered text.');
assert(js.includes("AbortController"), 'Registry v2 requests must have bounded timeouts.');
assert(js.includes("requestId"), 'Registry v2 must discard stale concurrent responses.');
assert(js.includes("220"), 'Registry v2 search must be debounced.');

assert(css.includes('--accent:#635bff'), 'Stripe-style accent token is missing.');
assert(css.includes('.data-card'), 'Canonical table card style is missing.');
assert(css.includes('.detail-drawer'), 'Detail drawer style is missing.');
assert(css.includes('@media(max-width:760px)'), 'Mobile registry layout is missing.');
assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'Reduced-motion support is missing.');
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
  legacyAssetsLoaded:0,
}, null, 2));
