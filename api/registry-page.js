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
const DETAIL_SELECT = [
  'id',
  'registry_number',
  'pdid',
  'protocol_no',
  'trade_name',
  'active_substance',
  'atc_code',
  'drug_class',
  'use_text',
  'strength',
  'pharmaceutical_form',
  'packaging',
  'marketing_authorization_holder',
  'manufacturer',
  'ma_certificate',
  'product_status',
  'wholesale_price',
  'wholesale_with_margin',
  'vat_text',
  'retail_price',
  'validity_text',
  'updated_at',
].join(',');

const SORTS = Object.freeze({
  registry:'registry_number',
  name:'trade_name',
  substance:'active_substance',
  atc:'atc_code',
  strength:'strength',
  form:'pharmaceutical_form',
  status:'product_status',
  price:'retail_price',
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

function exactFilter(value, maximum = 120) {
  return clean(value)
    .slice(0, maximum)
    .replace(/[,*()]/g, '')
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

function rowForDetail(row) {
  return {
    id:clean(row.id),
    registryNumber:row.registry_number ?? null,
    pdid:clean(row.pdid),
    protocolNo:clean(row.protocol_no),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    packaging:clean(row.packaging),
    marketingAuthorizationHolder:clean(row.marketing_authorization_holder),
    manufacturer:clean(row.manufacturer),
    maCertificate:clean(row.ma_certificate),
    productStatus:clean(row.product_status),
    wholesalePrice:row.wholesale_price ?? null,
    wholesaleWithMargin:row.wholesale_with_margin ?? null,
    vat:clean(row.vat_text),
    retailPrice:row.retail_price ?? null,
    validity:clean(row.validity_text),
    updatedAt:row.updated_at || null,
  };
}

function buildDetailPath(query = {}) {
  const id = exactFilter(query.id, 160);
  if (!id) return null;
  const params = new URLSearchParams();
  params.set('select', DETAIL_SELECT);
  params.set('id', `eq.${id}`);
  params.set('is_published', 'eq.true');
  params.set('editorial_status', 'eq.published');
  params.set('limit', '1');
  return `drugs?${params.toString()}`;
}

function buildPath(query = {}) {
  const page = integerInRange(query.page, 1, 1, 100000);
  const pageSize = integerInRange(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;
  const q = searchTerm(query.q);
  const status = exactFilter(query.status);
  const form = exactFilter(query.form);
  const formQuery = searchTerm(query.formQuery);
  const atc = exactFilter(query.atc, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  if (status) params.set('product_status', `eq.${status}`);
  if (form) params.set('pharmaceutical_form', `eq.${form}`);
  else if (formQuery) params.set('pharmaceutical_form', `ilike.*${formQuery}*`);
  if (atc) params.set('atc_code', `ilike.${atc}*`);

  if (q.length >= 2) {
    const pattern = `*${q}*`;
    params.set('or', `(${[
      `trade_name.ilike.${pattern}`,
      `active_substance.ilike.${pattern}`,
      `atc_code.ilike.${pattern}`,
      `drug_class.ilike.${pattern}`,
      `use_text.ilike.${pattern}`,
      `strength.ilike.${pattern}`,
      `pharmaceutical_form.ilike.${pattern}`,
      `pdid.ilike.${pattern}`,
      `protocol_no.ilike.${pattern}`,
    ].join(',')})`);
  }

  return {
    path:`drugs?${params.toString()}`,
    page,
    pageSize,
    q,
    status,
    form,
    formQuery,
    atc,
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
    const view = clean(req.query?.view).toLowerCase();
    if (view === 'detail') {
      const detailPath = buildDetailPath(req.query || {});
      if (!detailPath) {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        return res.status(400).json({ error:'Mungon identifikuesi i barit.' });
      }
      const { data } = await neonRequest(detailPath, {
        timeoutMs:5000,
        label:'Registry detail',
      });
      const row = Array.isArray(data) && data.length ? rowForDetail(data[0]) : null;
      res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
      res.setHeader('Server-Timing', `registrydetail;dur=${Date.now() - startedAt}`);
      res.setHeader('X-MedIndex-Data-Source', 'neon');
      return row
        ? res.status(200).json({ ok:true, row })
        : res.status(404).json({ error:'Bari nuk u gjet.' });
    }

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
      query:{
        q:request.q,
        status:request.status,
        form:request.form,
        formQuery:request.formQuery,
        atc:request.atc,
        sort:request.sort,
        direction:request.direction,
      },
    });
  } catch (error) {
    console.error('Registry page error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(500).json({ error:'Lista e barnave nuk u ngarkua.' });
  }
};

module.exports.buildPath = buildPath;
module.exports.buildDetailPath = buildDetailPath;
module.exports.rowForList = rowForList;
module.exports.rowForDetail = rowForDetail;
module.exports.LIST_SELECT = LIST_SELECT;
module.exports.DETAIL_SELECT = DETAIL_SELECT;
module.exports.DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;
module.exports.MAX_PAGE_SIZE = MAX_PAGE_SIZE;
