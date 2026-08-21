'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'registry-desktop-lite.js');
const API_FILE = path.join(ROOT, 'api', 'drug-search.js');
let source = fs.readFileSync(FILE, 'utf8').replace(/\r\n?/g, '\n');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Phase 17 desktop filter stability could not find ${label}.`);
  source = source.replace(before, after);
}

replaceOnce(
  `  let pageController = null;\n  let searchTimer = 0;`,
  `  let pageController = null;\n  let pageRequestEpoch = 0;\n  let searchTimer = 0;`,
  'request epoch state',
);

replaceOnce(
  `    const controller = new AbortController();\n    pageController = controller;\n    setBusy(true);\n    try {\n      const logical = await fetchLogicalPage({ includeTotal, signal:controller.signal });\n      state.hasNext = Number.isFinite(logical.total)`,
  `    const controller = new AbortController();\n    pageController = controller;\n    const requestEpoch = ++pageRequestEpoch;\n    setBusy(true);\n    try {\n      const logical = await fetchLogicalPage({ includeTotal, signal:controller.signal });\n      // AbortController is the first line of defence. The epoch is the final\n      // commit gate: even if an older response has already crossed the network\n      // abort boundary, it cannot publish rows or pagination after a newer\n      // filter/page request owns the table.\n      if (requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted) return;\n      state.hasNext = Number.isFinite(logical.total)`,
  'late-response commit gate',
);

replaceOnce(
  `    } catch (error) {\n      if (error?.name === 'AbortError') return;\n      console.error('Desktop lightweight registry failed:', error);`,
  `    } catch (error) {\n      if (error?.name === 'AbortError' || requestEpoch !== pageRequestEpoch) return;\n      console.error('Desktop lightweight registry failed:', error);`,
  'stale error guard',
);

const controlsAnchor = `  function configureControls() {`;
const searchSyncHelper = `  function syncDesktopSearchState() {\n    window.clearTimeout(searchTimer);\n    searchTimer = 0;\n    const search = document.getElementById('search');\n    const raw = clean(search?.value || '').slice(0, 80);\n    // Registry search intentionally starts at two characters. A one-character\n    // input must never leave state.q pointing at an older multi-character term.\n    state.q = raw.length >= 2 ? raw : '';\n    state.total = null;\n    state.totalPages = null;\n    return state.q;\n  }\n\n${controlsAnchor}`;
if (!source.includes('function syncDesktopSearchState()')) {
  if (!source.includes(controlsAnchor)) throw new Error('Phase 17 could not find control setup anchor.');
  source = source.replace(controlsAnchor, searchSyncHelper);
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
  'const requestEpoch = ++pageRequestEpoch',
  'requestEpoch !== pageRequestEpoch || pageController !== controller || controller.signal.aborted',
  'function syncDesktopSearchState()',
  'includeTotal:state.q.length === 0',
  'if (state.formType === nextType && state.formValue === nextValue) return',
]) {
  if (!source.includes(invariant)) throw new Error(`Phase 17 invariant missing: ${invariant}`);
}

fs.writeFileSync(FILE, source, 'utf8');

// The registry table previously expressed free-text search as an OR across nine
// ILIKE clauses. PostgreSQL therefore performed a sequential scan even though a
// full-text index existed, because that index does not accelerate substring
// ILIKE. The Supabase migration adds a generated registry_search_text column
// backed by a partial pg_trgm GIN index. Keep the table query on that one indexed
// predicate while leaving the separate ranked/global search path unchanged.
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
fs.writeFileSync(API_FILE, apiSource, 'utf8');

console.log('Phase 17 desktop table stability passed: stale responses cannot commit, pending search is coalesced into filters, repeated form selections do not refetch, and table search uses the indexed registry text path.');
