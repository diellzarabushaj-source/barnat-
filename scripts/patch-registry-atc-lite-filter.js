'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.MEDINDEX_PATCH_ROOT
  ? path.resolve(process.env.MEDINDEX_PATCH_ROOT)
  : path.resolve(__dirname, '..');
const MARKER = 'registry-atc-lite-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`ATC lite patch could not find ${label}.`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) throw new Error(`ATC lite patch could not find ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function locationHelpers({ maximumPageSize }) {
  return `  function normalizeRegistryAtc(value) {
    const resolved = window.MedIndexATC?.resolveCategoryCode?.(value);
    if (resolved) return resolved;
    const compact = clean(value).toUpperCase().replace(/\\s+/g, '');
    return /^[A-Z](?:\\d{2})?$/.test(compact) ? compact : '';
  }

  function readRegistryLocationState() {
    const shared = window.MedIndexATC?.readRegistryUrlState?.(location.href) || {};
    const params = new URLSearchParams(location.search);
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(${maximumPageSize}, Math.max(1, Number(params.get('pageSize')) || DEFAULT_PAGE_SIZE));
    return {
      atc:normalizeRegistryAtc(shared.atc || params.get('atc')),
      q:clean(shared.query ?? params.get('q')).slice(0, 80),
      page,
      pageSize,
    };
  }

  function applyRegistryLocationState() {
    const next = readRegistryLocationState();
    const categoryChanged = state.atc !== next.atc;
    state.atc = next.atc;
    state.q = next.q;
    state.page = next.page;
    state.pageSize = next.pageSize;
    if (categoryChanged) state.categoryTotal = null;
    const search = document.getElementById('search');
    const pageSize = document.getElementById('pageSize');
    if (search) search.value = state.q;
    if (pageSize && [...pageSize.options].some(option => Number(option.value) === state.pageSize)) {
      pageSize.value = String(state.pageSize);
    }
  }

  function syncRegistryLocation() {
    state.atc = normalizeRegistryAtc(state.atc);
    const builder = window.MedIndexATC?.registryUrlFromState;
    if (typeof builder !== 'function') return;
    const next = builder(location.href, {
      atc:state.atc,
      query:state.q,
      page:state.page,
      pageSize:state.pageSize,
    });
    const current = location.pathname + location.search + location.hash;
    if (next !== current) history.replaceState({ ...(history.state || {}), medindexRegistry:true }, '', next);
  }

  function publishRegistryAtcState() {
    const filteredTotal = Number.isFinite(state.total) ? state.total : state.rows?.length || 0;
    if (state.atc && !state.q && Number.isFinite(state.total)) state.categoryTotal = state.total;
    const detail = {
      activeAtc:state.atc,
      label:window.MedIndexATC?.getCategoryLabel?.(state.atc) || '',
      categoryTotal:Number.isFinite(state.categoryTotal) ? state.categoryTotal : filteredTotal,
      filteredTotal,
      query:state.q,
      page:state.page,
      pageSize:state.pageSize,
      partial:true,
    };
    window.MEDINDEX_REGISTRY_ACTIVE_ATC = state.atc;
    window.MEDINDEX_REGISTRY_ATC_STATE = detail;
    window.dispatchEvent(new CustomEvent('medindex:registry-atc-state', { detail }));
  }

  function handleRegistryLocationChange() {
    if (state.disabled) return;
    applyRegistryLocationState();
    state.total = null;
    state.totalPages = null;
    state.hasNext = false;
    publishRegistryAtcState();
    void loadPage({ includeTotal:true, scroll:false });
  }

`;
}

function patchApi() {
  let source = read('api/drug-search.js');
  source = replaceOnce(
    source,
    'const REGISTRY_MAX_QUERY_LENGTH = 80;',
    `const REGISTRY_MAX_QUERY_LENGTH = 80;\nconst REGISTRY_ATC_LITE_RUNTIME = '${MARKER}';`,
    'API ATC marker',
  );

  const helper = `function registryPageAtcFilter(value) {
  const code = clean(value).toUpperCase().replace(/\\s+/g, '');
  return /^[A-Z](?:\\d{2})?$/.test(code) ? code : '';
}

`;
  source = replaceBlock(
    source,
    'function registryPageAtcFilter(value) {',
    'function registryPagePopulation',
    helper,
    'strict API ATC filter',
  );
  source = replaceOnce(
    source,
    'module.exports.buildRegistryPagePath = buildRegistryPagePath;',
    'module.exports.buildRegistryPagePath = buildRegistryPagePath;\nmodule.exports.registryPageAtcFilter = registryPageAtcFilter;',
    'API ATC helper export',
  );

  if (!source.includes("params.set('atc_code', `ilike.${atc}*`)")) {
    throw new Error('Registry-page API is not applying the ATC prefix in Neon.');
  }
  write('api/drug-search.js', source);
}

function patchDesktop() {
  let source = read('registry-desktop-lite.js');
  source = replaceOnce(
    source,
    '  const HANDOFF_TIMEOUT_MS = 45000;',
    `  const HANDOFF_TIMEOUT_MS = 45000;\n  const DESKTOP_ATC_FILTER_RUNTIME = '${MARKER}';`,
    'desktop ATC marker',
  );
  source = replaceOnce(
    source,
    `    q:'',\n    status:'',`,
    `    q:'',\n    status:'',\n    atc:'',\n    categoryTotal:null,`,
    'desktop ATC state',
  );
  source = replaceOnce(
    source,
    '  function authReady() {',
    `${locationHelpers({ maximumPageSize:500 })}  function authReady() {`,
    'desktop URL-state helpers',
  );
  source = replaceOnce(
    source,
    `    if (state.status) params.set('status', state.status);`,
    `    if (state.status) params.set('status', state.status);\n    if (state.atc) params.set('atc', state.atc);`,
    'desktop ATC request parameter',
  );
  source = replaceOnce(
    source,
    `  async function loadPage({ includeTotal = false, scroll = false } = {}) {\n    if (state.disabled) return;`,
    `  async function loadPage({ includeTotal = false, scroll = false } = {}) {\n    if (state.disabled) return;\n    syncRegistryLocation();`,
    'desktop URL synchronization',
  );
  source = replaceOnce(
    source,
    `      publishVisibleRows(logical.rows);`,
    `      publishVisibleRows(logical.rows);\n      publishRegistryAtcState();`,
    'desktop ATC state publication',
  );
  source = replaceOnce(
    source,
    `  function start() {\n    if (state.disabled) return;\n    configureControls();`,
    `  function start() {\n    if (state.disabled) return;\n    applyRegistryLocationState();\n    publishRegistryAtcState();\n    configureControls();`,
    'desktop URL-state startup',
  );
  source = replaceOnce(
    source,
    `  media.addEventListener?.('change', event => {`,
    `  window.addEventListener('popstate', handleRegistryLocationChange);\n\n  media.addEventListener?.('change', event => {`,
    'desktop history handling',
  );

  if (!source.includes("params.set('atc', state.atc)")) throw new Error('Desktop lite ATC request is missing.');
  if (!source.includes("window.addEventListener('popstate', handleRegistryLocationChange)")) throw new Error('Desktop lite history handling is missing.');
  write('registry-desktop-lite.js', source);
}

function patchMobile() {
  let source = read('registry-mobile-lite.js');
  source = replaceOnce(
    source,
    '  const SEARCH_DEBOUNCE_MS = 250;',
    `  const SEARCH_DEBOUNCE_MS = 250;\n  const MOBILE_ATC_FILTER_RUNTIME = '${MARKER}';`,
    'mobile ATC marker',
  );
  source = replaceOnce(
    source,
    `    atc:'',\n    form:'',`,
    `    atc:'',\n    categoryTotal:null,\n    form:'',`,
    'mobile ATC category total',
  );
  source = replaceOnce(
    source,
    '  function authReady() {',
    `${locationHelpers({ maximumPageSize:50 })}  function authReady() {`,
    'mobile URL-state helpers',
  );
  source = replaceOnce(
    source,
    `  async function loadPage({ includeTotal = false, scroll = false } = {}) {\n    if (state.disabled) return;`,
    `  async function loadPage({ includeTotal = false, scroll = false } = {}) {\n    if (state.disabled) return;\n    syncRegistryLocation();`,
    'mobile URL synchronization',
  );
  source = replaceOnce(
    source,
    `      renderRows(payload.rows);`,
    `      renderRows(payload.rows);\n      publishRegistryAtcState();`,
    'mobile ATC state publication',
  );
  source = replaceOnce(
    source,
    `  function start() {\n    if (state.disabled) return;\n    configureMobileControls();`,
    `  function start() {\n    if (state.disabled) return;\n    applyRegistryLocationState();\n    publishRegistryAtcState();\n    configureMobileControls();`,
    'mobile URL-state startup',
  );
  source = replaceOnce(
    source,
    `  media.addEventListener?.('change', event => {`,
    `  window.addEventListener('popstate', handleRegistryLocationChange);\n\n  media.addEventListener?.('change', event => {`,
    'mobile history handling',
  );

  if (!source.includes("params.set('atc', state.atc)")) throw new Error('Mobile lite ATC request is missing.');
  if (!source.includes("window.addEventListener('popstate', handleRegistryLocationChange)")) throw new Error('Mobile lite history handling is missing.');
  write('registry-mobile-lite.js', source);
}

patchApi();
patchDesktop();
patchMobile();
console.log('Registry ATC URL state now filters bounded Neon pages on desktop and mobile.');
