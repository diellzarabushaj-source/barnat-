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
  `    const controller = new AbortController();\n    pageController = controller;\n    const requestEpoch = ++pageRequestEpoch;\n    if (includeTotal) {\n      window.clearTimeout(countTimer);\n      countTimer = 0;\n      countController?.abort();\n      countController = null;\n      state.total = null;\n      state.totalPages = null;\n    }\n    setBusy(true);\n    try {\n      const logical = await fetchLogicalPage({ includeTotal:false, signal:controller.signal });\n      if (requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted) return;\n      state.hasNext = Number.isFinite(logical.total)`,
  'count-free desktop row path',
);

replaceOnce(
  `      renderCount();\n      renderPagination();\n      state.ready = true;`,
  `      renderCount();\n      renderPagination();\n      if (includeTotal) scheduleDesktopExactTotal();\n      state.ready = true;`,
  'deferred desktop exact count',
);

replaceOnce(
  `    } catch (error) {\n      if (error?.name === 'AbortError') return;\n      console.error('Desktop lightweight registry failed:', error);`,
  `    } catch (error) {\n      if (error?.name === 'AbortError' || requestEpoch !== pageRequestEpoch) return;\n      console.error('Desktop lightweight registry failed:', error);`,
  'desktop stale error guard',
);

const controlsAnchor = `  function configureControls() {`;
const desktopHelpers = `  function countContextKey() {\n    const url = new URL(buildPageUrl({ includeTotal:false, page:1, pageSize:1 }), window.location.origin);\n    for (const key of ['page', 'pageSize', 'sort', 'direction', 'includeTotal']) url.searchParams.delete(key);\n    return url.searchParams.toString();\n  }\n\n  async function refreshDesktopExactTotal(contextKey) {\n    if (state.disabled || state.q.length >= 2 || contextKey !== countContextKey()) return;\n    countController?.abort();\n    const controller = new AbortController();\n    countController = controller;\n    const requestEpoch = ++countRequestEpoch;\n    try {\n      const response = await fetch(buildPageUrl({ includeTotal:true, page:1, pageSize:1 }), {\n        credentials:'same-origin', cache:'default', signal:controller.signal,\n        headers:{ Accept:'application/json' },\n      });\n      if (response.status === 401) return;\n      if (!response.ok) throw new Error('Numri i barnave nuk u rifreskua (' + response.status + ').');\n      const payload = await response.json();\n      const rawTotal = payload?.pagination?.total;\n      const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);\n      if (!Number.isFinite(total)) return;\n      if (controller.signal.aborted || countController !== controller || requestEpoch !== countRequestEpoch || contextKey !== countContextKey()) return;\n      state.total = total;\n      state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));\n      renderCount();\n      renderPagination();\n      publishRegistryAtcState();\n      window.dispatchEvent(new CustomEvent('medindex:registry-count-ready', {\n        detail:{ total, totalPages:state.totalPages, pageSize:state.pageSize, source:'supabase-exact' }\n      }));\n    } catch (error) {\n      if (error?.name !== 'AbortError' && requestEpoch === countRequestEpoch) console.warn('Desktop registry exact count refresh failed:', error);\n    } finally {\n      if (countController === controller) countController = null;\n    }\n  }\n\n  function scheduleDesktopExactTotal() {\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    if (state.disabled || state.q.length >= 2) return;\n    const contextKey = countContextKey();\n    countTimer = window.setTimeout(() => {\n      countTimer = 0;\n      if (state.disabled || state.q.length >= 2 || contextKey !== countContextKey()) return;\n      void refreshDesktopExactTotal(contextKey);\n    }, 40);\n  }\n\n  function syncDesktopSearchState() {\n    window.clearTimeout(searchTimer);\n    searchTimer = 0;\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    countController?.abort();\n    countController = null;\n    const search = document.getElementById('search');\n    const raw = clean(search?.value || '').slice(0, 80);\n    state.q = raw.length >= 2 ? raw : '';\n    state.total = null;\n    state.totalPages = null;\n    return state.q;\n  }\n\n${controlsAnchor}`;
if (!source.includes('function countContextKey()')) {
  if (!source.includes(controlsAnchor)) throw new Error('Phase 17 could not find desktop controls anchor.');
  source = source.replace(controlsAnchor, desktopHelpers);
}

replaceOnce(
  `    const status = document.getElementById('statusFilter');\n    status?.addEventListener('change', () => {\n      state.status = clean(status.value);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });\n    });`,
  `    const status = document.getElementById('statusFilter');\n    status?.addEventListener('change', () => {\n      syncDesktopSearchState();\n      state.status = clean(status.value);\n      state.page = 1;\n      void loadPage({ includeTotal:state.q.length === 0, scroll:false });\n    });`,
  'desktop status/search coalescing',
);

replaceOnce(
  `      state.pageSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(DEFAULT_PAGE_SIZE, requested));\n      event.currentTarget.value = String(state.pageSize);\n      state.page = 1;\n      void loadPage({ includeTotal:true, scroll:false });`,
  `      syncDesktopSearchState();\n      state.pageSize = Math.min(MAX_LOGICAL_PAGE_SIZE, Math.max(DEFAULT_PAGE_SIZE, requested));\n      event.currentTarget.value = String(state.pageSize);\n      state.page = 1;\n      void loadPage({ includeTotal:state.q.length === 0, scroll:false });`,
  'desktop page-size/search coalescing',
);

replaceOnce(
  `  function selectDesktopForm(type, value) {\n    if (state.disabled) return;\n    state.formType = type === 'category' || type === 'form' ? type : null;\n    state.formValue = state.formType ? clean(value) : null;\n    state.page = 1;\n    syncDesktopFormButton();\n    document.getElementById('formPanel')?.classList.remove('open');\n    buildDesktopFormPanel(document.getElementById('formSearch')?.value || '');\n    void loadPage({ includeTotal:true, scroll:false });\n  }`,
  `  function selectDesktopForm(type, value) {\n    if (state.disabled) return;\n    const nextType = type === 'category' || type === 'form' ? type : null;\n    const nextValue = nextType ? clean(value) : null;\n    document.getElementById('formPanel')?.classList.remove('open');\n    if (state.formType === nextType && state.formValue === nextValue) return;\n    syncDesktopSearchState();\n    state.formType = nextType;\n    state.formValue = nextValue;\n    state.page = 1;\n    syncDesktopFormButton();\n    buildDesktopFormPanel(document.getElementById('formSearch')?.value || '');\n    void loadPage({ includeTotal:state.q.length === 0, scroll:false });\n  }`,
  'desktop form filter dedupe',
);

for (const invariant of [
  'let pageRequestEpoch = 0',
  'let countRequestEpoch = 0',
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
  if (!source.includes(invariant)) throw new Error(`Phase 17 desktop invariant missing: ${invariant}`);
}
if (source.includes('fetchLogicalPage({ includeTotal, signal:controller.signal })')) throw new Error('Desktop rows must not wait for exact count work.');
fs.writeFileSync(FILE, source, 'utf8');

let mobileSource = fs.readFileSync(MOBILE_FILE, 'utf8').replace(/\r\n?/g, '\n');
function replaceMobileOnce(before, after, label) {
  if (mobileSource.includes(after)) return;
  if (!mobileSource.includes(before)) throw new Error(`Phase 17 mobile count stability could not find ${label}.`);
  mobileSource = mobileSource.replace(before, after);
}

replaceMobileOnce(
  `  let pageController = null;\n  let detailController = null;`,
  `  let pageController = null;\n  let pageRequestEpoch = 0;\n  let countController = null;\n  let countRequestEpoch = 0;\n  let countTimer = 0;\n  let countContextOwner = '';\n  let detailController = null;`,
  'mobile request/count ownership state',
);

replaceMobileOnce(
  `function clearKnownTotal() {\n    state.total = null;\n    state.totalPages = null;\n    state.hasNext = false;\n  }`,
  `function clearKnownTotal({ resetCountOwner = true } = {}) {\n    if (resetCountOwner) {\n      window.clearTimeout(countTimer);\n      countTimer = 0;\n      countController?.abort();\n      countController = null;\n      countContextOwner = '';\n    }\n    state.total = null;\n    state.totalPages = null;\n    state.hasNext = false;\n  }`,
  'mobile count invalidation',
);

const mobileLoadAnchor = `  async function loadPage({ includeTotal = false, scroll = false } = {}) {`;
const mobileHelpers = `  function mobileCountContextKey() {\n    const url = new URL(buildPageUrl({ includeTotal:false }), window.location.origin);\n    for (const key of ['page', 'pageSize', 'sort', 'direction', 'includeTotal']) url.searchParams.delete(key);\n    return url.searchParams.toString();\n  }\n\n  function mobileExactCountUrl() {\n    const url = new URL(buildPageUrl({ includeTotal:true }), window.location.origin);\n    url.searchParams.set('page', '1');\n    url.searchParams.set('pageSize', '1');\n    return url.toString();\n  }\n\n  async function refreshMobileExactTotal(contextKey) {\n    if (state.disabled || state.q.length >= 2 || contextKey !== mobileCountContextKey()) return;\n    countController?.abort();\n    const controller = new AbortController();\n    countController = controller;\n    const requestEpoch = ++countRequestEpoch;\n    try {\n      const response = await fetch(mobileExactCountUrl(), {\n        credentials:'same-origin', cache:'default', signal:controller.signal,\n        headers:{ Accept:'application/json' },\n      });\n      if (response.status === 401) return;\n      if (!response.ok) throw new Error('Numri i barnave nuk u rifreskua (' + response.status + ').');\n      const payload = await response.json();\n      const rawTotal = payload?.pagination?.total;\n      const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal);\n      if (!Number.isFinite(total)) return;\n      if (controller.signal.aborted || countController !== controller || requestEpoch !== countRequestEpoch || contextKey !== mobileCountContextKey()) return;\n      state.total = total;\n      state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));\n      renderCount();\n      renderPagination();\n      publishRegistryAtcState();\n      window.dispatchEvent(new CustomEvent('medindex:mobile-lite-count-ready', {\n        detail:{ total, totalPages:state.totalPages, pageSize:state.pageSize, source:'supabase-exact' }\n      }));\n    } catch (error) {\n      if (error?.name !== 'AbortError' && requestEpoch === countRequestEpoch) console.warn('Mobile registry exact count refresh failed:', error);\n      if (requestEpoch === countRequestEpoch && countContextOwner === contextKey) countContextOwner = '';\n    } finally {\n      if (countController === controller) countController = null;\n    }\n  }\n\n  function scheduleMobileExactTotal() {\n    if (state.disabled || state.q.length >= 2) return;\n    const contextKey = mobileCountContextKey();\n    if (countContextOwner === contextKey) return;\n    window.clearTimeout(countTimer);\n    countTimer = 0;\n    countContextOwner = contextKey;\n    countTimer = window.setTimeout(() => {\n      countTimer = 0;\n      if (state.disabled || state.q.length >= 2 || contextKey !== mobileCountContextKey()) {\n        if (countContextOwner === contextKey) countContextOwner = '';\n        return;\n      }\n      void refreshMobileExactTotal(contextKey);\n    }, 40);\n  }\n\n${mobileLoadAnchor}`;
if (!mobileSource.includes('function mobileCountContextKey()')) {
  if (!mobileSource.includes(mobileLoadAnchor)) throw new Error('Phase 17 mobile load anchor is missing.');
  mobileSource = mobileSource.replace(mobileLoadAnchor, mobileHelpers);
}

replaceMobileOnce(
  `    pageController?.abort();\n    const controller = new AbortController();\n    pageController = controller;\n    setBusy(true);`,
  `    pageController?.abort();\n    const controller = new AbortController();\n    pageController = controller;\n    const requestEpoch = ++pageRequestEpoch;\n    if (includeTotal) clearKnownTotal({ resetCountOwner:false });\n    setBusy(true);`,
  'mobile row request epoch',
);

replaceMobileOnce(
  `      const response = await fetch(buildPageUrl({ includeTotal }), {`,
  `      const response = await fetch(buildPageUrl({ includeTotal:false }), {`,
  'mobile count-free row request',
);

replaceMobileOnce(
  `      state.page = Number(payload.pagination?.page || state.page) || state.page;`,
  `      if (requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted) return;\n      state.page = Number(payload.pagination?.page || state.page) || state.page;`,
  'mobile stale row commit gate',
);

replaceMobileOnce(
  `      renderPagination();\n      state.ready = true;`,
  `      renderPagination();\n      if (includeTotal) scheduleMobileExactTotal();\n      state.ready = true;`,
  'mobile deferred exact count',
);

replaceMobileOnce(
  `    } catch (error) {\n      if (error?.name === 'AbortError') return;\n      console.error('Mobile lightweight registry failed:', error);`,
  `    } catch (error) {\n      if (error?.name === 'AbortError' || requestEpoch !== pageRequestEpoch) return;\n      console.error('Mobile lightweight registry failed:', error);`,
  'mobile stale error guard',
);

replaceMobileOnce(
  `    search?.addEventListener('input', () => {\n      window.clearTimeout(searchTimer);\n      searchTimer = window.setTimeout(() => {\n        const nextQuery = clean(search.value).slice(0, 80);\n        if (nextQuery.length === 1) return;\n        state.q = nextQuery;`,
  `    search?.addEventListener('input', () => {\n      window.clearTimeout(searchTimer);\n      const nextQuery = clean(search.value).slice(0, 80);\n      // Invalidate the old result set immediately. Waiting for the debounce to\n      // start the next request left a window where an older response could\n      // briefly publish under the new input value.\n      pageController?.abort();\n      pageController = null;\n      clearKnownTotal();\n      if (nextQuery.length === 1) {\n        state.q = '';\n        setBusy(false);\n        return;\n      }\n      setBusy(true);\n      searchTimer = window.setTimeout(() => {\n        state.q = nextQuery;`,
  'mobile immediate search invalidation',
);

for (const invariant of [
  'let pageRequestEpoch = 0',
  'let countRequestEpoch = 0',
  "let countContextOwner = ''",
  'clearKnownTotal({ resetCountOwner:false })',
  'function mobileCountContextKey()',
  'function mobileExactCountUrl()',
  "url.searchParams.set('pageSize', '1')",
  'fetch(buildPageUrl({ includeTotal:false })',
  'requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted',
  'if (includeTotal) scheduleMobileExactTotal()',
  'contextKey !== mobileCountContextKey()',
  'medindex:mobile-lite-count-ready',
  'if (pageController === controller)',
  "pageController?.abort();\n      pageController = null;\n      clearKnownTotal();",
  "if (nextQuery.length === 1) {\n        state.q = '';\n        setBusy(false);",
]) {
  if (!mobileSource.includes(invariant)) throw new Error(`Phase 17 mobile invariant missing: ${invariant}`);
}
if (mobileSource.includes('fetch(buildPageUrl({ includeTotal })')) throw new Error('Mobile rows must not wait for exact count work.');
fs.writeFileSync(MOBILE_FILE, mobileSource, 'utf8');

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
  if (searchStart < 0 || searchEnd < 0 || searchEnd > returnStart) throw new Error('Phase 17 indexed search could not isolate registry free-text block.');
  const replacement = `  if (q.length >= 2) {\n    const pattern = \`*\${q}*\`;\n    params.set('registry_search_text', \`ilike.\${pattern}\`);\n  }`;
  apiSource = apiSource.slice(0, searchStart) + replacement + apiSource.slice(searchEnd + '\n  }'.length);
}
const finalBuilderStart = apiSource.indexOf('function buildRegistryPagePath(query = {}) {');
const finalReturnStart = apiSource.indexOf('\n  return {', finalBuilderStart);
const finalBuilder = apiSource.slice(finalBuilderStart, finalReturnStart);
if (!finalBuilder.includes("params.set('registry_search_text', `ilike.${pattern}`)")) throw new Error('Phase 17 indexed registry search predicate is missing.');
if (finalBuilder.includes("params.set('or'")) throw new Error('Registry page search regressed to multi-column OR ILIKE.');

const globalStart = apiSource.indexOf('async function neonSearchRows(rawQuery) {');
const globalEnd = globalStart >= 0 ? apiSource.indexOf('\n}\n\nfunction rankedRows', globalStart) : -1;
if (globalStart < 0 || globalEnd < 0) throw new Error('Phase 17 indexed global search could not find candidate function.');
let globalBlock = apiSource.slice(globalStart, globalEnd);
if (!globalBlock.includes("params.set('global_search_text', `ilike.*${token}*`)")) {
  const filterStart = globalBlock.indexOf("  params.set('or', `(");
  const orderStart = globalBlock.indexOf("  params.set('order', 'registry_number.asc');");
  if (filterStart < 0 || orderStart < 0 || orderStart <= filterStart) throw new Error('Phase 17 indexed global search could not isolate candidate OR filter.');
  globalBlock = globalBlock.slice(0, filterStart) + "  params.set('global_search_text', `ilike.*${token}*`);\n" + globalBlock.slice(orderStart);
  apiSource = apiSource.slice(0, globalStart) + globalBlock + apiSource.slice(globalEnd);
}
const finalGlobalStart = apiSource.indexOf('async function neonSearchRows(rawQuery) {');
const finalGlobalEnd = apiSource.indexOf('\n}\n\nfunction rankedRows', finalGlobalStart);
const finalGlobalBlock = apiSource.slice(finalGlobalStart, finalGlobalEnd);
if (!finalGlobalBlock.includes("params.set('global_search_text', `ilike.*${token}*`)")) throw new Error('Phase 17 indexed global candidate predicate is missing.');
if (finalGlobalBlock.includes("params.set('or'")) throw new Error('Global candidate search regressed to multi-column OR ILIKE.');
fs.writeFileSync(API_FILE, apiSource, 'utf8');

console.log('Phase 17 registry stability/performance passed: desktop/mobile rows never wait for exact counts, stale responses cannot commit, mobile debounce invalidates immediately, filters coalesce safely, and table/global candidate searches use trigram-indexed paths.');
