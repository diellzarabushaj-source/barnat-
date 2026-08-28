'use strict';

const NeonClinical = require('../lib/neon-clinical-reader.js');

const CACHE_MS = 5 * 60 * 1000;
const MAX_PAGE_SIZE = 200;
let cache = { rows:null, loadedAt:0 };
let pending = null;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sq');

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function mapDrug(row) {
  return {
    id:clean(row.__neonDrugId || row.PDID || row['Nr rendor']),
    registryNumber:clean(row['Nr rendor']),
    pdid:clean(row.PDID),
    tradeName:clean(row['Emri tregtar']),
    activeSubstance:clean(row['Substanca aktive']),
    strength:clean(row.Fortësia),
    form:clean(row['Forma farmaceutike']),
    atc:clean(row['ATC Code']),
    drugClass:clean(row['Klasa / Çka është']),
    use:clean(row['Përdorimi (fjalë kyçe)']),
    packaging:clean(row['Madhësia e paketimit']),
    manufacturer:clean(row.Prodhuesi),
    holder:clean(row['Bartësi i Autorizim Marketingut']),
    productStatus:clean(row['Statusi ']),
    retailPrice:row['Çmimi me pakicë'] ?? '',
    wholesalePrice:row['Çmimi me shumicë'] ?? '',
    validity:clean(row['Afati i vlefshmërisë']),
    prescription:clean(row['Si të shënohet në recetë']),
  };
}

async function allRows() {
  if (cache.rows && Date.now() - cache.loadedAt < CACHE_MS) return cache.rows;
  if (!pending) {
    pending = NeonClinical.getPublishedDrugs().then(rows => rows.map(mapDrug)).then(rows => {
      cache = { rows, loadedAt:Date.now() };
      return rows;
    }).finally(() => { pending = null; });
  }
  return pending;
}

function haystack(row) {
  return normalize([row.tradeName,row.activeSubstance,row.atc,row.drugClass,row.use,row.form,row.strength,row.manufacturer,row.holder,row.packaging].join(' '));
}

function sorted(rows, sort, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  const getter = {
    registry:r => Number(r.registryNumber) || Number.MAX_SAFE_INTEGER,
    name:r => r.tradeName,
    substance:r => r.activeSubstance,
    atc:r => r.atc,
    price:r => Number(r.retailPrice) || 0,
  }[sort] || (r => Number(r.registryNumber) || Number.MAX_SAFE_INTEGER);
  return [...rows].sort((a,b) => {
    const av=getter(a), bv=getter(b);
    if(typeof av === 'number' && typeof bv === 'number') return (av-bv)*factor;
    return String(av).localeCompare(String(bv),'sq',{sensitivity:'base',numeric:true})*factor;
  });
}

module.exports = async function handler(req,res) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow','GET');
      return res.status(405).json({error:'Method Not Allowed'});
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control','no-store');
      return res.status(401).json({error:'Sesioni nuk është aktiv.'});
    }

    const url = new URL(req.url,'https://drx.local');
    const q=normalize(url.searchParams.get('q'));
    const form=normalize(url.searchParams.get('form'));
    const status=normalize(url.searchParams.get('status'));
    const sort=clean(url.searchParams.get('sort') || 'registry');
    const direction=clean(url.searchParams.get('direction')) === 'desc' ? 'desc' : 'asc';
    const page=Math.max(1,parseInt(url.searchParams.get('page') || '1',10) || 1);
    const pageSize=Math.min(MAX_PAGE_SIZE,Math.max(10,parseInt(url.searchParams.get('pageSize') || '50',10) || 50));

    let rows=await allRows();
    if(q) rows=rows.filter(row => haystack(row).includes(q));
    if(form) rows=rows.filter(row => normalize(row.form).includes(form));
    if(status) rows=rows.filter(row => normalize(row.productStatus).includes(status));
    rows=sorted(rows,sort,direction);

    const total=rows.length;
    const totalPages=Math.max(1,Math.ceil(total/pageSize));
    const safePage=Math.min(page,totalPages);
    const offset=(safePage-1)*pageSize;
    const pageRows=rows.slice(offset,offset+pageSize);

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-MedIndex-Data-Source','Neon');
    res.setHeader('Server-Timing',`drug-search;dur=${Date.now()-startedAt}`);
    return res.status(200).json({
      rows:pageRows,
      pagination:{page:safePage,pageSize,total,totalPages},
      meta:{source:'neon',cacheAgeMs:Date.now()-cache.loadedAt,generatedAt:new Date().toISOString()}
    });
  } catch(error) {
    console.error('drug-search',error);
    res.setHeader('Cache-Control','no-store');
    return res.status(500).json({error:'Regjistri nuk u ngarkua.',detail:String(error?.message || error).slice(0,240)});
  }
};
