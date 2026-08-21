'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'phase14-column-lite-v1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n?/g, '\n');
const write = (file, value) => fs.writeFileSync(path.join(ROOT, file), value.replace(/\r\n?/g, '\n'), 'utf8');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Phase 14 column-lite patch could not find ${label}.`);
  return source.replace(before, after);
}

function patchApi() {
  let source = read('api/drug-search.js');
  if (source.includes(`REGISTRY_COLUMN_LITE_RUNTIME = '${MARKER}'`)) return;

  const detailAnchor = 'const REGISTRY_DETAIL_SELECT = [';
  const optional = `const REGISTRY_COLUMN_LITE_RUNTIME = '${MARKER}';
const REGISTRY_COLUMN_FIELD_MAP = Object.freeze({
  protocol:'protocol_no',
  packaging:'packaging',
  mah:'marketing_authorization_holder',
  manufacturer:'manufacturer',
  'ma-certificate':'ma_certificate',
  status:'product_status',
  'wholesale-price':'wholesale_price',
  'margin-price':'wholesale_with_margin',
  vat:'vat_text',
  retail:'retail_price',
  validity:'validity_text',
});
const REGISTRY_COLUMN_BATCH_MAX_IDS = 50;
const REGISTRY_COLUMN_BATCH_MAX_FIELDS = 12;

${detailAnchor}`;
  source = replaceOnce(source, detailAnchor, optional, 'column field whitelist');

  source = replaceOnce(
    source,
    `  price:'retail_price',\n});`,
    `  price:'retail_price',\n  class:'drug_class',\n  use:'use_text',\n  pdid:'pdid',\n  protocol:'protocol_no',\n  packaging:'packaging',\n  mah:'marketing_authorization_holder',\n  manufacturer:'manufacturer',\n  certificate:'ma_certificate',\n  wholesale:'wholesale_price',\n  margin:'wholesale_with_margin',\n  vat:'vat_text',\n  validity:'validity_text',\n});`,
    'advanced server sort whitelist',
  );

  // Status and retail price are hidden by default in the lightweight table.
  // Keep their filter/sort columns available to PostgREST, but do not transfer
  // them on every list page. The visible-column batch hydrates them only when
  // the physician explicitly turns those columns on.
  source = replaceOnce(
    source,
    `  'packaging',\n  'product_status',\n  'retail_price',\n].join(',');`,
    `  'packaging',\n].join(',');`,
    'slim initial registry projection',
  );
  source = replaceOnce(
    source,
    `    form:clean(row.pharmaceutical_form),\n    prescriptionNotation:registryPrescriptionNotation(row),\n    productStatus:clean(row.product_status),\n    retailPrice:row.retail_price ?? null,\n  };`,
    `    form:clean(row.pharmaceutical_form),\n    prescriptionNotation:registryPrescriptionNotation(row),\n  };`,
    'slim initial registry row',
  );

  const helperAnchor = 'function rowForRegistryList(row) {';
  const helpers = `function registryColumnKeys(value) {
  const seen = new Set();
  return clean(value).split(',').map(item => item.trim()).filter(Boolean).filter(key => {
    if (!Object.prototype.hasOwnProperty.call(REGISTRY_COLUMN_FIELD_MAP, key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, REGISTRY_COLUMN_BATCH_MAX_FIELDS);
}

function registryColumnIds(value) {
  const seen = new Set();
  return clean(value).split(',').map(item => item.trim().toLowerCase()).filter(id => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, REGISTRY_COLUMN_BATCH_MAX_IDS);
}

function buildRegistryColumnsPath(query = {}) {
  const ids = registryColumnIds(query.ids);
  const columns = registryColumnKeys(query.columns);
  if (!ids.length || !columns.length) return null;
  const fields = columns.map(key => REGISTRY_COLUMN_FIELD_MAP[key]);
  const params = new URLSearchParams();
  params.set('select', ['id', ...fields].join(','));
  params.set('id', 'in.(' + ids.join(',') + ')');
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('limit', String(ids.length));
  return { path:'drugs?' + params.toString(), ids, columns };
}

function rowForRegistryColumns(row, columns) {
  const values = {};
  columns.forEach(key => {
    const field = REGISTRY_COLUMN_FIELD_MAP[key];
    const value = row?.[field];
    values[key] = value == null ? null : value;
  });
  return { id:clean(row?.id), values };
}

${helperAnchor}`;
  source = replaceOnce(source, helperAnchor, helpers, 'column batch helpers');

  const sendDetailAnchor = 'async function sendRegistryDetail(req, res, startedAt) {';
  const sender = `async function sendRegistryColumns(req, res, startedAt) {
  const request = buildRegistryColumnsPath(req.query || {});
  if (!request) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(400).json({ error:'Mungojnë barnat ose kolonat e vlefshme.' });
  }
  const { data } = await neonRequest(request.path, {
    timeoutMs:5000,
    label:'Registry visible columns',
  });
  const rows = (Array.isArray(data) ? data : []).map(row => rowForRegistryColumns(row, request.columns));
  res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  res.setHeader('Server-Timing', 'registrycolumns;dur=' + (Date.now() - startedAt));
  res.setHeader('X-MedIndex-Data-Source', 'neon');
  return res.status(200).json({ ok:true, rows, columns:request.columns });
}

${sendDetailAnchor}`;
  source = replaceOnce(source, sendDetailAnchor, sender, 'column batch sender');

  const detailDispatch = `  if (view === 'registry-detail') {`;
  const columnDispatch = `  if (view === 'registry-columns') {
    try { return await sendRegistryColumns(req, res, startedAt); }
    catch (error) {
      console.error('Registry columns error:', error);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(500).json({ error:'Kolonat e barnave nuk u ngarkuan.' });
    }
  }
${detailDispatch}`;
  source = replaceOnce(source, detailDispatch, columnDispatch, 'column batch route');

  const exportAnchor = 'module.exports.buildRegistryDetailPath = buildRegistryDetailPath;';
  source = replaceOnce(
    source,
    exportAnchor,
    `${exportAnchor}\nmodule.exports.buildRegistryColumnsPath = buildRegistryColumnsPath;\nmodule.exports.rowForRegistryColumns = rowForRegistryColumns;`,
    'column batch exports',
  );

  const listProjection = source.match(/const REGISTRY_LIST_SELECT = \[([\s\S]*?)\]\.join\(','\);/)?.[1] || '';
  const listMapper = source.match(/function rowForRegistryList\(row\) \{([\s\S]*?)\n\}/)?.[1] || '';
  if (!source.includes(`REGISTRY_COLUMN_LITE_RUNTIME = '${MARKER}'`)) throw new Error('Phase 14 API marker missing.');
  if (!source.includes("view === 'registry-columns'")) throw new Error('Phase 14 registry-columns route missing.');
  if (!source.includes("status:'product_status'") || !source.includes("retail:'retail_price'")) {
    throw new Error('Phase 14 hidden status/retail hydration map is missing.');
  }
  if (/product_status|retail_price/.test(listProjection)) {
    throw new Error('Phase 14 initial registry projection must not transfer hidden status/retail fields.');
  }
  if (/productStatus|retailPrice/.test(listMapper)) {
    throw new Error('Phase 14 initial registry rows must not serialize hidden status/retail fields.');
  }
  if (/source_payload/.test(source.match(/function buildRegistryColumnsPath[\s\S]*?function rowForRegistryColumns/)?.[0] || '')) {
    throw new Error('Phase 14 column batch must not read source_payload.');
  }
  write('api/drug-search.js', source);
}

function patchDesktopLite() {
  let source = read('registry-desktop-lite.js');
  if (source.includes(`const DESKTOP_COLUMN_LITE_RUNTIME = '${MARKER}';`)) return;

  source = replaceOnce(
    source,
    `  const HANDOFF_TIMEOUT_MS = 45000;`,
    `  const HANDOFF_TIMEOUT_MS = 45000;\n  const DESKTOP_COLUMN_LITE_RUNTIME = '${MARKER}';`,
    'desktop column-lite marker',
  );

  source = source.replace("      ['colPickerBtn', 'column-picker'],\n", '');

  const publicAnchor = '  window.MEDINDEX_DESKTOP_LITE = {';
  const sortApi = `  function sortByColumn(sortKey) {
    if (state.disabled || state.loading) return Promise.resolve(false);
    const next = clean(sortKey).toLowerCase();
    if (!next) return Promise.resolve(false);
    if (state.sort === next) state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    else { state.sort = next; state.direction = 'asc'; }
    state.page = 1;
    return loadPage({ includeTotal:false, scroll:false }).then(() => true);
  }

${publicAnchor}`;
  source = replaceOnce(source, publicAnchor, sortApi, 'desktop sort API');
  source = replaceOnce(
    source,
    `    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    handoff:requestFullRegistry,`,
    `    reload:() => loadPage({ includeTotal:true, scroll:false }),\n    sortBy:sortByColumn,\n    handoff:requestFullRegistry,`,
    'desktop column-lite public sort export',
  );

  if (source.includes("['colPickerBtn', 'column-picker']")) throw new Error('Phase 14 column picker still triggers full-registry handoff.');
  if (!source.includes('sortBy:sortByColumn')) throw new Error('Phase 14 desktop sort API missing.');
  write('registry-desktop-lite.js', source);
}

function patchColumnRuntime() {
  let source = read('registry-desktop-column-lite.js');
  source = replaceOnce(
    source,
    "    { key:'status', label:'Statusi', raw:'Statusi', sort:'status', default:false },",
    "    { key:'status', label:'Statusi', remote:'status', sort:'status', default:false },",
    'remote status column',
  );
  source = replaceOnce(
    source,
    "    { key:'retail-price', label:'Çmimi me pakicë', raw:'Çmimi me pakicë', sort:'price', default:false, cls:'price', price:true },",
    "    { key:'retail-price', label:'Çmimi me pakicë', remote:'retail', sort:'price', default:false, cls:'price', price:true },",
    'remote retail-price column',
  );
  if (!source.includes("key:'status', label:'Statusi', remote:'status'")) throw new Error('Phase 14 remote status runtime is missing.');
  if (!source.includes("key:'retail-price', label:'Çmimi me pakicë', remote:'retail'")) throw new Error('Phase 14 remote retail runtime is missing.');
  write('registry-desktop-column-lite.js', source);
}

patchApi();
patchDesktopLite();
patchColumnRuntime();
console.log('Phase 14 visible-column batches keep hidden status/retail off the initial registry payload and hydrate them only on demand.');
