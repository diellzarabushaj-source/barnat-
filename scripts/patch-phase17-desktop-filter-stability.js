'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const MOBILE_FILE = path.join(ROOT, 'registry-mobile-lite.js');
const API_FILE = path.join(ROOT, 'api', 'drug-search.js');
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Phase 17 desktop filter stability could not find ${label}.`);
  source = source.replace(before, after);
}

replaceOnce(
  `  let pageController = null;\n  let searchTimer = 0;`,
  `  let pageController = null;\n  let pageRequestEpoch = 0;\n  let countController = null;\n  let countRequestEpoch = 0;\n  let countTimer = 0;\n  let searchTimer = 0;`,
  'request epoch and non-blocking count state',
);

replaceOnce(
  `    const controller = new AbortController();\n    pageController = controller;\n    setBusy(true);\n    try {\n      const logical = await fetchLogicalPage({ includeTotal, signal:controller.signal });\n      state.hasNext = Number.isFinite(logical.total)`,
  `    const controller = new AbortController();\n    pageController = controller;\n    const requestEpoch = ++pageRequestEpoch;\n    // Exact count used to share the first row request and made a ~sub-ms page\n    // wait tens of milliseconds for COUNT(*). A caller can still request a\n    // refreshed total, but rows always stay on the count-free critical path.\n    if (includeTotal) {\n      window.clearTimeout(countTimer);\n      countTimer = 0;\n      countController?.abort();\n      countController = null;\n      state.total = null;\n      state.totalPages = null;\n    }\n    setBusy(true);\n    try {\n      const logical = await fetchLogicalPage({ includeTotal:false, signal:controller.signal });\n      // AbortController is the first line of defence. The epoch is the final\n      // commit gate: even if an older response has already crossed the network\n      // abort boundary, it cannot publish rows or pagination after a newer\n      // filter/page request owns the table.\n      if (requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted) return;\n      state.hasNext = Number.isFinite(logical.total)`,
  'late-response commit gate and count-free row path',
);

replaceOnce(
  `      renderCount();\n      renderPagination();\n      state.ready = true;`,
  `      renderCount();\n      renderPagination();\n      // Render and publish rows first. Exact totals are useful metadata, not a\n      // prerequisite for interacting with the registry.\n      if (includeTotal) scheduleDesktopExactTotal();\n      state.ready = true;`,
  'deferred exact count scheduling',
);

replaceOnce(
  `    } catch (error) {\n      if (error?.name === 'AbortError') return;\n      console.error('Desktop lightweight registry failed:', error);`,
  `    } catch (error) {\n      if (error?.name === 'AbortError' || requestEpoch !== pageRequestEpoch) return;\n      console.error('Desktop lightweight registry failed:', error);`,
  'stale error guard',
);

const controlsAnchor = `  function configureControls() {`;
const countAndSearchHelpers = `  function countContextKey() {\n    const url = new URL(buildPageUrl({ includeTotal:false, page:1, pageSize:1 }), window.location.origin);\n    for (const key of ['page', 'pageSize', 'sort', 'direction', 'includeTotal']) url.searchParams.delete(key);\n    return url.searchParams.toString();\n  }\n\n  async function refreshDesktopExactTotal(contextKey) {\n    if (state.disabled || state.q.length >= 2 || contextKey !== countContextKey()) return;\n    countController?.abort();\n    const controller = new AbortController();\n    countController = controller;\n    const requestEpoch = ++countRequestEpoch;\n    try {\n      const response = await fetch(buildPageUrl({ includeTotal:true, page:1, pageSize:1 }), {\n        credentials:'same-origin', cache:'default', signal:controller.signal,\n        headers:{ Accept:'application/json' },\n      });\n      if (response.status === 401) return;\n      if (!response.ok) throw new Error('Numri i barnave nuk u rifreskua (' + response.status + ').');\n      const payload = await response.json();\n      const rawTotal = payload?.pagination?.total;\n      const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);\n      if (!Number.isFinite(total)) return;\n      if (controller.signal.aborted || countController !== controller || requestEpoch !== countRequestEpoch || contextKey !== countContextKey()) return;\n      state.total = total;\n      state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));\n      renderCount();\n      renderPagination();\n      window.dispatchEvent(new CustomEvent('medindex:registry-count-ready', {\n        detail:{ total, totalPages:state.totalPages, pageSize:state.pageSize, source:'supabase-exact' }\n      }));\n    } catch (error) {\n      if (error?.name !== 'AbortError' && requestEpoch === countRequestEpoch) {\n        console.warn('Desktop registry exact count refresh failed:', error);\n      }\n    } finally {\n      if (countController === controller) countController = null;\n    }\n  }\n\n  function scheduleDesktopExactTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    if (state.disabled || state.q.length >= 2) return;\n    const contextKey = countContextKey();\n    countTimer = window.setTimeout(() => {\n      countTimer = 0;\n      if (state.disabled || state.q.length >= 2 || contextKey !== countContextKey()) return;\n      void refreshDesktopExactTotal(contextKey);\n    }, 40);\n  }\n\n  function syncDesktopSearchState() {\n    window.clearTimeout(searchTimer);\n    searchTimer = 0;\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    countController?.abort();\n    countController = null;\n    const search = document.getElementById('search');\n    const raw = clean(search?.value || '').slice(0, 80);\n    // Registry search intentionally starts at two characters. A one-character\n    // input must never leave state.q pointing at an older multi-character term.\n    state.q = raw.length >= 2 ? raw : '';\n    state.total = null;\n    state.totalPages = null;\n    return state.q;\n  }\n\n${controlsAnchor}`;
if (!source.includes('function countContextKey()')) {
  if (!source.includes(controlsAnchor)) throw new Error('Phase 17 could not find control setup anchor.');
  source = source.replace(controlsAnchor, countAndSearchHelpers);
}

replaceOnce(
  `    const status = document.getElementById('statusFilter');\n    status?.addEventListener('change', () => {\n      state.status = clean(status.value);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });\n    });`,
  `    const status = document.getElementById('statusFilter');\n    status?.addEventListener('change', () => {\n      syncDesktopSearchState();\n      state.status = clean(status.value);\n      state.page = 1;\n      void loadPage({ includeTotal:state.q.length === 0, scroll:false });\n    });`,
  'status/search coalescing',
);

replaceOnce(
  `      state.pageSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(DEFAULT_PAGE_SIZE, requested));\n      event.currentTarget.value = String(state.pageSize);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });`,
  `      syncDesktopSearchState();\n      state.pageSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(DEFAULT_PAGE_SIZE, requested));\n      event.currentTarget.value = String(state.pageSize);\n      state.page = 1;\n      void loadPage({ includeTotal:state.q.length === 0, scroll:false });`,
  'page-size/search coalescing',
);

replaceOnce(
  `  function selectDesktopForm(type, value) {\n    if (state.disabled) return;\n    state.formType = type === 'category' || type === 'form' ? type : null;\n    state.formValue = state.formType ? clean(value) : null;\n    state.page = 1;\n    syncDesktopFormButton();\n    document.getElementById('formPanel')?.classList.remove('open');\n    buildDesktopFormPanel(document.getElementById('formSearch')?.value || '');\n    void loadPage({ includeTotal:true, scroll:false });\n  }`,
  `  function selectDesktopForm(type, value) {\n    if (state.disabled) return;\n    const nextType = type === 'category' || type === 'form' ? type : null;\n    const nextValue = nextType ? clean(value) : null;\n    document.getElementById('formPanel')?.classList.remove('open');\n    // Clicking the already-selected form is a UI no-op, not a reason to hit\n    // the registry API again.\n    if (state.formType === nextType && state.formValue === nextValue) return;\n    syncDesktopSearchState();\n    state.formType = nextType;\n    state.formValue = nextValue;\n    state.page = 1;\n    syncDesktopFormButton();\n    buildDesktopFormPanel(document.getElementById('formSearch')?.value || '');\n    void loadPage({ includeTotal:state.q.length === 0, scroll:false });\n  }`,
  'form filter dedupe and search coalescing',
);

for (const invariant of [
  'let pageRequestEpoch = 0',
  'let countRequestEpoch = 0',
  'const requestEpoch = ++pageRequestEpoch',
  'fetchLogicalPage({ includeTotal:false, signal:controller.signal })',
  'requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted',
  'function countContextKey()',
  'function scheduleDesktopExactTotal()',
  "buildPageUrl({ includeTotal:true, page:1, pageSize:1 })",
  'contextKey !== countContextKey()',
  'if (includeTotal) scheduleDesktopExactTotal()',
  'function syncDesktopSearchState()',
  'includeTotal:state.q.length === 0',
  'if (state.formType === nextType && state.formValue === nextValue) return',
]) {
  if (!source.includes(invariant)) throw new Error(`Phase 17 invariant missing: ${invariant}`);
}
if (source.includes('fetchLogicalPage({ includeTotal, signal:controller.signal })')) {
  throw new Error('Phase 17 row critical path must never wait for exact count work.');
}

fs.writeFileSync(FILE, source, 'utf8');

// Mobile uses the same bounded registry-page gateway. Keep exact totals useful,
// but do not let count=exact delay initial load, page-size changes, status/ATC/
// form/substance/indication/population filters, or clearing a search.
let mobileSource = fs.readFileSync(MOBILE_FILE, 'utf8').replace(/\r\n?/g, '\n');
function replaceMobileOnce(before, after, label) {
  if (mobileSource.includes(after)) return;
  if (!mobileSource.includes(before)) throw new Error(`Phase 17 mobile count stability could not find ${label}.`);
  mobileSource = mobileSource.replace(before, after);
}

replaceMobileOnce(
  `  let pageController = null;\n  let detailController = null;`,
  `  let pageController = null;\n  let pageRequestEpoch = 0;\n  let countController = null;\n  let countRequestEpoch = 0;\n  let countTimer = 0;\n  let detailController = null;`,
  'mobile request/count ownership state',
);

replaceMobileOnce(
  `  function clearKnownTotal() {\n    state.total = null;\n    state.totalPages = null;\n  }`,
  `  function clearKnownTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    countController?.abort();\n    countController = null;\n    state.total = null;\n    state.totalPages = null;\n  }`,
  'mobile count invalidation',
);

const mobileLoadAnchor = `  async function loadPage({ includeTotal = false, scroll = false } = {}) {`;
const mobileCountHelpers = `  function mobileCountContextKey() {\n    const url = new URL(buildPageUrl({ includeTotal:false }), window.location.origin);\n    for (const key of ['page', 'pageSize', 'sort', 'direction', 'includeTotal']) url.searchParams.delete(key);\n    return url.searchParams.toString();\n  }\n\n  function mobileExactCountUrl() {\n    const url = new URL(buildPageUrl({ includeTotal:true }), window.location.origin);\n    url.searchParams.set('page', '1');\n    url.searchParams.set('pageSize', '1');\n    return url.toString();\n  }\n\n  async function refreshMobileExactTotal(contextKey) {\n    if (state.disabled || state.q.length >= 2 || contextKey !== mobileCountContextKey()) return;\n    countController?.abort();\n    const controller = new AbortController();\n    countController = controller;\n    const requestEpoch = ++countRequestEpoch;\n    try {\n      const response = await fetch(mobileExactCountUrl(), {\n        credentials:'same-origin', cache:'default', signal:controller.signal,\n        headers:{ Accept:'application/json' },\n      });\n      if (response.status === 401) return;\n      if (!response.ok) throw new Error('Numri i barnave nuk u rifreskua (' + response.status + ').');\n      const payload = await response.json();\n      const rawTotal = payload?.pagination?.total;\n      const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);\n      if (!Number.isFinite(total)) return;\n      if (controller.signal.aborted || countController !== controller || requestEpoch !== countRequestEpoch || contextKey !== mobileCountContextKey()) return;\n      state.total = total;\n      state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));\n      renderCount();\n      renderPagination();\n      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-count-ready', {\n        detail:{ total, totalPages:state.totalPages, pageSize:state.pageSize, source:'supabase-exact' }\n      }));\n    } catch (error) {\n      if (error?.name !== 'AbortError' && requestEpoch === countRequestEpoch) {\n        console.warn('Mobile registry exact count refresh failed:', error);\n      }\n    } finally {\n      if (countController === controller) countController = null;\n    }\n  }\n\n  function scheduleMobileExactTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    if (state.disabled || state.q.length >= 2) return;\n    const contextKey = mobileCountContextKey();\n    countTimer = window.setTimeout(() => {\n      countTimer = 0;\n      if (state.disabled || state.q.length >= 2 || contextKey !== mobileCountContextKey()) return;\n      void refreshMobileExactTotal(contextKey);\n    }, 40);\n  }\n\n${mobileLoadAnchor}`;
if (!mobileSource.includes('function mobileCountContextKey()')) {
  if (!mobileSource.includes(mobileLoadAnchor)) throw new Error('Phase 17 mobile load anchor is missing.');
  mobileSource = mobileSource.replace(mobileLoadAnchor, mobileCountHelpers);
}

replaceMobileOnce(
  `    pageController?.abort();\n    pageController = new AbortController();\n    setBusy(true);\n    try {\n      const response = await fetch(buildPageUrl({ includeTotal }), {\n        credentials:'same-origin',\n        cache:'default',\n        signal:pageController.signal,`,
  `    pageController?.abort();\n    const controller = new AbortController();\n    pageController = controller;\n    const requestEpoch = ++pageRequestEpoch;\n    if (includeTotal) clearKnownTotal();\n    setBusy(true);\n    try {\n      const response = await fetch(buildPageUrl({ includeTotal:false }), {\n        credentials:'same-origin',\n        cache:'default',\n        signal:controller.signal,`,
  'mobile count-free row request',
);

replaceMobileOnce(
  `      const payload = await response.json();\n      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e regjistrit është e pavlefshme.');\n\n      state.page = Number(payload.pagination?.page || state.page) || state.page;`,
  `      const payload = await response.json();\n      if (!payload?.ok || !Array.isArray(payload.rows)) throw new Error('Përgjigjja e regjistrit është e pavlefshme.');\n      if (requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted) return;\n\n      state.page = Number(payload.pagination?.page || state.page) || state.page;`,
  'mobile stale row commit gate',
);

replaceMobileOnce(
  `      renderRows(payload.rows);\n      renderCount();\n      renderPagination();\n      state.ready = true;`,
  `      renderRows(payload.rows);\n      renderCount();\n      renderPagination();\n      if (includeTotal) scheduleMobileExactTotal();\n      state.ready = true;`,
  'mobile deferred count scheduling',
);

replaceMobileOnce(
  `    } catch (error) {\n      if (error?.name === 'AbortError') return;\n      console.error('Mobile lightweight registry failed:', error);`,
  `    } catch (error) {\n      if (error?.name === 'AbortError' || requestEpoch !== pageRequestEpoch) return;\n      console.error('Mobile lightweight registry failed:', error);`,
  'mobile stale error guard',
);

replaceMobileOnce(
  `    } finally {\n      setBusy(false);\n    }`,
  `    } finally {\n      if (pageController === controller) {\n        pageController = null;\n        setBusy(false);\n      }\n    }`,
  'mobile newest-request busy ownership',
);

for (const invariant of [
  'let pageRequestEpoch = 0',
  'let countRequestEpoch = 0',
  'function mobileCountContextKey()',
  'function mobileExactCountUrl()',
  "url.searchParams.set('pageSize', '1')",
  'fetch(buildPageUrl({ includeTotal:false })',
  'requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted',
  'if (includeTotal) scheduleMobileExactTotal()',
  'contextKey !== mobileCountContextKey()',
  'medindex:mobile-lite-count-ready',
  'if (pageController === controller)',
]) {
  if (!mobileSource.includes(invariant)) throw new Error(`Phase 17 mobile invariant missing: ${invariant}`);
}
if (mobileSource.includes('fetch(buildPageUrl({ includeTotal })')) {
  throw new Error('Phase 17 mobile row critical path must never wait for exact count work.');
}
fs.writeFileSync(MOBILE_FILE, mobileSource, 'utf8');

// The registry table previously expressed free-text search as an OR across nine
// ILIKE clauses. PostgreSQL therefore performed a sequential scan even though a
// full-text index existed, because that index does not accelerate substring
// ILIKE. The Supabase migration adds a generated registry_search_text column
// backed by a partial pg_trgm GIN index. Keep the table query on that one indexed
// predicate.
let apiSource = fs.readFileSync(API_FILE, 'utf8').replace(/\r\n?/g, '\n');
const builderStart = apiSource.indexOf('function buildRegistryPagePath(query = {}) {');
if (builderStart < 0) throw new Error('Phase 17 indexed search could not find registry-page builder.');
const returnStart = apiSource.indexOf('\n  return {', builderStart);
if (returnStart < 0) throw new Error('Phase 17 indexed search could not find registry-page return block.');
const builder = apiSource.slice(builderStart, returnStart);

if (!builder.includes("params.set('registry_search_text', `ilike.${pattern}`)")) {
  const searchStart = apiSource.indexOf('  if (q.length >= 2) {', builderStart);
  const searchEndMarker = '\n  }\n\n  return {';
  const searchEnd = searchStart >= 0 ? apiSource.indexOf(searchEndMarker, searchStart) : -1;
  if (searchStart < 0 || searchEnd < 0 || searchEnd > returnStart) {
    throw new Error('Phase 17 indexed search could not isolate the registry-page free-text block.');
  }
  const replacement = `  if (q.length >= 2) {\n    const pattern = \`*\${q}*\`;\n    params.set('registry_search_text', \`ilike.\${pattern}\`);\n  }`;
  apiSource = apiSource.slice(0, searchStart) + replacement + apiSource.slice(searchEnd + '\n  }'.length);
}

const finalBuilderStart = apiSource.indexOf('function buildRegistryPagePath(query = {}) {');
const finalReturnStart = apiSource.indexOf('\n  return {', finalBuilderStart);
const finalBuilder = apiSource.slice(finalBuilderStart, finalReturnStart);
if (!finalBuilder.includes("params.set('registry_search_text', `ilike.${pattern}`)")) {
  throw new Error('Phase 17 indexed registry search predicate is missing.');
}
if (finalBuilder.includes("params.set('or'")) {
  throw new Error('Phase 17 registry-page search must not regress to multi-column OR ILIKE scans.');
}

// Ranked/global search keeps its existing candidate fields and JS ranking, but
// its candidate fetch should not scan eight ILIKE predicates. The generated
// global_search_text column contains exactly trade name, active substance, ATC,
// class, indication, strength, pharmaceutical form and packaging, so replacing
// the OR only changes the execution path, not which rows are eligible.
const globalStart = apiSource.indexOf('async function neonSearchRows(rawQuery) {');
const globalEnd = globalStart >= 0 ? apiSource.indexOf('\n}\n\nfunction rankedRows', globalStart) : -1;
if (globalStart < 0 || globalEnd < 0) throw new Error('Phase 17 indexed global search could not find candidate function.');
let globalBlock = apiSource.slice(globalStart, globalEnd);
if (!globalBlock.includes("params.set('global_search_text', `ilike.*${token}*`)")) {
  const filterStart = globalBlock.indexOf("  params.set('or', `(");
  const orderStart = globalBlock.indexOf("  params.set('order', 'registry_number.asc');");
  if (filterStart < 0 || orderStart < 0 || orderStart <= filterStart) {
    throw new Error('Phase 17 indexed global search could not isolate candidate OR filter.');
  }
  globalBlock = globalBlock.slice(0, filterStart)
    + "  params.set('global_search_text', `ilike.*${token}*`);\n"
    + globalBlock.slice(orderStart);
  apiSource = apiSource.slice(0, globalStart) + globalBlock + apiSource.slice(globalEnd);
}

const finalGlobalStart = apiSource.indexOf('async function neonSearchRows(rawQuery) {');
const finalGlobalEnd = apiSource.indexOf('\n}\n\nfunction rankedRows', finalGlobalStart);
const finalGlobalBlock = apiSource.slice(finalGlobalStart, finalGlobalEnd);
if (!finalGlobalBlock.includes("params.set('global_search_text', `ilike.*${token}*`)")) {
  throw new Error('Phase 17 indexed global candidate predicate is missing.');
}
if (finalGlobalBlock.includes("params.set('or'")) {
  throw new Error('Phase 17 global candidate search must not regress to multi-column OR ILIKE scans.');
}

fs.writeFileSync(API_FILE, apiSource, 'utf8');

console.log('Phase 17 registry stability/performance passed: desktop/mobile rows never wait for exact counts, stale responses cannot commit, filters coalesce safely, and table/global candidate searches use trigram-indexed paths.');
