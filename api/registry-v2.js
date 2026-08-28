'use strict';

const NeonClinical = require('../lib/neon-clinical-reader.js');

const CACHE_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

let cache = { rows: null, loadedAt: 0 };
let pending = null;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('sq');

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function publicDrug(row) {
  return {
    id: clean(row.__neonDrugId || row.PDID || row['Nr rendor']),
    registryNumber: clean(row['Nr rendor']),
    pdid: clean(row.PDID),
    tradeName: clean(row['Emri tregtar']),
    activeSubstance: clean(row['Substanca aktive']),
    strength: clean(row.Fortësia),
    form: clean(row['Forma farmaceutike']),
    atc: clean(row['ATC Code']),
    drugClass: clean(row['Klasa / Çka është']),
    use: clean(row['Përdorimi (fjalë kyçe)']),
    packaging: clean(row['Madhësia e paketimit']),
    holder: clean(row['Bartësi i Autorizim Marketingut']),
    manufacturer: clean(row.Prodhuesi),
    status: clean(row['Statusi ']),
    wholesalePrice: row['Çmimi me shumicë'] ?? '',
    retailPrice: row['Çmimi me pakicë'] ?? '',
    validity: clean(row['Afati i vlefshmërisë']),
    prescription: clean(row['Si të shënohet në recetë']),
    administrationCategory: clean(row.__administrationCategory || row['Kategoria e administrimit']),
    allowedRoutes: Array.isArray(row.__allowedRoutes)
      ? row.__allowedRoutes
      : clean(row['Rrugët e lejuara']).split(/\s*;\s*/).filter(Boolean),
  };
}

async function allRows() {
  if (cache.rows && Date.now() - cache.loadedAt < CACHE_MS) return cache.rows;
  if (!pending) {
    pending = NeonClinical.getPublishedDrugs()
      .then((rows) => rows.map(publicDrug))
      .then((rows) => {
        cache = { rows, loadedAt: Date.now() };
        return rows;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

function searchHaystack(row) {
  return normalize([
    row.tradeName, row.activeSubstance, row.atc, row.drugClass, row.use,
    row.form, row.strength, row.manufacturer, row.holder, row.packaging,
  ].join(' '));
}

function sortRows(rows, sort, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  const getter = {
    name: (r) => r.tradeName,
    substance: (r) => r.activeSubstance,
    atc: (r) => r.atc,
    registry: (r) => Number(r.registryNumber) || Number.MAX_SAFE_INTEGER,
  }[sort] || ((r) => Number(r.registryNumber) || Number.MAX_SAFE_INTEGER);

  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), 'sq', { sensitivity: 'base', numeric: true }) * factor;
  });
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!(await authorized(req))) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ error: 'Sesioni nuk është aktiv.' });
    }

    const url = new URL(req.url, 'https://drx.local');
    const q = normalize(url.searchParams.get('q'));
    const atc = normalize(url.searchParams.get('atc'));
    const form = normalize(url.searchParams.get('form'));
    const status = normalize(url.searchParams.get('status'));
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, Number.parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const sort = clean(url.searchParams.get('sort') || 'registry');
    const direction = clean(url.searchParams.get('direction') || 'asc') === 'desc' ? 'desc' : 'asc';

    let rows = await allRows();
    if (q) rows = rows.filter((row) => searchHaystack(row).includes(q));
    if (atc) rows = rows.filter((row) => normalize(row.atc).startsWith(atc));
    if (form) rows = rows.filter((row) => normalize(row.form).includes(form));
    if (status) rows = rows.filter((row) => normalize(row.status).includes(status));

    rows = sortRows(rows, sort, direction);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    const forms = [...new Set((cache.rows || []).map((row) => row.form).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'sq'));
    const statuses = [...new Set((cache.rows || []).map((row) => row.status).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'sq'));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Server-Timing', `registry-v2;dur=${Date.now() - startedAt}`);
    return res.status(200).json({
      items,
      pagination: { page: safePage, pageSize, total, totalPages },
      filters: { forms, statuses },
      meta: { source: 'neon', generatedAt: new Date().toISOString(), cacheAgeMs: Date.now() - cache.loadedAt },
    });
  } catch (error) {
    console.error('registry-v2', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Regjistri nuk u ngarkua.', detail: String(error?.message || error).slice(0, 240) });
  }
};
