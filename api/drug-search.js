'use strict';

const { supabaseRequest, exactCount } = require('../lib/supabase-data-api.js');
const registryHandler = require('./registry.js');
const RegistryRevision = require('../lib/registry-revision.js');

const REGISTRY_DEFAULT_PAGE_SIZE = 25;
const REGISTRY_MAX_PAGE_SIZE = 50;
const MAX_QUERY = 160;
const MAX_RESULTS = 20;
const SEARCH_LIMIT = 20;
const SEARCH_MAX_LIMIT = 50;
const PERSONAL_LOOKUP_LIMIT = 50;
const ATC_COUNTS_VIEW = 'medindex_atc_counts_v1';
const ATC_COUNTS_ROW_LIMIT = 500;
const ATC_COUNTS_CACHE_TTL_MS = 30 * 60 * 1000;
const ATC_COUNTS_REVISION_CHECK_MS = 60 * 1000;
// Phase 2: one shallow aggregate read replaces paged full-registry ATC projection reads.
const ATC_COUNTS_RUNTIME = 'phase2-shallow-atc-counts-v1';
let atcCountsCache = null;
let atcCountsRevisionCheckedAt = 0;

const LIST_SELECT = [
  'id','registry_number','pdid','trade_name','active_substance','atc_code','drug_class','use_text','approved_population',
  'strength','pharmaceutical_form','product_status','retail_price','editorial_status'
].join(',');

const DETAIL_SELECT = [
  'id','registry_number','pdid','protocol_no','trade_name','active_substance','atc_code','drug_class','use_text','approved_population',
  'strength','pharmaceutical_form','packaging','marketing_authorization_holder','manufacturer','ma_certificate',
  'product_status','wholesale_price','wholesale_with_margin','vat_text','retail_price','validity_text','updated_at',
  'audit_date','audit_note','pediatric_dose_summary','pediatric_indication','pediatric_use_status',
  'pediatric_min_age_value','pediatric_min_age_unit','pediatric_max_age_value','pediatric_max_age_unit',
  'pediatric_min_weight_kg','pediatric_max_weight_kg','pediatric_dose_min','pediatric_dose_max','pediatric_dose_unit',
  'pediatric_dose_basis','pediatric_doses_per_day','pediatric_interval_hours','pediatric_max_single_value',
  'pediatric_max_single_unit','pediatric_max_daily_value','pediatric_max_daily_unit','pediatric_route',
  'pediatric_restriction','pediatric_concentration_value','pediatric_concentration_unit',
  'pediatric_concentration_per_value','pediatric_concentration_per_unit','pediatric_source_url',
  'pediatric_source_section','pediatric_verification_status','pediatric_verified_at','pediatric_primary_regimen_id',
  'pediatric_max_doses_per_day','pediatric_min_interval_hours','source_payload'
].join(',');

const SORTS = Object.freeze({ registry:'registry_number', name:'trade_name', substance:'active_substance', class:'drug_class', use:'use_text', population:'approved_population', atc:'atc_code', strength:'strength', form:'pharmaceutical_form', status:'product_status', price:'retail_price' });

const FORM_CATEGORIES = Object.freeze({
  'Tableta & pilula':['Chewable tablet','Coated tablet','Compressed lozenge','Dispersible tablet','Effervescent tablet','Film coated tablet','Gastro-resistant coated tablet','Gastro-resistant tablet','Lozenge','Modified-release film-coated tablet','Modified-release tablet','Orodispersible tablet','Pastille','Prolonged-release tablet','Soluble tablet','Sublingual tablet','Tablet'],
  'Kapsula':['Capsule','Capsule, hard','Capsule, soft','Gastro-resistant capsule','Gastro-resistant capsule, hard','Inhalation powder, hard capsule','Modified release capsule, hard','Prolonged release capsule, hard','Prolonged-release capsule','Vaginal capsule','Vaginal capsule, soft'],
  'Shurupe & solucione orale':['Granules for oral solution','Granules for oral suspension','Granules for syrup','Oral drops','Oral drops, solution','Oral drops, suspension','Oral emulsion','Oral gel','Oral jelly','Oral lyophilisate','Oral powder','Oral solution','Oral suspension','Powder for oral solution','Powder for oral suspension','Syrup'],
  'Injeksione & Infuzione':['Ampoule','Concentrate for solution for infusion','Concentrate for solution for injection','Concentrate for solution for injection/infusion','Emulsion for infusion','Emulsion for injection/infusion','Injection','Lyophilisate for solution for infusion','Lyophilisate for solution for injection','Lyophilisate for suspension for injection','Powder and solvent for solution for infusion','Powder and solvent for solution for injection','Powder and solvent for solution for injection/infusion','Powder and solvent for suspension for injection','Powder for concentrate for solution for infusion','Powder for injection','Powder for solution for infusion','Powder for solution for injection','Powder for solution for injection or infusion','Powder for suspension for injection','Solution for infusion','Solution for infusion and oral solution','Solution for injection','Solution for injection/infusion','Suspension for injection'],
  'Kremra, xhel & pomada':['Cream','Cutaneous emulsion','Cutaneous liquid','Cutaneous paste','Cutaneous powder','Cutaneous solution','Gel','Nasal ointment','Ointment'],
  'Pika (sy, veshë, hundë)':['Ear drops, emulsion','Ear drops, solution','Ear/eye drops, solution','Eye drops','Eye drops, solution','Eye drops, suspension','Eye gel','Eye ointment','Nasal drops, solution'],
  'Sprej & Inhalim':['Cutaneous spray','Cutaneous spray, solution','Inhalation powder','Inhalation vapour, liquid','Inhalation vapour, solution','Medicinal gas, compressed','Medicinal gas, liquefied','Nasal spray','Nasal spray, solution','Nasal spray, suspension','Nebuliser solution','Nebuliser suspension','Oral solution/concentrate for nebuliser solution','Oromucosal spray','Powder for nebuliser solution','Pressurised inhalation, solution','Pressurised inhalation, suspension','Sublingual spray'],
  'Pluhur & granula':['Effervescent granules','Effervescent powder','Granules','Oromucosal gel','Oromucosal solution'],
  'Supozitorë & forma vaginale':['Endocervical gel','Pessary','Rectal cream','Rectal ointment','Rectal solution','Rectal suspension','Suppository','Vaginal cream','Vaginal gel','Vaginal solution','Vaginal tablet'],
  'Forma të tjera speciale':['Applicator','Bladder irrigation','Dental solution','Gargle','Gargle/mouth wash','Implant','Impregnated dressing','Intraarticular use','Medicated chewing-gum','Medicated nail laquer','Mouth wash','Shampoo','Solution for peritonel dialysis','Solvent for parenteral use','Transdermal patch'],
});
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function safeExactForm(value) { return clean(value).slice(0,140).replace(/[\u0000-\u001f\u007f]/g,''); }
function postgrestQuoted(value) { return JSON.stringify(safeExactForm(value)); }

function requestQuery(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req?.url || '/api/drug-search', 'https://drx.local').searchParams); }
  catch { return {}; }
}
function integerInRange(value, fallback, min, max) { const parsed=Number.parseInt(String(value ?? ''),10); return Number.isFinite(parsed) ? Math.min(max,Math.max(min,parsed)) : fallback; }
function safeFilterText(value,max=MAX_QUERY) { return clean(value).slice(0,max).replace(/[,*%()\\]/g,' ').replace(/\s+/g,' ').trim(); }
function safeQueryText(value) { return clean(value).slice(0, MAX_QUERY).replace(/[,*%()\\]/g,' ').replace(/\s+/g,' ').trim(); }
function safeAtcPrefix(value) { const code=clean(value).toUpperCase().replace(/\s+/g,''); return /^(?:[A-Z]|[A-Z]\d{2}(?:[A-Z]{1,2})?)$/.test(code) ? code : ''; }
function safeUuidList(value) { const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; return [...new Set(clean(value).split(',').map(item=>item.trim()).filter(item=>UUID.test(item)))].slice(0,PERSONAL_LOOKUP_LIMIT); }
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

function countAtcAggregateRows(rows = []) {
  const counts = Object.create(null);
  const groupCounts = Object.create(null);
  let classifiedTotal = 0;
  let unclassifiedTotal = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = clean(row?.category_code).toUpperCase();
    const count = Number(row?.product_count);
    if (!Number.isFinite(count) || count < 0) continue;
    if (category === 'UNCLASSIFIED') {
      unclassifiedTotal += count;
      continue;
    }
    if (!/^[A-Z]\d{2}$/.test(category)) continue;
    counts[category] = (counts[category] || 0) + count;
    const group = category.charAt(0);
    groupCounts[group] = (groupCounts[group] || 0) + count;
    classifiedTotal += count;
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
  const params = new URLSearchParams();
  params.set('select', 'category_code,product_count');
  params.set('order', 'category_code.asc');
  params.set('limit', String(ATC_COUNTS_ROW_LIMIT));
  const { data } = await supabaseRequest(`${ATC_COUNTS_VIEW}?${params.toString()}`, {
    timeoutMs:5000,
    label:'Supabase shallow ATC counts',
  });
  if (!Array.isArray(data)) throw new Error('Supabase ATC counts did not return a list.');
  if (data.length >= ATC_COUNTS_ROW_LIMIT) {
    throw new Error(`ATC aggregate exceeded the hard cap of ${ATC_COUNTS_ROW_LIMIT} rows.`);
  }
  return data;
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
    const summary = countAtcAggregateRows(rows);
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

function listRow(row) { return { id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName:clean(row.trade_name), activeSubstance:clean(row.active_substance), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), approvedPopulation:clean(row.approved_population), strength:clean(row.strength), form:clean(row.pharmaceutical_form), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null, qualityStatus:clean(row.editorial_status || row.product_status) }; }
function sourceFields(value) {
  const source=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  return Object.entries(source).flatMap(([label,raw]) => {
    const key=clean(label);
    if(!key || raw===null || raw===undefined) return [];
    const entry=typeof raw==='object' ? clean(JSON.stringify(raw)) : clean(raw);
    return entry ? [{ label:key, value:entry }] : [];
  });
}
function detailRow(row) {
  const source=row?.source_payload && typeof row.source_payload==='object' ? row.source_payload : {};
  return {
    ...listRow(row),
    protocolNo:clean(row.protocol_no),
    packaging:clean(row.packaging),
    marketingAuthorizationHolder:clean(row.marketing_authorization_holder),
    manufacturer:clean(row.manufacturer),
    maCertificate:clean(row.ma_certificate),
    wholesalePrice:row.wholesale_price ?? null,
    wholesaleWithMargin:row.wholesale_with_margin ?? null,
    vat:clean(row.vat_text),
    validity:clean(row.validity_text),
    auditDate:row.audit_date || null,
    auditNote:clean(row.audit_note),
    pediatricDoseSummary:clean(row.pediatric_dose_summary),
    pediatricIndication:clean(row.pediatric_indication),
    pediatricUseStatus:clean(row.pediatric_use_status),
    pediatricMinAgeValue:row.pediatric_min_age_value ?? null,
    pediatricMinAgeUnit:clean(row.pediatric_min_age_unit),
    pediatricMaxAgeValue:row.pediatric_max_age_value ?? null,
    pediatricMaxAgeUnit:clean(row.pediatric_max_age_unit),
    pediatricMinWeightKg:row.pediatric_min_weight_kg ?? null,
    pediatricMaxWeightKg:row.pediatric_max_weight_kg ?? null,
    pediatricDoseMin:row.pediatric_dose_min ?? null,
    pediatricDoseMax:row.pediatric_dose_max ?? null,
    pediatricDoseUnit:clean(row.pediatric_dose_unit),
    pediatricDoseBasis:clean(row.pediatric_dose_basis),
    pediatricDosesPerDay:row.pediatric_doses_per_day ?? null,
    pediatricIntervalHours:row.pediatric_interval_hours ?? null,
    pediatricMaxSingleValue:row.pediatric_max_single_value ?? null,
    pediatricMaxSingleUnit:clean(row.pediatric_max_single_unit),
    pediatricMaxDailyValue:row.pediatric_max_daily_value ?? null,
    pediatricMaxDailyUnit:clean(row.pediatric_max_daily_unit),
    pediatricRoute:clean(row.pediatric_route),
    pediatricRestriction:clean(row.pediatric_restriction),
    pediatricConcentrationValue:row.pediatric_concentration_value ?? null,
    pediatricConcentrationUnit:clean(row.pediatric_concentration_unit),
    pediatricConcentrationPerValue:row.pediatric_concentration_per_value ?? null,
    pediatricConcentrationPerUnit:clean(row.pediatric_concentration_per_unit),
    pediatricSourceUrl:clean(row.pediatric_source_url),
    pediatricSourceSection:clean(row.pediatric_source_section),
    pediatricVerificationStatus:clean(row.pediatric_verification_status),
    pediatricVerifiedAt:row.pediatric_verified_at || null,
    pediatricPrimaryRegimenId:clean(row.pediatric_primary_regimen_id),
    pediatricMaxDosesPerDay:row.pediatric_max_doses_per_day ?? null,
    pediatricMinIntervalHours:row.pediatric_min_interval_hours ?? null,
    prescriptionNotation:clean(source['Si të shënohet në recetë']),
    sourceFields:sourceFields(source),
    updatedAt:row.updated_at || null,
  };
}
function searchRow(row) { const substance=clean(row.active_substance), tradeName=clean(row.trade_name), strength=clean(row.strength); return { key:[clean(row.pdid),tradeName,strength].join('|'), id:clean(row.id), registryNumber:row.registry_number ?? null, pdid:clean(row.pdid), tradeName, substance, activeSubstance:substance, strength, form:clean(row.pharmaceutical_form), packaging:clean(row.packaging), atc:clean(row.atc_code), drugClass:clean(row.drug_class), use:clean(row.use_text), approvedPopulation:clean(row.approved_population), productStatus:clean(row.product_status), retailPrice:row.retail_price ?? null, packagingSummary:clean(row.packaging), prescriptionLine:'', dispense:'', qualityStatus:clean(row.editorial_status || row.product_status), matchRank:Number.isFinite(Number(row.match_rank)) ? Number(row.match_rank) : null, matchReason:clean(row.match_reason) }; }

function buildPageRequest(query={}) {
  const page=integerInRange(query.page,1,1,100000), pageSize=integerInRange(query.pageSize,REGISTRY_DEFAULT_PAGE_SIZE,1,REGISTRY_MAX_PAGE_SIZE);
  const q=safeQueryText(query.q), status=safeFilterText(query.status,80), atc=safeAtcPrefix(query.atc), form=safeFilterText(query.form,120), formExact=safeExactForm(query.formExact), formCategory=safeExactForm(query.formCategory), sortKey=clean(query.sort).toLowerCase();
  const sortColumn=SORTS[sortKey] || SORTS.registry, direction=clean(query.direction).toLowerCase()==='desc'?'desc':'asc', includeTotal=['1','true','yes'].includes(clean(query.includeTotal).toLowerCase()), offset=(page-1)*pageSize;
  const params=new URLSearchParams();
  params.set('select',LIST_SELECT); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('order',`${sortColumn}.${direction}.nullslast,registry_number.asc`); params.set('limit',String(pageSize)); params.set('offset',String(offset));
  if(q.length>=2) params.set('registry_search_text',`ilike.*${q}*`);
  if(status) params.set('product_status',`eq.${status}`);
  if(atc) params.set('atc_code',`ilike.${atc}*`);
  const categoryForms=FORM_CATEGORIES[formCategory] || [];
  if(formExact) params.set('pharmaceutical_form',`eq.${formExact}`);
  else if(categoryForms.length) params.set('pharmaceutical_form',`in.(${categoryForms.map(postgrestQuoted).join(',')})`);
  else if(form) params.set('pharmaceutical_form',`ilike.*${form}*`);
  return {path:`drugs?${params.toString()}`,page,pageSize,q,status,atc,form,formExact,formCategory,sort:sortKey||'registry',direction,includeTotal};
}
function buildDetailPath(query={}) { const id=safeFilterText(query.id,80); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null; const params=new URLSearchParams(); params.set('select',DETAIL_SELECT); params.set('id',`eq.${id}`); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('limit','1'); return `drugs?${params.toString()}`; }
function buildSearchPath(value, limit=SEARCH_LIMIT) {
  const q=safeQueryText(value);
  if(q.length<2 && !/^\d+$/.test(q)) return null;
  const boundedLimit=integerInRange(limit,SEARCH_LIMIT,1,SEARCH_MAX_LIMIT);
  return { path:'rpc/medindex_search_drugs_v2', q, limit:boundedLimit, method:'POST', body:{ p_query:q, p_limit:boundedLimit } };
}
function setHeaders(res,startedAt,timing) { res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','private, max-age=30, stale-while-revalidate=120'); res.setHeader('Vary','Cookie'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-MedIndex-Data-Source','supabase'); res.setHeader('Server-Timing',`${timing};dur=${Date.now()-startedAt}`); }
function buildPersonalLookupPath(query={}) { const ids=safeUuidList(query.ids); if(!ids.length) return { path:'', ids:[] }; const params=new URLSearchParams(); params.set('select',LIST_SELECT); params.set('id',`in.(${ids.join(',')})`); params.set('is_published','eq.true'); params.set('editorial_status','eq.published'); params.set('limit',String(ids.length)); return { path:`drugs?${params.toString()}`, ids }; }

async function sendPage(req,res,startedAt) { const request=buildPageRequest(requestQuery(req)); const {data,response}=await supabaseRequest(request.path,{timeoutMs:6500,label:'Supabase registry page',...(request.includeTotal?{prefer:'count=exact'}:{})}); const rows=Array.isArray(data)?data.map(listRow):[]; const total=request.includeTotal?exactCount(response):null; const totalPages=Number.isFinite(total)?Math.max(1,Math.ceil(total/request.pageSize)):null; setHeaders(res,startedAt,'supabase-registry-page'); if(req.method==='HEAD')return res.status(200).end(); return res.status(200).json({ok:true,rows,pagination:{page:request.page,pageSize:request.pageSize,total,totalPages,hasPrevious:request.page>1,hasNext:Number.isFinite(total)?request.page*request.pageSize<total:rows.length===request.pageSize},query:{q:request.q,status:request.status,atc:request.atc,form:request.form,formExact:request.formExact,formCategory:request.formCategory,sort:request.sort,direction:request.direction,includeTotal:request.includeTotal},meta:{source:'supabase'}}); }
async function sendDetail(req,res,startedAt) { const path=buildDetailPath(requestQuery(req)); if(!path)return res.status(400).json({error:'ID e barit është e pavlefshme.'}); const {data}=await supabaseRequest(path,{timeoutMs:5000,label:'Supabase registry detail'}); const row=Array.isArray(data)&&data.length?detailRow(data[0]):null; setHeaders(res,startedAt,'supabase-registry-detail'); if(req.method==='HEAD')return res.status(row?200:404).end(); return row?res.status(200).json({ok:true,row,meta:{source:'supabase'}}):res.status(404).json({error:'Bari nuk u gjet.'}); }
async function sendSearch(req,res,startedAt) {
  const query=requestQuery(req);
  const request=buildSearchPath(query.q,query.limit);
  setHeaders(res,startedAt,'supabase-drug-search-v4');
  if(!request) return req.method==='HEAD'
    ? res.status(200).end()
    : res.status(200).json({ok:true,query:'',results:[],meta:{source:'supabase',searchVersion:'v4'}});
  const {data}=await supabaseRequest(request.path,{method:request.method,body:request.body,timeoutMs:5000,label:'Supabase ranked drug search v4'});
  const results=Array.isArray(data)?data.map(searchRow):[];
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).json({ok:true,query:request.q,results,meta:{source:'supabase',searchVersion:'v4',limit:request.limit}});
}
async function sendRankedRegistrySearch(req,res,startedAt) {
  const query=requestQuery(req);
  const pageSize=integerInRange(query.pageSize,REGISTRY_DEFAULT_PAGE_SIZE,1,REGISTRY_MAX_PAGE_SIZE);
  const request=buildSearchPath(query.q,pageSize);
  setHeaders(res,startedAt,'supabase-ranked-registry-search-v4');
  if(!request) return req.method==='HEAD'
    ? res.status(200).end()
    : res.status(200).json({ok:true,rows:[],pagination:{page:1,pageSize,total:0,totalPages:1,hasPrevious:false,hasNext:false},query:{q:''},meta:{source:'supabase',searchVersion:'v4',ranked:true}});
  const {data}=await supabaseRequest(request.path,{method:request.method,body:request.body,timeoutMs:5000,label:'Supabase ranked registry search v4'});
  const rows=Array.isArray(data)?data.map(searchRow):[];
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).json({
    ok:true,
    rows,
    pagination:{page:1,pageSize,total:rows.length,totalPages:1,hasPrevious:false,hasNext:false},
    query:{q:request.q},
    meta:{source:'supabase',searchVersion:'v4',ranked:true,limit:request.limit},
  });
}
async function sendPersonalLookup(req,res,startedAt) { const request=buildPersonalLookupPath(requestQuery(req)); setHeaders(res,startedAt,'supabase-personal-drug-lookup'); if(!request.ids.length) return req.method==='HEAD'?res.status(200).end():res.status(200).json({ok:true,rows:[],meta:{source:'supabase',lookup:'personal'}}); const {data}=await supabaseRequest(request.path,{timeoutMs:5000,label:'Supabase personal drug lookup'}); const rows=Array.isArray(data)?data.map(listRow):[]; if(req.method==='HEAD')return res.status(200).end(); return res.status(200).json({ok:true,rows,meta:{source:'supabase',lookup:'personal'}}); }

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
    if (view === 'registry-search') return await sendRankedRegistrySearch(req, res, startedAt);
    if (view === 'registry-detail') return await sendDetail(req, res, startedAt);
    if (view === 'registry-personal') return await sendPersonalLookup(req, res, startedAt);
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
handler.sendRankedRegistrySearch=sendRankedRegistrySearch;
handler.SEARCH_MAX_LIMIT=SEARCH_MAX_LIMIT;
handler.buildPersonalLookupPath=buildPersonalLookupPath;
handler.safeUuidList=safeUuidList;
handler.listRow=listRow;
handler.detailRow=detailRow;
handler.searchRow=searchRow;
handler.sourceFields=sourceFields;
handler.REGISTRY_DEFAULT_PAGE_SIZE=REGISTRY_DEFAULT_PAGE_SIZE;
handler.REGISTRY_MAX_PAGE_SIZE=REGISTRY_MAX_PAGE_SIZE;
handler.atcCategoryCode = atcCategoryCode;
handler.countAtcRows = countAtcRows;
handler.countAtcAggregateRows = countAtcAggregateRows;
handler.fetchAtcCountRowsFromNeon = fetchAtcCountRowsFromNeon;
handler.neonAtcCounts = neonAtcCounts;
handler.ATC_COUNTS_VIEW = ATC_COUNTS_VIEW;
handler.ATC_COUNTS_ROW_LIMIT = ATC_COUNTS_ROW_LIMIT;
handler.ATC_COUNTS_CACHE_TTL_MS = ATC_COUNTS_CACHE_TTL_MS;
handler.ATC_COUNTS_REVISION_CHECK_MS = ATC_COUNTS_REVISION_CHECK_MS;
handler.REGISTRY_DETAIL_SELECT=DETAIL_SELECT;
module.exports=handler;
module.exports.atcCategoryCode = atcCategoryCode;
module.exports.countAtcRows = countAtcRows;
module.exports.countAtcAggregateRows = countAtcAggregateRows;
module.exports.fetchAtcCountRowsFromNeon = fetchAtcCountRowsFromNeon;
module.exports.neonAtcCounts = neonAtcCounts;
module.exports.ATC_COUNTS_VIEW = ATC_COUNTS_VIEW;
module.exports.ATC_COUNTS_ROW_LIMIT = ATC_COUNTS_ROW_LIMIT;
module.exports.ATC_COUNTS_CACHE_TTL_MS = ATC_COUNTS_CACHE_TTL_MS;
module.exports.ATC_COUNTS_REVISION_CHECK_MS = ATC_COUNTS_REVISION_CHECK_MS;
