'use strict';

/*
 * Adapter i hollë për fushat PRN + generic active-substance calculator bridge.
 * Llogaritja klinike mbetet server-side; browser-i nuk dërgon formulë/dozë.
 */

const dataApi = require('./medindex-data-api.js');
const originalNeonRequest = dataApi.neonRequest;
const PRN_SAFETY_COLUMNS = Object.freeze([
  'pediatric_max_doses_per_day',
  'pediatric_min_interval_hours',
]);

function augmentPediatricDrugSelect(requestPath) {
  const raw = String(requestPath || '');
  if (!raw.startsWith('drugs?')) return requestPath;

  const query = raw.slice('drugs?'.length);
  const params = new URLSearchParams(query);
  const select = params.get('select');
  if (!select || !select.includes('pediatric_')) return requestPath;

  const columns = select.split(',').map(item => item.trim()).filter(Boolean);
  for (const column of PRN_SAFETY_COLUMNS) {
    if (!columns.includes(column)) columns.push(column);
  }
  params.set('select', columns.join(','));
  return `drugs?${params.toString()}`;
}

dataApi.neonRequest = (requestPath, options) => originalNeonRequest(
  augmentPediatricDrugSelect(requestPath),
  options,
);

/* Core-i e kap adapterin e Data API në require-time. */
const core = require('./pediatric-dosage-handler-core.js');
dataApi.neonRequest = originalNeonRequest;
const Generic = require('./generic-substance-dose-catalog.js');

const MAX_BODY_BYTES = 4096;

function requestUrl(req) {
  return new URL(req.url || '/', 'http://localhost');
}

async function authorized(req) {
  const auth = await import('./auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (req.body.length > MAX_BODY_BYTES) throw new Error('Trupi i kërkesës është shumë i madh.');
    return JSON.parse(req.body);
  }
  if (typeof req.on !== 'function') return {};
  const raw = await new Promise((resolve,reject) => {
    let size=0;
    const chunks=[];
    req.on('data',chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return reject(new Error('Trupi i kërkesës është shumë i madh.'));
      chunks.push(chunk);
    });
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error',reject);
  });
  return raw ? JSON.parse(raw) : {};
}

function setHeaders(res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vary','Cookie');
  res.setHeader('X-Content-Type-Options','nosniff');
  // Ruaj kontratën ekzistuese të API-së; burimi SmPC shënohet veçmas.
  res.setHeader('X-MedIndex-Data-Source','Supabase');
  res.setHeader('X-MedIndex-Generic-Dose-Source','Official-SmPC');
  res.setHeader('X-MedIndex-Dosage-Policy','fail-closed');
}

function mergeFacets(results) {
  const facets={all:0,ready:0,text:0,blocked:0};
  for(const item of results){
    facets.all += 1;
    if(item.readiness==='CALCULATOR_READY' && item.calculable===true) facets.ready += 1;
    else if(item.readiness==='TEXT_ONLY') facets.text += 1;
    else facets.blocked += 1;
  }
  return facets;
}

async function mergedSearch(req,res,url) {
  setHeaders(res);
  if (!['GET','HEAD'].includes(req.method)) {
    res.setHeader('Allow','GET, HEAD');
    return res.status(405).json({ok:false,error:'Metoda nuk lejohet.'});
  }
  if (!(await authorized(req))) return res.status(401).json({ok:false,error:'Sesioni nuk është aktiv.'});

  const q=url.searchParams.get('q') || '';
  const limit=url.searchParams.get('limit');
  const generic=Generic.search(q,limit);
  const parsedLimit=Number.parseInt(String(limit || ''),10);
  const maxResults=Number.isFinite(parsedLimit) ? Math.min(50,Math.max(1,parsedLimit)) : 30;
  let legacy={token:'',tokens:[],results:[],facets:{all:0,ready:0,text:0,blocked:0}};
  try {
    legacy=await core.searchDrugs(q,limit);
  } catch(error) {
    if (!generic.results.length) throw error;
    console.error('Registry search failed; serving verified generic substance results only:',error.message);
  }
  const seen=new Set();
  const results=[];
  for(const item of [...generic.results,...(legacy.results || [])]){
    const key=String(item.drugId || '');
    if(!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if(results.length>=maxResults) break;
  }
  const payload={
    ok:true,
    query:legacy.token || String(q).trim(),
    tokens:legacy.tokens || [],
    count:results.length,
    facets:mergeFacets(results),
    results,
  };
  if(req.method==='HEAD') return res.status(200).end();
  return res.status(200).json(payload);
}

async function genericProduct(req,res,url) {
  const id=url.searchParams.get('drugId') || url.searchParams.get('registryNumber') || '';
  if(!Generic.isGenericId(id)) return null;
  setHeaders(res);
  if (!['GET','HEAD'].includes(req.method)) {
    res.setHeader('Allow','GET, HEAD');
    return res.status(405).json({ok:false,error:'Metoda nuk lejohet.'});
  }
  if (!(await authorized(req))) return res.status(401).json({ok:false,error:'Sesioni nuk është aktiv.'});
  const product=Generic.buildProduct(id);
  if(!product) return res.status(404).json({ok:false,error:'Substanca aktive nuk u gjet.'});
  if(req.method==='HEAD') return res.status(200).end();
  return res.status(200).json({ok:true,product});
}

async function genericCalculate(req,res) {
  if(req.method!=='POST') return null;
  let body;
  try { body=await readBody(req); }
  catch(error){
    setHeaders(res);
    return res.status(400).json({ok:false,error:`Trupi i kërkesës nuk u lexua: ${error.message}`});
  }
  req.body=body;
  if(!Generic.isGenericId(body?.drugId)) return null;
  setHeaders(res);
  if (!(await authorized(req))) return res.status(401).json({ok:false,error:'Sesioni nuk është aktiv.'});
  const outcome=Generic.calculate(body && typeof body==='object' ? body : {});
  if(outcome.error) return res.status(outcome.status || 400).json({ok:false,error:outcome.error});
  return res.status(200).json({ok:true,calculation:outcome.calculation});
}

async function handler(req,res) {
  const url=requestUrl(req);
  const view=url.searchParams.get('view') || '';

  try {
    if(view===core.SEARCH_VIEW) return await mergedSearch(req,res,url);
    if(view===core.PRODUCT_VIEW) {
      const served=await genericProduct(req,res,url);
      if(served) return served;
    }
    if(view===core.CALCULATE_VIEW) {
      const served=await genericCalculate(req,res);
      if(served) return served;
    }
  } catch(error) {
    console.error('Generic substance dosage bridge failed:',error);
    setHeaders(res);
    return res.status(502).json({ok:false,error:'Të dhënat e dozologjisë nuk u lexuan.'});
  }
  return core(req,res);
}

handler.SEARCH_VIEW=core.SEARCH_VIEW;
handler.PRODUCT_VIEW=core.PRODUCT_VIEW;
handler.CALCULATE_VIEW=core.CALCULATE_VIEW;
handler.PEDIATRIC_COLUMNS=[...core.PEDIATRIC_COLUMNS,...PRN_SAFETY_COLUMNS];
handler.PRN_SAFETY_COLUMNS=PRN_SAFETY_COLUMNS;
handler.augmentPediatricDrugSelect=augmentPediatricDrugSelect;
handler.searchDrugs=core.searchDrugs;
handler.loadProduct=core.loadProduct;
handler.calculateDose=core.calculateDose;
handler.Generic=Generic;
handler._test={...(core._test || {}),mergedSearch,mergeFacets,readBody,requestUrl};

module.exports=handler;
