'use strict';

const { supabaseRequest, exactCount } = require('../lib/supabase-data-api.js');
const registryHandler = require('./registry.js');
const RegistryRevision = require('../lib/registry-revision.js');

const REGISTRY_DEFAULT_PAGE_SIZE = 25;
const REGISTRY_MAX_PAGE_SIZE = 50;
const MAX_QUERY = 160;
const MAX_RESULTS = 20;
const SEARCH_LIMIT = 20;
const ATC_COUNTS_PAGE_SIZE = 250;
const ATC_COUNTS_MAX_ROWS = 6000;
const ATC_COUNTS_CACHE_TTL_MS = 30 * 60 * 1000;
const ATC_COUNTS_REVISION_CHECK_MS = 60 * 1000;
// phase6-atc-counts-neon-v2 is retained only as a compatibility marker.
// The bounded ATC projection below is served by Supabase.
const ATC_COUNTS_RUNTIME = 'phase6-atc-counts-neon-v2';
let atcCountsCache = null;
let atcCountsRevisionCheckedAt = 0;

const LIST_SELECT = [
  'id','registry_number','pdid','trade_name','active_substance','atc_code','drug_class','use_text',
  'strength','pharmaceutical_form','product_status','retail_price','editorial_status'
].join(',');

const DETAIL_SELECT = [
  'id','registry_number','pdid','protocol_no','trade_name','active_substance','atc_code','drug_class','use_text',
  'strength','pharmaceutical_form','packaging','marketing_authorization_holder','manufacturer','ma_certificate',
  'product_status','wholesale_price','wholesale_with_margin','vat_text','retail_price','validity_text','updated_at','source_payload'
].join(',');

const SEARCH_SELECT = [
  'id','registry_number','pdid','trade_name','active_substance','atc_code','drug_class','use_text',
  'strength','pharmaceutical_form','packaging','product_status','retail_price','editorial_status'
].join(',');

const SORTS = Object.freeze({ registry:'registry_number', name:'trade_name', substance:'active_substance', atc:'atc_code', strength:'strength', form:'pharmaceutical_form', status:'product_status', price:'retail_price' });
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function requestQuery(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req?.url || '/api/drug-search', 'https://drx.local').searchParams); }
  catch { return {}; }
}
function integerInRange(value, fallback, min, max) { const parsed=Number.parseInt(String(value ?? ''),10); return Number.isFinite(parsed) ? Math.min(max,Math.max(min,parsed)) : fallback; }
function safeFilterText(value,max=MAX_QUERY) { return clean(value).slice(0,max).replace(/[,*%()\\]/g,' ').replace(/\s+/g,' ').trim(); }
function safeQueryText(value) { return clean(value).slice(0, MAX_QUERY).replace(/[,*%()\\]/g,' ').replace(/\s+/g,' ').trim(); }
async function authorized(req) { return registryHandler.authorized(req); }

function atcCategoryCode(value) {
  const code = clean(value).toUpperCase().replace(/\s+/g, '');
  const match = code.match(/^([A-Z]\d{2})/);
  return match ? match[1] : '';
}

function countAtcRows(rows = []) {
  const counts = Object.create(null);
  const groupCounts = Object.create(null);
  let classifiedTotal = 0;
  let unclassifiedTotal = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = atcCategoryCode(row?.['ATC Code'] ?? row?.atc_code ?? row?.atc);
    if (!category) {
      unclassifiedTotal += 1;
      continue;
    }
    counts[category] = (counts[category] || 0) + 1;
    const group = category.charAt(0);
    groupCounts[group] = (groupCounts[group] || 0) + 1;
    classifiedTotal += 1;
  }
  return {
    total:classifiedTotal + unclassifiedTotal,
    classifiedTotal,
    unclassifiedTotal,
    counts,
    groupCounts,
  };
}

async function fetchAtcCountRowsFromSupabase() {
  const rows = [];
  for (let offset = 0; offset < ATC_COUNTS_MAX_ROWS; offset += ATC_COUNTS_PAGE_SIZE) {
    const params = new URLSearchParams();
    params.set('select', 'registry_number,atc_code');
    params.set('is_published', 'eq.true');
    params.set('editorial_status', 'eq.published');
    params.set('order', 'registry_number.asc');
    params.set('limit', String(ATC_COUNTS_PAGE_SIZE));
    params.set('offset', String(offset));
    const { data } = await supabaseRequest(`drugs?${params.toString()}`, {
      timeoutMs:5000,
      label:'Supabase ATC count projection',
    });
    if (!Array.isArray(data)) throw new Error('Supabase ATC projection did not return a list.');
    rows.push(...data);
    if (data.length < ATC_COUNTS_PAGE_SIZE) return rows;
  }
  throw new Error(`ATC projection exceeded the hard cap of ${ATC_COUNTS_MAX_ROWS} rows.`);
}

// Legacy exported name kept for callers/tests; transport is Supabase.
async function fetchAtcCountRowsFromNeon() {
  return fetchAtcCountRowsFromSupabase();
}

async function currentAtcRegistryRevision() {
  return clean(await RegistryRevision.getRegistryRevision({ maxAgeMs:ATC_COUNTS_REVISION_CHECK_MS }));
}

async function supabaseAtcCounts() {
  const now = Date.now();
  if (atcCountsCache?.value && atcCountsCache.expiresAt > now) {
    if (now - atcCountsRevisionCheckedAt < ATC_COUNTS_REVISION_CHECK_MS) {
      return { ...atcCountsCache.value, cacheState:'fresh' };
    }
    try {
      const revision = await currentAtcRegistryRevision();
      atcCountsRevisionCheckedAt = Date.now();
      if (revision && revision === atcCountsCache.value.registryVersion) {
        return { ...atcCountsCache.value, cacheState:'revision-hit' };
      }
    } catch {
      atcCountsRevisionCheckedAt = Date.now();
      return { ...atcCountsCache.value, source:'memory-stale-atc', cacheState:'stale' };
    }
  }

  try {
    let registryVersion = '';
    try { registryVersion = await currentAtcRegistryRevision(); }
    catch { registryVersion = ''; }
    const rows = await fetchAtcCountRowsFromSupabase();
    const summary = countAtcRows(rows);
    const value = {
      ...summary,
      registryVersion,
      generatedAt:new Date().toISOString(),
      source:'supabase-bounded-atc',
    };
    atcCountsCache = { value, expiresAt:Date.now() + ATC_COUNTS_CACHE_TTL_MS };
    atcCountsRevisionCheckedAt = Date.now();
    return { ...value, cacheState:'fresh' };
  } catch (error) {
    if (atcCountsCache?.value) {
      return { ...atcCountsCache.value, source:'memory-stale-atc', cacheState:'stale' };
    }
    throw error;
  }
}

// Legacy function name retained as a compatibility alias.
async function neonAtcCounts() {
  return supabaseAtcCounts();
}

function listRow(row) { return { id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName:clean(row.trade_name), activeSubstance:clean(row.active_substance), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), strength:clean(row.strength), form:clean(row.pharmaceutical_form), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null, qualityStatus:clean(row.editorial_status || row.product_status) }; }
function detailRow(row) { const source=row?.source_payload && typeof row.source_payload==='object' ? row.source_payload : {}; return { ...listRow(row), protocolNo:clean(row.protocol_no), packaging:clean(row.packaging), marketingAuthorizationHolder:clean(row.marketing_authorization_holder), manufacturer:clean(row.manufacturer), maCertificate:clean(row.ma_certificate), wholesalePrice:row.wholesale_price ?? null, wholesaleWithMargin:row.wholesale_with_margin ?? null, vat:clean(row.vat_text), validity:clean(row.validity_text), prescriptionNotation:clean(source['Si të shënohet në recetë']), updatedAt:row.updated_at || null }; }
function searchRow(row) { const substance=clean(row.active_substance), tradeName=clean(row.trade_name), strength=clean(row.strength); return { key:[clean(row.pdid),tradeName,strength].join('|'), id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName, substance, activeSubstance:substance, strength, form:clean(row.pharmaceutical_form), packaging:clean(row.packaging), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null, packagingSummary:clean(row.packaging), prescriptionLine:'', dispense:'', qualityStatus:clean(row.editorial_status || row.product_status) }; }

function buildPageRequest(query={}) {
  const page=integerInRange(query.page,1,1,100000), pageSize=integerInRange(query.pageSize,REGISTRY_DEFAULT_PAGE_SIZE,1,REGISTRY_MAX_PAGE_SIZE);
  const q=safeQueryText(query.q), status=safeFilterText(query.status,80), form=safeFilterText(query.form,120), sortKey=clean(query.sort).toLowerCase();
  const sortColumn=SORTS[sortKey] || SORTS.registry, direction=clean(query.direction).toLowerCase()==='desc'?'desc':'asc', includeTotal=['1','true','yes'].includes(clean(query.includeTotal).toLowerCase()), offset=(page-1)*pageSize;
  const params=new URLSearchParams();
  params.set('select',LIST_SELECT); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('order',`${sortColumn}.${direction}.nullslast,registry_number.asc`); params.set('limit',String(pageSize)); params.set('offset',String(offset));
  if(q.length>=2) params.set('registry_search_text',`ilike.*${q}*`);
  if(status) params.set('product_status',`eq.${status}`);
  if(form) params.set('pharmaceutical_form',`ilike.*${form}*`);
  return {path:`drugs?${params.toString()}`,page,pageSize,q,status,form,sort:sortKey||'registry',direction,includeTotal};
}
function buildDetailPath(query={}) { const id=safeFilterText(query.id,80); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null; const params=new URLSearchParams(); params.set('select',DETAIL_SELECT); params.set('id',`eq.${id}`); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('limit','1'); return `drugs?${params.toString()}`; }
function buildSearchPath(value) { const q=safeQueryText(value); if(q.length<2) return null; const params=new URLSearchParams(); params.set('select',SEARCH_SELECT); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('global_search_text',`ilike.*${q}*`); params.set('order','trade_name.asc.nullslast,registry_number.asc'); params.set('limit',String(SEARCH_LIMIT)); return {path:`drugs?${params.toString()}`,q}; }
function setHeaders(res,startedAt,timing) { res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','private, max-age=30, stale-while-revalidate=120'); res.setHeader('Vary','Cookie'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-MedIndex-Data-Source','supabase'); res.setHeader('Server-Timing',`${timing};dur=${Date.now()-startedAt}`); }

async function sendPage(req,res,startedAt) { const request=buildPageRequest(requestQuery(req)); const {data,response}=await supabaseRequest(request.path,{timeoutMs:6500,label:'Supabase registry page',...(request.includeTotal?{prefer:'count=exact'}:{})}); const rows=Array.isArray(data)?data.map(listRow):[]; const total=request.includeTotal?exactCount(response):null; const totalPages=Number.isFinite(total)?Math.max(1,Math.ceil(total/request.pageSize)):null; setHeaders(res,startedAt,'supabase-registry-page'); if(req.method==='HEAD')return res.status(200).end(); return res.status(200).json({ok:true,rows,pagination:{page:request.page,pageSize:request.pageSize,total,totalPages,hasPrevious:request.page>1,hasNext:Number.isFinite(total)?request.page*request.pageSize<total:rows.length===request.pageSize},query:{q:request.q,status:request.status,form:request.form,sort:request.sort,direction:request.direction,includeTotal:request.includeTotal},meta:{source:'supabase'}}); }
async function sendDetail(req,res,startedAt) { const path=buildDetailPath(requestQuery(req)); if(!path)return res.status(400).json({error:'ID e barit është e pavlefshme.'}); const {data}=await supabaseRequest(path,{timeoutMs:5000,label:'Supabase registry detail'}); const row=Array.isArray(data)&&data.length?detailRow(data[0]):null; setHeaders(res,startedAt,'supabase-registry-detail'); if(req.method==='HEAD')return res.status(row?200:404).end(); return row?res.status(200).json({ok:true,row,meta:{source:'supabase'}}):res.status(404).json({error:'Bari nuk u gjet.'}); }
async function sendSearch(req,res,startedAt) { const request=buildSearchPath(requestQuery(req).q); setHeaders(res,startedAt,'supabase-drug-search'); if(!request)return req.method==='HEAD'?res.status(200).end():res.status(200).json({ok:true,query:'',results:[],meta:{source:'supabase'}}); const {data}=await supabaseRequest(request.path,{timeoutMs:5000,label:'Supabase drug search'}); const results=Array.isArray(data)?data.map(searchRow):[]; if(req.method==='HEAD')return res.status(200).end(); return res.status(200).json({ok:true,query:request.q,results,meta:{source:'supabase'}}); }

async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (!['GET','HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ error:'Method Not Allowed' });
    }
    if (!(await registryHandler.authorized(req))) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
    }

    const view = clean(requestQuery(req).view).toLowerCase();
    if (view === 'atc-counts') {
      try {
        const summary = await neonAtcCounts();
        res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
        res.setHeader('Server-Timing', `atccounts;dur=${Date.now() - startedAt}`);
        res.setHeader('X-MedIndex-Data-Source', summary.source || 'supabase-bounded-atc');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).json({ ok:true, ...summary });
      } catch (error) {
        console.error('ATC counts error:', error);
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Retry-After', '30');
        return res.status(503).json({ error:'Numërimet e kategorive nuk u ngarkuan.' });
      }
    }

    const rawQuery = clean(requestQuery(req).q);
    if (view === 'registry-page') return await sendPage(req, res, startedAt);
    if (view === 'registry-detail') return await sendDetail(req, res, startedAt);
    return await sendSearch({ ...req, query:{ ...(req.query || {}), q:rawQuery } }, res, startedAt);
  } catch (error) {
    console.error('Supabase drug-search error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-MedIndex-Data-Source', 'supabase');
    return res.status(500).json({ error:'Regjistri nuk u ngarkua.', detail:clean(error?.message).slice(0,240) });
  }
}

handler.buildPageRequest=buildPageRequest;
handler.buildRegistryPagePath=buildPageRequest;
handler.buildDetailPath=buildDetailPath;
handler.buildSearchPath=buildSearchPath;
handler.listRow=listRow;
handler.detailRow=detailRow;
handler.searchRow=searchRow;
handler.REGISTRY_DEFAULT_PAGE_SIZE=REGISTRY_DEFAULT_PAGE_SIZE;
handler.REGISTRY_MAX_PAGE_SIZE=REGISTRY_MAX_PAGE_SIZE;
handler.atcCategoryCode = atcCategoryCode;
handler.countAtcRows = countAtcRows;
handler.fetchAtcCountRowsFromNeon = fetchAtcCountRowsFromNeon;
handler.neonAtcCounts = neonAtcCounts;
handler.ATC_COUNTS_PAGE_SIZE = ATC_COUNTS_PAGE_SIZE;
handler.ATC_COUNTS_MAX_ROWS = ATC_COUNTS_MAX_ROWS;
handler.ATC_COUNTS_CACHE_TTL_MS = ATC_COUNTS_CACHE_TTL_MS;
handler.ATC_COUNTS_REVISION_CHECK_MS = ATC_COUNTS_REVISION_CHECK_MS;
handler.REGISTRY_DETAIL_SELECT=DETAIL_SELECT;
module.exports=handler;
module.exports.atcCategoryCode = atcCategoryCode;
module.exports.countAtcRows = countAtcRows;
module.exports.fetchAtcCountRowsFromNeon = fetchAtcCountRowsFromNeon;
module.exports.neonAtcCounts = neonAtcCounts;
module.exports.ATC_COUNTS_PAGE_SIZE = ATC_COUNTS_PAGE_SIZE;
module.exports.ATC_COUNTS_MAX_ROWS = ATC_COUNTS_MAX_ROWS;
module.exports.ATC_COUNTS_CACHE_TTL_MS = ATC_COUNTS_CACHE_TTL_MS;
module.exports.ATC_COUNTS_REVISION_CHECK_MS = ATC_COUNTS_REVISION_CHECK_MS;
