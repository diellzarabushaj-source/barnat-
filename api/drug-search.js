'use strict';

const { supabaseRequest, exactCount } = require('../lib/supabase-data-api.js');
const registryHandler = require('./registry.js');

const REGISTRY_DEFAULT_PAGE_SIZE = 25;
const REGISTRY_MAX_PAGE_SIZE = 50;
const MAX_QUERY = 160;
const MAX_RESULTS = 20;
const SEARCH_LIMIT = 20;

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

function listRow(row) { return { id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName:clean(row.trade_name), activeSubstance:clean(row.active_substance), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), strength:clean(row.strength), form:clean(row.pharmaceutical_form), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null, qualityStatus:clean(row.editorial_status || row.product_status) }; }
function detailRow(row) { const source=row?.source_payload && typeof row.source_payload==='object' ? row.source_payload : {}; return { ...listRow(row), protocolNo:clean(row.protocol_no), packaging:clean(row.packaging), marketingAuthorizationHolder:clean(row.marketing_authorization_holder), manufacturer:clean(row.manufacturer), maCertificate:clean(row.ma_certificate), wholesalePrice:row.wholesale_price ?? null, wholesaleWithMargin:row.wholesale_with_margin ?? null, vat:clean(row.vat_text), validity:clean(row.validity_text), prescriptionNotation:clean(source['Si të shënohet në recetë']), updatedAt:row.updated_at || null }; }
function searchRow(row) { const substance=clean(row.active_substance), tradeName=clean(row.trade_name), strength=clean(row.strength); return { key:[clean(row.pdid),tradeName,strength].join('|'), id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName, substance, activeSubstance:substance, strength, form:clean(row.pharmaceutical_form), packaging:clean(row.packaging), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null }; }

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

async function handler(req,res) { const startedAt=Date.now(); try { if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'Method Not Allowed'});} if(!(await authorized(req))){res.setHeader('Cache-Control','private, no-store, max-age=0');return res.status(401).json({error:'Sesioni nuk është aktiv.'});} const view=clean(requestQuery(req).view).toLowerCase(); if(view==='registry-page')return await sendPage(req,res,startedAt); if(view==='registry-detail')return await sendDetail(req,res,startedAt); return await sendSearch(req,res,startedAt); } catch(error) { console.error('Supabase drug-search error:',error); res.setHeader('Cache-Control','private, no-store, max-age=0'); res.setHeader('X-MedIndex-Data-Source','supabase'); return res.status(500).json({error:'Regjistri nuk u ngarkua.',detail:clean(error?.message).slice(0,240)}); } }

handler.buildPageRequest=buildPageRequest;
handler.buildRegistryPagePath=buildPageRequest;
handler.buildDetailPath=buildDetailPath;
handler.buildSearchPath=buildSearchPath;
handler.listRow=listRow;
handler.detailRow=detailRow;
handler.searchRow=searchRow;
handler.REGISTRY_DEFAULT_PAGE_SIZE=REGISTRY_DEFAULT_PAGE_SIZE;
handler.REGISTRY_MAX_PAGE_SIZE=REGISTRY_MAX_PAGE_SIZE;
handler.REGISTRY_DETAIL_SELECT=DETAIL_SELECT;
module.exports=handler;
