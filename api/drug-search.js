'use strict';

const { supabaseRequest, exactCount } = require('../lib/supabase-data-api.js');

const MAX_PAGE_SIZE = 200;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function requestUrl(req) {
  try { return new URL(req?.url || '/api/drug-search', 'https://drx.local'); }
  catch { return new URL('/api/drug-search', 'https://drx.local'); }
}

function mapDrug(row) {
  const payload = row?.source_payload && typeof row.source_payload === 'object' ? row.source_payload : {};
  return {
    id:clean(row.id),
    registryNumber:clean(row.registry_number),
    pdid:clean(row.pdid),
    tradeName:clean(row.trade_name),
    activeSubstance:clean(row.active_substance),
    strength:clean(row.strength),
    form:clean(row.pharmaceutical_form),
    atc:clean(row.atc_code),
    drugClass:clean(row.drug_class),
    use:clean(row.use_text),
    packaging:clean(row.packaging),
    manufacturer:clean(row.manufacturer),
    holder:clean(row.marketing_authorization_holder),
    productStatus:clean(row.product_status),
    retailPrice:row.retail_price ?? '',
    wholesalePrice:row.wholesale_price ?? '',
    validity:clean(row.validity_text),
    approvedPopulation:clean(row.approved_population),
    prescriptionNotation:clean(payload['Si të shënohet në recetë']),
  };
}

function buildPath(url) {
  const page=Math.max(1,Number.parseInt(url.searchParams.get('page') || '1',10) || 1);
  const pageSize=Math.min(MAX_PAGE_SIZE,Math.max(10,Number.parseInt(url.searchParams.get('pageSize') || '50',10) || 50));
  const q=clean(url.searchParams.get('q'));
  const form=clean(url.searchParams.get('form'));
  const status=clean(url.searchParams.get('status'));
  const direction=clean(url.searchParams.get('direction')) === 'desc' ? 'desc' : 'asc';
  const sortKey=clean(url.searchParams.get('sort') || 'registry');
  const sortColumn={registry:'registry_number',name:'trade_name',substance:'active_substance',atc:'atc_code',price:'retail_price'}[sortKey] || 'registry_number';
  const offset=(page-1)*pageSize;

  const params=new URLSearchParams();
  params.set('select',[
    'id','registry_number','pdid','trade_name','active_substance','strength','pharmaceutical_form','atc_code',
    'drug_class','use_text','packaging','manufacturer','marketing_authorization_holder','product_status',
    'retail_price','wholesale_price','validity_text','approved_population','source_payload'
  ].join(','));
  params.set('is_published','eq.true');
  params.set('editorial_status','eq.published');
  if(q) params.set('registry_search_text',`ilike.*${q.replace(/[,*()]/g,' ')}*`);
  if(form) params.set('pharmaceutical_form',`ilike.*${form.replace(/[,*()]/g,' ')}*`);
  if(status) params.set('product_status',`ilike.*${status.replace(/[,*()]/g,' ')}*`);
  params.set('order',`${sortColumn}.${direction}.nullslast,registry_number.asc`);
  params.set('limit',String(pageSize));
  params.set('offset',String(offset));
  return { path:`drugs?${params.toString()}`, page, pageSize };
}

module.exports = async function handler(req,res) {
  const startedAt=Date.now();
  try {
    if(req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow','GET, HEAD');
      return res.status(405).json({error:'Method Not Allowed'});
    }
    if(!(await authorized(req))) {
      res.setHeader('Cache-Control','no-store');
      return res.status(401).json({error:'Sesioni nuk është aktiv.'});
    }

    const { path, page, pageSize }=buildPath(requestUrl(req));
    const { data, response }=await supabaseRequest(path, {
      timeoutMs:6500,
      prefer:'count=exact',
      label:'Supabase registry search',
    });
    const rows=Array.isArray(data) ? data.map(mapDrug) : [];
    const total=exactCount(response) ?? rows.length;
    const totalPages=Math.max(1,Math.ceil(total/pageSize));

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','private, max-age=30, stale-while-revalidate=120');
    res.setHeader('Vary','Cookie');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-MedIndex-Data-Source','Supabase');
    res.setHeader('Server-Timing',`supabase-registry;dur=${Date.now()-startedAt}`);
    if(req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({
      rows,
      pagination:{page,pageSize,total,totalPages},
      meta:{source:'supabase',generatedAt:new Date().toISOString()}
    });
  } catch(error) {
    console.error('drug-search supabase',error);
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({error:'Regjistri nuk u ngarkua.',detail:String(error?.message || error).slice(0,240)});
  }
};
