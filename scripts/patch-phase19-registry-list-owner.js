'use strict';

/* Phase 19 — Registry List ownership + data-only handoff.
 *
 * Phase 1 closes the visual race with a head-loaded CSS fail-safe and a tiny
 * ownership guard.
 *
 * Phase 2 removes the cause: List no longer asks the desktop owner to wake the
 * full table runtime just to obtain every drug. Instead it emits a dedicated
 * list-dataset event. A bounded data bridge reads published Neon rows in pages,
 * preserves exact UUID identity, and publishes them only to the List namespace
 * (`MEDINDEX_REGISTRY_LIST_ROWS`). The desktop table keeps its own paged rows.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const CSS_FILE = path.join(ROOT, 'registry-table-tools.css');
const JS_FILE = path.join(ROOT, 'registry-list-owner-guard.js');
const DATA_FILE = path.join(ROOT, 'registry-list-data-bridge.js');
const LIST_VIEW_FILE = path.join(ROOT, 'registry-list-view.js');
const API_FILE = path.join(ROOT, 'api', 'drug-search.js');
const OWNER_VERSION = 'list-owner-v1';
const DATA_VERSION = 'list-data-v1';

const OWNER_TAG = `<script src="registry-list-owner-guard.js?v=${OWNER_VERSION}" defer data-registry-list-owner-guard></script>`;
const DATA_TAG = `<script src="registry-list-data-bridge.js?v=${DATA_VERSION}" defer data-registry-list-data-bridge></script>`;

for (const file of [INDEX, CSS_FILE, JS_FILE, DATA_FILE, LIST_VIEW_FILE, API_FILE]) {
  if (!fs.existsSync(file)) throw new Error(`Registry list Phase 19: mungon ${path.basename(file)}.`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Registry list Phase 19: nuk u gjet ${label}.`);
  return source.replace(before, after);
}

function patchListView() {
  let source = fs.readFileSync(LIST_VIEW_FILE, 'utf8').replace(/\r\n?/g, '\n');

  source = replaceOnce(
    source,
    `  const sourceRows = () => (Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : []);`,
    `  const sourceRows = () => {\n    const shared = Array.isArray(window.MEDINDEX_REGISTRY_ROWS) ? window.MEDINDEX_REGISTRY_ROWS : [];\n    if (ROOT.dataset.miRegistryView !== 'list') return shared;\n    if (window.MEDINDEX_REGISTRY_LIST_READY === true && Array.isArray(window.MEDINDEX_REGISTRY_LIST_ROWS)) {\n      return window.MEDINDEX_REGISTRY_LIST_ROWS;\n    }\n    // A paged desktop window is not the register. While the dedicated List\n    // dataset is loading, show a loading state instead of presenting 50 rows as\n    // if they were the complete registry.\n    return window.MEDINDEX_REGISTRY_PARTIAL ? [] : shared;\n  };`,
    'List-specific dataset source',
  );

  const oldRequest = `      if (window.MEDINDEX_REGISTRY_PARTIAL) {\n        window.dispatchEvent(new CustomEvent('medindex:registry-full-dataset-needed', {\n          detail:{ reason:'registry-list-view' },\n        }));\n      }`;
  const newRequest = `      if (window.MEDINDEX_REGISTRY_PARTIAL && window.MEDINDEX_REGISTRY_LIST_READY !== true) {\n        // Legacy contract intentionally retired for List: medindex:registry-full-dataset-needed.\n        // List data is not permission to activate the full table UI.\n        window.dispatchEvent(new CustomEvent('medindex:registry-list-dataset-needed', {\n          detail:{ reason:'registry-list-view' },\n        }));\n      }`;
  source = replaceOnce(source, oldRequest, newRequest, 'data-only List request');

  source = replaceOnce(
    source,
    `    ['medindex:registry-rendered', 'medindex:registry-page-ready', 'medindex:registry-ready']`,
    `    ['medindex:registry-rendered', 'medindex:registry-page-ready', 'medindex:registry-ready',\n      'medindex:registry-list-dataset-ready', 'medindex:registry-list-dataset-error']`,
    'List dataset ready/error render events',
  );

  if (!source.includes("medindex:registry-list-dataset-needed")) {
    throw new Error('Registry list Phase 19: List nuk kërkon dataset-in e dedikuar.');
  }
  if (/dispatchEvent\(new CustomEvent\('medindex:registry-full-dataset-needed'/.test(source)) {
    throw new Error('Registry list Phase 19: List ende mund të zgjojë full-table runtime.');
  }
  if (!source.includes('MEDINDEX_REGISTRY_LIST_ROWS') || !source.includes('MEDINDEX_REGISTRY_LIST_READY')) {
    throw new Error('Registry list Phase 19: List nuk është ndarë nga dataset-i i tabelës.');
  }

  fs.writeFileSync(LIST_VIEW_FILE, source, 'utf8');
}

function patchBrowseApi() {
  let source = fs.readFileSync(API_FILE, 'utf8').replace(/\r\n?/g, '\n');

  source = replaceOnce(
    source,
    `const REGISTRY_MAX_PAGE_SIZE = 50;\nconst REGISTRY_MAX_QUERY_LENGTH = 80;`,
    `const REGISTRY_MAX_PAGE_SIZE = 50;\nconst REGISTRY_BROWSE_DEFAULT_PAGE_SIZE = 400;\nconst REGISTRY_BROWSE_MAX_PAGE_SIZE = 500;\nconst REGISTRY_MAX_QUERY_LENGTH = 80;`,
    'bounded browse page constants',
  );

  if (!source.includes('function rowForRegistryBrowse(row)')) {
    const anchor = `function buildRegistryDetailPath(query = {}) {`;
    const block = `function rowForRegistryBrowse(row) {\n  return {\n    ...rowForRegistryDetail(row),\n    prescriptionNotation:registryPrescriptionNotation(row),\n  };\n}\n\nfunction buildRegistryBrowsePagePath(query = {}) {\n  const page = integerInRange(query.page, 1, 1, 100000);\n  const pageSize = integerInRange(\n    query.pageSize,\n    REGISTRY_BROWSE_DEFAULT_PAGE_SIZE,\n    1,\n    REGISTRY_BROWSE_MAX_PAGE_SIZE,\n  );\n  const includeTotal = ['1', 'true', 'yes'].includes(clean(query.includeTotal).toLowerCase());\n  const offset = (page - 1) * pageSize;\n  const params = new URLSearchParams();\n  params.set('select', REGISTRY_DETAIL_SELECT);\n  params.set('is_published', 'eq.true');\n  params.set('editorial_status', 'eq.published');\n  params.set('order', 'registry_number.asc');\n  params.set('limit', String(pageSize));\n  params.set('offset', String(offset));\n  return {\n    path:\`drugs?\${params.toString()}\`,\n    page,\n    pageSize,\n    includeTotal,\n  };\n}\n\n${anchor}`;
    if (!source.includes(anchor)) throw new Error('Registry list Phase 19: API detail anchor mungon.');
    source = source.replace(anchor, block);
  }

  if (!source.includes('async function sendRegistryBrowsePage')) {
    const anchor = `async function sendRegistryDetail(req, res, startedAt) {`;
    const block = `async function sendRegistryBrowsePage(req, res, startedAt) {\n  const request = buildRegistryBrowsePagePath(req.query || {});\n  const { data, response } = await neonRequest(request.path, {\n    ...(request.includeTotal ? { prefer:'count=exact' } : {}),\n    timeoutMs:7000,\n    label:'Registry browse page',\n  });\n  const rows = (Array.isArray(data) ? data : []).map(rowForRegistryBrowse);\n  const total = request.includeTotal ? exactCount(response) : null;\n  const hasNext = Number.isFinite(total)\n    ? request.page * request.pageSize < total\n    : rows.length === request.pageSize;\n\n  res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=180');\n  res.setHeader('Server-Timing', \`registrybrowse;dur=\${Date.now() - startedAt}\`);\n  res.setHeader('X-MedIndex-Data-Source', 'neon');\n  return res.status(200).json({\n    ok:true,\n    rows,\n    pagination:{\n      page:request.page,\n      pageSize:request.pageSize,\n      total,\n      totalPages:Number.isFinite(total) ? Math.max(1, Math.ceil(total / request.pageSize)) : null,\n      hasPrevious:request.page > 1,\n      hasNext,\n    },\n  });\n}\n\n${anchor}`;
    if (!source.includes(anchor)) throw new Error('Registry list Phase 19: API send-detail anchor mungon.');
    source = source.replace(anchor, block);
  }

  if (!source.includes("view === 'registry-browse-page'")) {
    const anchor = `  if (view === 'registry-detail') {`;
    const block = `  if (view === 'registry-browse-page') {\n    try { return await sendRegistryBrowsePage(req, res, startedAt); }\n    catch (error) {\n      console.error('Registry browse page error:', error);\n      res.setHeader('Cache-Control', 'private, no-store, max-age=0');\n      return res.status(500).json({ error:'Dataset-i i listës së barnave nuk u ngarkua.' });\n    }\n  }\n  ${anchor.trimStart()}`;
    if (!source.includes(anchor)) throw new Error('Registry list Phase 19: API registry-detail route anchor mungon.');
    source = source.replace(anchor, block);
  }

  if (!source.includes('module.exports.buildRegistryBrowsePagePath')) {
    const anchor = `module.exports.buildRegistryDetailPath = buildRegistryDetailPath;`;
    const block = `${anchor}\nmodule.exports.buildRegistryBrowsePagePath = buildRegistryBrowsePagePath;\nmodule.exports.rowForRegistryBrowse = rowForRegistryBrowse;`;
    if (!source.includes(anchor)) throw new Error('Registry list Phase 19: API export anchor mungon.');
    source = source.replace(anchor, block);
  }

  for (const invariant of [
    "REGISTRY_BROWSE_MAX_PAGE_SIZE = 500",
    "params.set('select', REGISTRY_DETAIL_SELECT)",
    "view === 'registry-browse-page'",
    "prefer:'count=exact'",
    'rowForRegistryBrowse',
    'prescriptionNotation:registryPrescriptionNotation(row)',
  ]) {
    if (!source.includes(invariant)) throw new Error(`Registry list Phase 19 API invariant mungon: ${invariant}`);
  }
  if (/registry-browse-page[\s\S]{0,1600}params\.set\('select', '\*'\)/.test(source)) {
    throw new Error('Registry list Phase 19: browse endpoint nuk guxon të përdorë SELECT *.');
  }

  fs.writeFileSync(API_FILE, source, 'utf8');
}

function wireAssets() {
  let html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

  // Idempotent: remove any prior Phase 19 tags/versions before inserting the
  // canonical set. Repeated build:runtime runs therefore remain deterministic.
  html = html
    .replace(/^.*data-registry-list-owner-guard-css.*\n?/gm, '')
    .replace(/^.*data-registry-list-owner-guard(?:>|\s).*\n?/gm, '')
    .replace(/^.*data-registry-list-data-bridge.*\n?/gm, '');

  const registryCssLinks = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(registry-[^"]+\.css[^"]*)"[^>]*>/g)]
    .map(match => match[1]);
  if (registryCssLinks.length !== 1 || !registryCssLinks[0].startsWith('registry-table-tools.css')) {
    throw new Error(`Registry list Phase 19: pritet vetëm registry-table-tools.css; u gjetën ${registryCssLinks.join(', ') || 'asnjë'}.`);
  }

  const jsAnchor = html.match(/^.*registry-list-view\.js[^\n]*\n/m);
  if (!jsAnchor) throw new Error('Registry list Phase 19: nuk u gjet registry-list-view.js.');
  html = html.replace(jsAnchor[0], `${DATA_TAG}\n${jsAnchor[0]}${OWNER_TAG}\n`);

  fs.writeFileSync(INDEX, html, 'utf8');
}

patchListView();
patchBrowseApi();
wireAssets();

// Build-time contract audit. If data and UI ownership accidentally collapse
// back together, fail the build instead of shipping the race again.
const written = fs.readFileSync(INDEX, 'utf8');
const css = fs.readFileSync(CSS_FILE, 'utf8');
const owner = fs.readFileSync(JS_FILE, 'utf8');
const data = fs.readFileSync(DATA_FILE, 'utf8');
const listView = fs.readFileSync(LIST_VIEW_FILE, 'utf8');
const api = fs.readFileSync(API_FILE, 'utf8');
const count = (source, needle) => source.split(needle).length - 1;

if (count(written, 'data-registry-list-owner-guard-css') !== 0) {
  throw new Error('Registry list Phase 19: CSS guard nuk guxon të rikthehet si stylesheet i veçantë.');
}
const registryCssLinks = [...written.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="(registry-[^"]+\.css[^"]*)"[^>]*>/g)]
  .map(match => match[1]);
if (registryCssLinks.length !== 1 || !registryCssLinks[0].startsWith('registry-table-tools.css')) {
  throw new Error('Registry list Phase 19: duhet të mbetet vetëm një registry CSS authority.');
}
if (count(written, 'data-registry-list-owner-guard></script>') !== 1) {
  throw new Error('Registry list Phase 19: owner guard duhet të ngarkohet saktësisht një herë.');
}
if (count(written, 'data-registry-list-data-bridge') !== 1) {
  throw new Error('Registry list Phase 19: data bridge duhet të ngarkohet saktësisht një herë.');
}
if (!css.includes('consolidated from registry-list-owner-guard.css')) {
  throw new Error('Registry list Phase 19: list-owner guard duhet të jetë materializuar brenda CSS-it final.');
}
if (written.indexOf('registry-list-data-bridge.js') > written.indexOf('registry-list-view.js')) {
  throw new Error('Registry list Phase 19: data bridge duhet të ekzekutohet para List view.');
}
if (written.indexOf('registry-list-owner-guard.js') < written.indexOf('registry-list-view.js')) {
  throw new Error('Registry list Phase 19: owner guard duhet të vijë pas List view.');
}
if (!/data-mi-registry-view="list"[\s\S]*#registryViewToolbar/.test(css)
    || !/display:\s*none\s*!important/.test(css)) {
  throw new Error('Registry list Phase 19: CSS nuk garanton fshehjen e table toolbar në List mode.');
}
if (/#registryFilterPanel[\s\S]{0,160}display:\s*none\s*!important/.test(css)) {
  throw new Error('Registry list Phase 19: shared search/filter panel nuk guxon të fshihet.');
}
if (!owner.includes("attributeFilter:['data-mi-registry-view']")
    || !owner.includes("document.getElementById('registryViewToolbar')")
    || !owner.includes('ROOT.dataset.registrySurfaceOwner')) {
  throw new Error('Registry list Phase 19: runtime ownership contract është i paplotë.');
}
for (const invariant of [
  "const API = '/api/drug-search'",
  "view:'registry-browse-page'",
  'const PAGE_SIZE = 400',
  'const CONCURRENCY = 3',
  'MEDINDEX_REGISTRY_LIST_ROWS',
  'MEDINDEX_REGISTRY_LIST_READY',
  'medindex:registry-list-dataset-ready',
  'validateRows(rawRows, total)',
  '__neonDrugId:clean(row?.id)',
]) {
  if (!data.includes(invariant)) throw new Error(`Registry list Phase 19 data invariant mungon: ${invariant}`);
}
if (data.includes('medindex:request-full-registry') || data.includes('/api/registry?')) {
  throw new Error('Registry list Phase 19: data bridge nuk guxon të zgjojë full runtime ose legacy full-registry endpoint.');
}
if (!listView.includes("medindex:registry-list-dataset-needed")
    || !listView.includes('MEDINDEX_REGISTRY_LIST_ROWS')) {
  throw new Error('Registry list Phase 19: List view nuk përdor dataset-in e dedikuar.');
}
if (/dispatchEvent\(new CustomEvent\('medindex:registry-full-dataset-needed'/.test(listView)) {
  throw new Error('Registry list Phase 19: List view ende emeton handoff-in e full table.');
}
if (!api.includes("view === 'registry-browse-page'") || !api.includes('REGISTRY_BROWSE_MAX_PAGE_SIZE = 500')) {
  throw new Error('Registry list Phase 19: bounded browse API mungon.');
}

for (const file of [DATA_FILE, LIST_VIEW_FILE, API_FILE, JS_FILE]) {
  execFileSync(process.execPath, ['--check', file], { cwd:ROOT, stdio:'pipe' });
}

console.log('Registry list Phase 1-2: single visible owner + bounded data-only List dataset handoff u instaluan dhe u audituan.');
