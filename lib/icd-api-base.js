const crypto = require('node:crypto');
const NeonClinical = require('../lib/neon-clinical-reader.js');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const IcdPublicSource = require('../lib/icd-public-source.js');

const SPREADSHEET_ID = '19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw';
const SHEETS = { all:1504864603, urgent:285385409, critical:255407421 };
const FULL_VIEWS = new Set(['table', 'nav', 'children', 'resolve', 'suggest', 'meta']);
const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_CSV_BYTES = 6 * 1024 * 1024;
const memoryCaches = new Map();
const pendingLoads = new Map();

const clean = value => String(value ?? '').trim();
const normalized = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const httpsUrl = value => /^https:\/\/[^\s]+$/i.test(clean(value)) ? clean(value) : '';
const csvUrl = gid => `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = String(value || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function tableFromCsv(csv) {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex(row => {
    const cells = row.map(normalized);
    return (cells.includes('kodi icd 10') || cells.includes('kodi')) && cells.includes('emri ne shqip');
  });
  if (headerIndex < 0) throw new Error('Nuk u gjet rreshti i kolonave ICD-10 në Google Sheet.');
  const headers = rows[headerIndex].map(clean);
  const nonEmpty = headers.filter(Boolean);
  if (new Set(nonEmpty).size !== nonEmpty.length) throw new Error('Google Sheet ICD-10 ka header-a të dyfishtë.');
  return rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => clean(cell)))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])));
}

async function fetchCsv(gid) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(csvUrl(gid), {
      headers:{ Accept:'text/csv,*/*;q=0.8', 'User-Agent':'MedIndex/2.0' },
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheet ktheu ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_CSV_BYTES) throw new Error('Google Sheet ICD-10 tejkalon kufirin e madhësisë.');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('Google Sheet ICD-10 tejkalon kufirin e madhësisë.');
    if (!text.trim()) throw new Error('Google Sheet ICD-10 ishte bosh.');
    return text;
  } finally { clearTimeout(timeout); }
}

const codeValue = row => clean(row['Kodi ICD-10'] || row.Kodi);
const codeSet = rows => new Set(rows.map(codeValue).filter(Boolean));
const keywords = value => clean(value).split(';').map(clean).filter(Boolean);
const level = value => normalized(value) === 'kategori kryesore' ? 'kategori' : 'kod';

function mapEntry(row, urgentCodes, criticalCodes) {
  const code = codeValue(row);
  const officialFallback = `https://icd.who.int/browse10/2019/en#/${encodeURIComponent(code)}`;
  return {
    number:clean(row['Nr.']), chapter:clean(row.Kapitulli), chapterRange:clean(row.Intervali).replace(/-/g, '–'),
    chapterTitle:clean(row['Emri i kapitullit']), group:clean(row['Grupi / nënkategoria klinike']), code,
    level:level(row.Niveli), sourceLevel:clean(row.Niveli), title:clean(row['Emri në shqip']),
    englishTitle:clean(row['Emri në anglisht']), primaryCare:clean(row['Mjekësi familjare']), emergency:clean(row.Urgjencë),
    priority:clean(row.Prioriteti), summary:clean(row['Përdorimi tipik']), keywords:keywords(row['Fjalë kyçe']),
    warning:clean(row['Shenja alarmi / kujdes']), sourceUrl:httpsUrl(row['Burimi WHO']) || officialFallback,
    codingNotes:[clean(row['Shënim kodimi'])].filter(Boolean), includes:[], excludes:[],
    parent:clean(row['Grupi / nënkategoria klinike']) || clean(row.Intervali),
    isFamilyMedicine:true, isEmergency:urgentCodes.has(code), isCritical:criticalCodes.has(code),
  };
}

function wrap(data, dataSource, extra = {}) {
  const body = JSON.stringify({ ok:true, data });
  return {
    loadedAt:Date.now(),
    body,
    etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    data,
    dataSource,
    ...extra,
  };
}

async function buildSheetsIcdDataset() {
  const startedAt = Date.now();
  const [allCsv, urgentCsv, criticalCsv] = await Promise.all([
    fetchCsv(SHEETS.all), fetchCsv(SHEETS.urgent), fetchCsv(SHEETS.critical),
  ]);
  const allRows = tableFromCsv(allCsv);
  const urgentCodes = codeSet(tableFromCsv(urgentCsv));
  const criticalCodes = codeSet(tableFromCsv(criticalCsv));
  const entries = allRows.map(row => mapEntry(row, urgentCodes, criticalCodes)).filter(entry => entry.code && entry.title);
  const unique = new Set(entries.map(entry => entry.code));
  if (unique.size !== entries.length) throw new Error('Google Sheet përmban kode ICD-10 të dyfishta.');
  if (!entries.length || !urgentCodes.size || !criticalCodes.size) throw new Error('Google Sheet nuk ktheu setet e plota ICD-10.');
  return wrap({
    source:'Google Sheet i dhënë nga përdoruesi', sourceSpreadsheetId:SPREADSHEET_ID,
    version:'ICD-10-WHO 2019', generatedAt:new Date().toISOString(),
    counts:{
      total:entries.length,
      familyMedicine:entries.filter(entry => entry.isFamilyMedicine).length,
      emergency:entries.filter(entry => entry.isEmergency).length,
      critical:entries.filter(entry => entry.isCritical).length,
    },
    entries,
  }, 'sheets', { buildMs:Date.now() - startedAt });
}

async function buildNeonIcdDataset() {
  const startedAt = Date.now();
  const data = await NeonClinical.getPublishedIcdCodes();
  return wrap(data, 'supabase', { neonQueryMs:Date.now() - startedAt });
}

async function buildNeonLabDataset() {
  const startedAt = Date.now();
  const data = await NeonClinical.getPublishedLabTests();
  return wrap(data, 'neon', { neonQueryMs:Date.now() - startedAt });
}

async function buildDataset(scope) {
  const mode = NeonClinical.dataSourceMode();
  if (scope === 'labs') {
    if (mode === 'sheets') throw new Error('Analizat Supabase janë çaktivizuar nga konfigurimi.');
    return buildNeonLabDataset();
  }
  if (mode === 'sheets') return buildSheetsIcdDataset();
  try {
    return await buildNeonIcdDataset();
  } catch (error) {
    if (!NeonClinical.allowsSheetsFallback()) throw error;
    const fallback = await buildSheetsIcdDataset();
    fallback.dataSource = 'sheets-fallback';
    fallback.neonError = String(error?.message || error).slice(0, 500);
    return fallback;
  }
}

async function loadDataset(scope) {
  const key = `${scope}:${NeonClinical.dataSourceMode()}`;
  const cached = memoryCaches.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
  if (!pendingLoads.has(key)) {
    pendingLoads.set(key, buildDataset(scope).then(dataset => {
      memoryCaches.set(key, dataset);
      return dataset;
    }).catch(error => {
      if (cached) return { ...cached, stale:true, staleReason:String(error?.message || error).slice(0, 500) };
      throw error;
    }).finally(() => { pendingLoads.delete(key); }));
  }
  return pendingLoads.get(key);
}

function compactNode(node, dataset) {
  if (!node) return null;
  return {
    code:node.code,
    level:node.level,
    chapter:node.chapter,
    block:node.block,
    parentCode:node.parentCode,
    englishTitle:node.englishTitle,
    albanianDraft:node.albanianDraft,
    displayTitle:node.displayTitle,
    translationStatus:node.translationStatus,
    primaryCareRole:node.primaryCareRole || '',
    managementSummary:node.managementSummary || '',
    urgencyLevel:node.urgencyLevel || 'none',
    isUrgent:Boolean(node.isUrgent),
    isDirectUrgency:Boolean(node.isDirectUrgency),
    sourceUrl:node.sourceUrl,
    childCount:FullIcd.childCountOf(dataset, node.code),
  };
}

function fullViewPayload(dataset, query = {}, loaded = {}) {
  const view = clean(query.view).toLowerCase() || 'table';
  const byCode = FullIcd.nodeMap(dataset);
  const meta = {
    version:dataset.version,
    sourceSpreadsheetId:dataset.sourceSpreadsheetId,
    counts:dataset.counts,
    quality:dataset.quality,
    source:IcdPublicSource.sourceMeta(loaded),
  };

  if (view === 'meta') return { meta };

  if (view === 'nav') {
    const chapters = FullIcd.chaptersOf(dataset).map(node => compactNode(node, dataset));
    const blocks = FullIcd.blocksOf(dataset).map(node => compactNode(node, dataset));
    return { meta, chapters, blocks };
  }

  if (view === 'children') {
    const parent = clean(query.parent);
    const parentNode = byCode.get(parent) || null;
    const rows = FullIcd.childrenOf(dataset, parent).map(node => compactNode(node, dataset));
    return {
      meta,
      parent:compactNode(parentNode, dataset),
      ancestors:FullIcd.ancestorsOf(dataset, parent).map(node => compactNode(node, dataset)),
      rows,
      total:rows.length,
    };
  }

  if (view === 'resolve') {
    const code = clean(query.code || query.parent);
    const node = byCode.get(code) || null;
    return {
      meta,
      node:compactNode(node, dataset),
      ancestors:node ? FullIcd.ancestorsOf(dataset, code).map(item => compactNode(item, dataset)) : [],
    };
  }

  const isSuggest = view === 'suggest';
  const result = FullIcd.queryDataset(dataset, {
    q:query.q,
    parent:query.parent,
    chapter:query.chapter,
    levels:isSuggest ? '' : (query.levels || query.level || 'category,subcategory'),
    page:isSuggest ? 1 : query.page,
    pageSize:isSuggest ? 12 : query.pageSize,
  });
  const rows = result.rows.map(node => compactNode(node, dataset));
  const contextCode = clean(query.parent);
  const context = contextCode ? byCode.get(contextCode) || null : null;
  return {
    meta,
    ...result,
    rows,
    context:compactNode(context, dataset),
    ancestors:context ? FullIcd.ancestorsOf(dataset, contextCode).map(node => compactNode(node, dataset)) : [],
  };
}

function sendJson(req, res, payload, dataSource, startedAt, stale = false) {
  const body = JSON.stringify({ ok:true, data:payload });
  const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-MedIndex-Data-Source', dataSource);
  res.setHeader('Server-Timing', `icd;dur=${Date.now() - startedAt}`);
  if (stale) res.setHeader('Warning', '110 - "Response is stale"');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(body);
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ error:'Kërkohet autentikim.', ok:false, data:null });
  }

  const scope = clean(req.query?.dataset).toLowerCase() === 'labs' ? 'labs' : 'icd';
  const requestedView = clean(req.query?.view).toLowerCase();
  try {
    if (scope === 'icd' && FULL_VIEWS.has(requestedView)) {
      const full = await IcdPublicSource.load();
      const payload = fullViewPayload(full.data, req.query || {}, full);
      res.setHeader('X-MedIndex-ICD-Nodes', String(full.data.counts.total));
      res.setHeader('X-MedIndex-ICD-Source-State', full.stale ? 'stale' : 'live');
      res.setHeader('X-MedIndex-ICD-Revision', full.sourceRevision || 'unknown');
      res.setHeader('X-MedIndex-ICD-CSV-Bytes', String(full.csvBytes || 0));
      res.setHeader('X-MedIndex-ICD-Build-Ms', String(full.buildMs || 0));
      return sendJson(req, res, payload, 'full-hierarchy-sheet', startedAt, full.stale);
    }

    const dataset = await loadDataset(scope);
    res.setHeader('ETag', dataset.etag);
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-MedIndex-Data-Source', dataset.dataSource || 'unknown');
    res.setHeader('Server-Timing', `${scope};dur=${Date.now() - startedAt}${Number.isFinite(dataset.neonQueryMs) ? `, neon;dur=${dataset.neonQueryMs}` : ''}`);
    if (scope === 'labs') res.setHeader('X-MedIndex-Lab-Tests', String(dataset.data.tests.length));
    else res.setHeader('X-MedIndex-ICD-Codes', String(dataset.data.counts.total));
    if (dataset.stale) res.setHeader('Warning', '110 - "Response is stale"');
    if (req.headers['if-none-match'] === dataset.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(dataset.body);
  } catch (error) {
    console.error(`${scope} data load failed:`, error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(scope === 'labs' ? 503 : 502).json({
      error:scope === 'labs' ? 'Analizat nuk u ngarkuan nga Supabase.' : 'Të dhënat ICD-10 nuk u ngarkuan.',
      detail:String(error?.message || error).slice(0, 500),
      ok:false,
      data:null,
    });
  }
};

module.exports._test = { fullViewPayload, compactNode };
