'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = ['index.html','klasifikimi.html','icd.html','analizat.html','dozologjia.html','protokollet.html','recetat.html'];

for (const page of pages) {
  const html = read(page);
  assert.equal((html.match(/mobile-app-navigation\.js\?v=20260812-1/g) || []).length, 1, `${page}: mobile app navigation must load exactly once`);
}

const index = read('index.html');
const server = index.indexOf('registry-mobile-server.js');
const filters = index.indexOf('registry-mobile-filters.js');
const state = index.indexOf('registry-mobile-state.js');
const fullLoader = index.indexOf('registry-runtime-loader.js');
assert.ok(server > 0 && filters > server && state > filters && fullLoader > state, 'registry mobile fast-path assets must load before the full runtime loader');

const nav = read('mobile-app-navigation.js');
assert.match(nav, /max-width: 1023px/, 'app navigation must be mobile/tablet only');
assert.match(nav, /Kryefaqja/, 'home nav item missing');
assert.match(nav, /Kërko/, 'search nav item missing');
assert.match(nav, /Kategoritë/, 'categories nav item missing');
assert.match(nav, /Recetat/, 'prescriptions nav item missing');
assert.match(nav, /Më shumë/, 'more nav item missing');
assert.match(nav, /safe-area-inset-bottom/, 'bottom navigation must respect device safe areas');
assert.doesNotMatch(nav, /apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'navigation must not know Neon credentials');

const filterSource = read('registry-mobile-filters.js');
assert.match(filterSource, /max-width: 767px/, 'registry filter sheet must be phone-only');
assert.match(filterSource, /Forma farmaceutike/, 'form filter missing');
assert.match(filterSource, /ATC/, 'ATC filter missing');
assert.match(filterSource, /Gjenerik/, 'status filter missing');
assert.match(filterSource, /pageSize:Number/, 'server page-size filter missing');
assert.match(filterSource, /registry\.setFilters/, 'filter sheet must use the mobile registry API');
assert.doesNotMatch(filterSource, /fetch\(|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'filter UI must not query Neon directly');

const mobile = read('registry-mobile-server.js');
assert.match(mobile, /mobile-server-registry-v2/, 'mobile registry API version is stale');
assert.match(mobile, /formQuery/, 'mobile registry must send form filter to server');
assert.match(mobile, /params\.set\('atc'/, 'mobile registry must send ATC filter to server');
assert.match(mobile, /window\.MedIndexMobileRegistry/, 'mobile registry public API is missing');
assert.match(mobile, /setFilters:applyFilters/, 'mobile registry filter API is missing');
assert.match(mobile, /medindex:mobile-detail-opened/, 'mobile detail state hook is missing');

const stateSource = read('registry-mobile-state.js');
assert.match(stateSource, /medindex_mobile_favorites_v1/, 'local favorites storage missing');
assert.match(stateSource, /medindex_mobile_recent_v1/, 'recent medicines storage missing');
assert.match(stateSource, /history\.pushState/, 'medicine detail deep link history is missing');
assert.match(stateSource, /scrollTop/, 'scroll restoration contract is missing');
assert.match(stateSource, /navigator\.share/, 'native share support is missing');
assert.doesNotMatch(stateSource, /fetch\(|apirest\.|NEON_DATA_API|VERCEL_OIDC_TOKEN/i, 'favorites/recent state must remain local and egress-free');

const api = read('api/registry-page.js');
assert.match(api, /formQuery/, 'registry API form query is missing');
assert.match(api, /pharmaceutical_form', `ilike\.\*\$\{formQuery\}\*`/, 'form filter must remain server-side');
assert.match(api, /atc_code', `ilike\.\$\{atc\}\*`/, 'ATC prefix filter must remain server-side');
assert.doesNotMatch(api, /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i, 'mobile UX phases must not mutate the database');

console.log('Mobile app navigation, filter sheet, detail state, favorites and egress contracts passed.');
