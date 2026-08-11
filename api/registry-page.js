'use strict';

const registryHandler = require('./registry.js');
const { neonRequest, exactCount } = require('../lib/neon-data-api.js');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 80;
const LIST_SELECT = [
  'id',
  'registry_number',
  'pdid',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'product_status',
  'retail_price',
].join(',');

const SORTS = Object.freeze({
  registry:'registry_number',
  name:'trade_name',
  substance:'active_substance',
  atc:'atc_code',
});

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function integerInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function searchTerm(value) {
  return clean(value)
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[^0-9A-Za-zÀ-ž%+./\- ]+/g, ' ')
    .replace(/[%*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowForList(row) {
  return {
    id:clean(row.id),
    registryNumber:row.registry_number ?? null,
    pdid:clean(row.pdid),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    productStatus:clean(row.product_status),
    retailPrice:row.retail_price ?? null,
  };
}

function buildPath(query = {}) {
  const page = integerInRange(query.page, 1, 1, 100000);
  const pageSize = integerInRange(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;
  const q = searchTerm(query.q);
  const sortKey = clean(query.sort).toLowerCase();
  const sortColumn = SORTS[sortKey] || SORTS.registry;
  const direction = clean(query.direction).toLowerCase() === 'desc' ? 'desc' : 'asc';

  const params = new URLSearchParams();
  params.set('select', LIST_SELECT);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('order', `${sortColumn}.${direction},registry_number.asc`);
  params.set('limit', String(pageSize));
  params.set('offset', String(offset));

  if (q.length >= 2) {
    const pattern = `*${q}*`;
    params.set('or', `(${[
      `trade_name.ilike.${pattern}`,
      `active_substance.ilike.${pattern}`,
      `atc_code.ilike.${pattern}`,
      `drug_class.ilike.${pattern}`,
      `use_text.ilike.${pattern}`,
    ].join(',')})`);
  }

  return {
    path:`drugs?${params.toString()}`,
    page,
    pageSize,
    q,
    sort:sortKey || 'registry',
    direction,
  };
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }

  if (!(await registryHandler.authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.' });
  }

  try {
    const request = buildPath(req.query || {});
    const { data, response } = await neonRequest(request.path, {
      prefer:'count=exact',
      timeoutMs:6000,
      label:'Registry page',
    });
    const rows = Array.isArray(data) ? data.map(rowForList) : [];
    const total = exactCount(response);
    const totalPages = Number.isFinite(total) ? Math.max(1, Math.ceil(total / request.pageSize)) : null;

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
    res.setHeader('Server-Timing', `registrypage;dur=${Date.now() - startedAt}`);
    res.setHeader('X-MedIndex-Data-Source', 'neon');
    return res.status(200).json({
      ok:true,
      rows,
      pagination:{
        page:request.page,
        pageSize:request.pageSize,
        total,
        totalPages,
        hasPrevious:request.page > 1,
        hasNext:Number.isFinite(total) ? request.page * request.pageSize < total : rows.length === request.pageSize,
      },
      query:{ q:request.q, sort:request.sort, direction:request.direction },
    });
  } catch (error) {
    console.error('Registry page error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(500).json({ error:'Lista e barnave nuk u ngarkua.' });
  }
};

module.exports.buildPath = buildPath;
module.exports.rowForList = rowForList;
module.exports.LIST_SELECT = LIST_SELECT;
module.exports.DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;
module.exports.MAX_PAGE_SIZE = MAX_PAGE_SIZE;
