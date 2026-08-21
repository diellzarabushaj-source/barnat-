'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const DETAIL_FILE = path.join(ROOT, 'registry-desktop-targeted-detail.js');
const LIST_DETAIL_DOSAGE_FILE = path.join(ROOT, 'registry-list-detail-dosage.js');
const LIST_VIEW_FILE = path.join(ROOT, 'registry-list-view.js');

const DETAIL_SRC = 'registry-desktop-targeted-detail.js?v=20260812-1';
const PRESCRIPTION_SRC = 'registry-desktop-prescription-lite.js?v=20260812-1';
const COLUMN_SRC = 'registry-desktop-column-lite.js?v=20260812-1';
const LIST_DETAIL_DOSAGE_SRC = 'registry-list-detail-dosage.js?v=20260821-1';
const ROW_PATTERN = /<script src="registry-row-expand\.js\?v=20260810-1(?:&[^"]*)?" defer><\/script>/;
const DETAIL_PATTERN = /<script src="registry-desktop-targeted-detail\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;
const PRESCRIPTION_PATTERN = /<script src="registry-desktop-prescription-lite\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;
const COLUMN_PATTERN = /<script src="registry-desktop-column-lite\.js\?v=20260812-1(?:&[^"]*)?" defer><\/script>/;
const LIST_VIEW_PATTERN = /<script src="registry-list-view\.js\?v=list-view-v1(?:&[^"]*)?" defer><\/script>/;
const LIST_DETAIL_DOSAGE_PATTERN = /<script src="registry-list-detail-dosage\.js\?v=20260821-1(?:&[^"]*)?" defer><\/script>/;

let source = fs.readFileSync(INDEX, 'utf8').replace(/\r\n?/g, '\n');

function buildQueryFrom(tag) {
  return tag.match(/&build=[^"]+/)?.[0] || '';
}

function ensureAfter(anchorPattern, targetPattern, targetSrc, missingAnchorMessage) {
  const anchorMatch = source.match(anchorPattern);
  if (!anchorMatch) throw new Error(missingAnchorMessage);

  const desired = `<script src="${targetSrc}${buildQueryFrom(anchorMatch[0])}" defer></script>`;
  const existing = source.match(targetPattern);

  if (existing) {
    if (existing[0] !== desired) source = source.replace(existing[0], desired);
    return;
  }

  source = source.replace(anchorPattern, `${anchorMatch[0]}\n${desired}`);
}

function patchTargetedDetailObserver() {
  let detail = fs.readFileSync(DETAIL_FILE, 'utf8').replace(/\r\n?/g, '\n');
  const oldObserver = `    const observer = new MutationObserver(records => {\n      let needsScan = false;\n      records.forEach(record => {\n        if (record.type === 'attributes') syncRow(record.target);\n        else if (record.type === 'childList' && record.target === tbody) needsScan = true;\n      });\n      if (needsScan) queueMicrotask(scan);\n    });\n    observer.observe(tbody, {\n      childList:true, subtree:true, attributes:true,\n      attributeFilter:['data-registry-row-expanded'],\n    });\n    scan();`;
  const leanObserver = `    const observer = new MutationObserver(records => {\n      if (records.some(record => record.type === 'childList' && record.target === tbody)) queueMicrotask(scan);\n    });\n    observer.observe(tbody, { childList:true });\n    window.addEventListener('medindex:registry-row-expanded-change', event => {\n      const row = event.detail?.row;\n      if (!row?.isConnected || row.parentElement !== tbody) return;\n      syncRow(row);\n    });\n    scan();`;

  if (!detail.includes(leanObserver)) {
    if (!detail.includes(oldObserver)) throw new Error('Phase 12 could not find the targeted-detail subtree observer contract.');
    detail = detail.replace(oldObserver, leanObserver);
  }

  if (!detail.includes("window.addEventListener('medindex:registry-row-expanded-change'")) {
    throw new Error('Phase 12 targeted detail must react to the canonical row-expanded change event.');
  }
  if (/observer\.observe\(tbody, \{[\s\S]*?subtree\s*:\s*true/.test(detail)) {
    throw new Error('Phase 12 targeted detail must not observe the entire tbody subtree.');
  }
  if (/attributeFilter:\s*\['data-registry-row-expanded'\]/.test(detail)) {
    throw new Error('Phase 12 targeted detail must not retain the old row-attribute observer.');
  }

  fs.writeFileSync(DETAIL_FILE, detail, 'utf8');
}

function patchTargetedDetailCache() {
  let detail = fs.readFileSync(DETAIL_FILE, 'utf8').replace(/\r\n?/g, '\n');

  if (!detail.includes('const DETAIL_CACHE_LIMIT = 96;')) {
    const anchor = `  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\n  const cache = new Map();`;
    const replacement = `  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\n  const DETAIL_CACHE_LIMIT = 96;\n  const cache = new Map();`;
    if (!detail.includes(anchor)) throw new Error('Phase 12 could not find targeted-detail cache constant anchor.');
    detail = detail.replace(anchor, replacement);
  }

  if (!detail.includes('function readDetailCache(id)')) {
    const anchor = `  function loadDetail(id) {`;
    const helpers = `  function readDetailCache(id) {\n    if (!cache.has(id)) return null;\n    const payload = cache.get(id);\n    cache.delete(id);\n    cache.set(id, payload);\n    return payload;\n  }\n\n  function rememberDetail(id, payload) {\n    cache.delete(id);\n    cache.set(id, payload);\n    while (cache.size > DETAIL_CACHE_LIMIT) {\n      const oldestId = cache.keys().next().value;\n      if (!oldestId) break;\n      cache.delete(oldestId);\n    }\n    return payload;\n  }\n\n${anchor}`;
    if (!detail.includes(anchor)) throw new Error('Phase 12 could not find targeted-detail loadDetail anchor.');
    detail = detail.replace(anchor, helpers);
  }

  detail = detail.replace(
    `    if (cache.has(id)) return Promise.resolve(cache.get(id));`,
    `    const cached = readDetailCache(id);\n    if (cached) return Promise.resolve(cached);`,
  );
  detail = detail.replace(`      cache.set(id, payload);`, `      rememberDetail(id, payload);`);
  detail = detail.replace(
    `    if (cache.has(id)) {\n      renderDetail(row, cache.get(id));\n      return true;\n    }`,
    `    const cached = readDetailCache(id);\n    if (cached) {\n      renderDetail(row, cached);\n      return true;\n    }`,
  );

  if (!detail.includes('const DETAIL_CACHE_LIMIT = 96;')) throw new Error('Phase 12 detail cache limit is missing.');
  if (!detail.includes('while (cache.size > DETAIL_CACHE_LIMIT)')) throw new Error('Phase 12 detail cache eviction is missing.');
  if (!detail.includes('const cached = readDetailCache(id);')) throw new Error('Phase 12 detail cache must refresh recency on reads.');
  if (detail.includes('cache.set(id, payload);') && !detail.includes('function rememberDetail(id, payload)')) {
    throw new Error('Phase 12 unbounded detail cache write remains.');
  }

  fs.writeFileSync(DETAIL_FILE, detail, 'utf8');
}

function validateListDetailDosage() {
  if (!fs.existsSync(LIST_DETAIL_DOSAGE_FILE)) {
    throw new Error('Phase 12 list-detail dosage runtime is missing.');
  }
  const runtime = fs.readFileSync(LIST_DETAIL_DOSAGE_FILE, 'utf8').replace(/\r\n?/g, '\n');
  for (const required of [
    "const API = '/api/dosage';",
    "API + '?view=card&id='",
    "const cache = new Map();",
    'const requests = new WeakMap();',
    'new AbortController()',
    'requestIsCurrent(detail, token)',
    "label.textContent = 'Dozimi';",
    "'Duke ngarkuar dozimin…'",
    "'Dozimi nuk është i disponueshëm ende.'",
    "'Dozimi nuk u ngarkua.'",
    "regimenGroup('Të rriturit'",
    "regimenGroup('Pediatrik'",
    "clean(node.textContent) === 'Si të shënohet në recetë'",
    'detail.dataset.rlvDosageDrugId !== id',
  ]) {
    if (!runtime.includes(required)) throw new Error(`Phase 12 list-detail dosage contract missing: ${required}`);
  }
  if (/medindex:request-full-registry|\/api\/registry(?:\?|['"`])|source_payload|DRUG_DATA_PARTS|view=cards&nr=/.test(runtime)) {
    throw new Error('Phase 12 list-detail dosage must stay exact-ID targeted and must never request the full registry or use ambiguous registry-number fallback.');
  }
  if (!runtime.includes('while (cache.size > CACHE_LIMIT)')) {
    throw new Error('Phase 12 list-detail dosage cache must remain bounded.');
  }
  if (!runtime.includes('const candidates = [row?.__neonDrugId, row?.drugId, row?.id];')) {
    throw new Error('Phase 12 list-detail dosage must resolve an exact UUID from the registry row.');
  }
  if (!runtime.includes('window.MedIndexRegistryListView?.rowAt?.(index)')) {
    throw new Error('Phase 12 list-detail dosage must read the opened row from the list that owns the dataset.');
  }
  if (!runtime.includes('window.MEDINDEX_REGISTRY_LIST_ROWS')) {
    throw new Error('Phase 12 list-detail dosage must fall back to the List dataset, never to a paged table window alone.');
  }

  const listView = fs.readFileSync(LIST_VIEW_FILE, 'utf8').replace(/\r\n?/g, '\n');
  if (!/rowAt\(uid\) \{[\s\S]*?buildIndex\(\)\[index\]/.test(listView)) {
    throw new Error('Phase 12 requires the list view to publish the row behind a data-rlv-open position.');
  }
}

ensureAfter(
  ROW_PATTERN,
  DETAIL_PATTERN,
  DETAIL_SRC,
  'Phase 12 wiring could not find registry-row-expand.js anchor.',
);
ensureAfter(
  DETAIL_PATTERN,
  PRESCRIPTION_PATTERN,
  PRESCRIPTION_SRC,
  'Phase 13 wiring could not find targeted-detail anchor.',
);
ensureAfter(
  PRESCRIPTION_PATTERN,
  COLUMN_PATTERN,
  COLUMN_SRC,
  'Phase 14 wiring could not find prescription-lite anchor.',
);
ensureAfter(
  LIST_VIEW_PATTERN,
  LIST_DETAIL_DOSAGE_PATTERN,
  LIST_DETAIL_DOSAGE_SRC,
  'Phase 12 list-detail dosage wiring could not find registry-list-view.js anchor.',
);

const rowIndex = source.search(ROW_PATTERN);
const detailIndex = source.search(DETAIL_PATTERN);
const prescriptionIndex = source.search(PRESCRIPTION_PATTERN);
const columnIndex = source.search(COLUMN_PATTERN);
const listViewIndex = source.search(LIST_VIEW_PATTERN);
const listDosageIndex = source.search(LIST_DETAIL_DOSAGE_PATTERN);
if (rowIndex < 0 || detailIndex <= rowIndex) throw new Error('Phase 12 targeted detail must load after the existing row expander.');
if (prescriptionIndex <= detailIndex) throw new Error('Phase 13 prescription bridge must load after targeted detail.');
if (columnIndex <= prescriptionIndex) throw new Error('Phase 14 column-lite runtime must load after prescription bridge.');
if (listViewIndex < 0 || listDosageIndex <= listViewIndex) throw new Error('Phase 12 list-detail dosage must load after registry list view.');

patchTargetedDetailObserver();
patchTargetedDetailCache();
validateListDetailDosage();
fs.writeFileSync(INDEX, source, 'utf8');
require('./patch-phase13-prescription-lite.js');
require('./patch-phase14-column-lite.js');

console.log('Phase 12-14 targeted details stay bounded and event-driven; list-view drug details lazy-load exact-ID adult/pediatric dosage, fail closed on missing identity, and never touch the registry critical path.');
