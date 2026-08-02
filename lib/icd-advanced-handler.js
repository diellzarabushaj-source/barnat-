const crypto = require('node:crypto');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Search = require('../lib/icd-search-engine-v2.js');

const SPREADSHEET_ID = '1O2S9xNIzvNmiG8ny-VLAp9NeyiUsrY8pxRpyJgTF_O0';
const SHEET_GID = 329283560;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const MAX_CSV_BYTES = 6 * 1024 * 1024;
const MAX_QUERY_CHARS = 160;

let cached = null;
let pending = null;

const clean = value => String(value ?? '').trim();
const csvUrl = () => `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function fetchCsv() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(csvUrl(), {
      headers:{ Accept:'text/csv,*/*;q=0.8', 'User-Agent':'MedIndex/2.0' },
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Google Sheet ICD-10 ktheu ${response.status}.`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_CSV_BYTES) throw new Error('Dataset-i ICD-10 tejkalon kufirin e madhësisë.');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new Error('Dataset-i ICD-10 tejkalon kufirin e madhësisë.');
    if (!text.trim()) throw new Error('Dataset-i ICD-10 ishte bosh.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDataset() {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
  if (!pending) {
    pending = (async () => {
      const csv = await fetchCsv();
      const data = FullIcd.buildDataset(csv, { strictCounts:true });
      cached = { loadedAt:Date.now(), data };
      return cached;
    })().catch(error => {
      if (cached) return { ...cached, stale:true, staleReason:String(error?.message || error).slice(0, 300) };
      throw error;
    }).finally(() => {
      pending = null;
    });
  }
  return pending;
}

function childCounts(dataset) {
  const counts = new Map();
  for (const node of dataset.nodes) counts.set(node.parentCode, (counts.get(node.parentCode) || 0) + 1);
  return counts;
}

function compactNode(node, counts) {
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
    sourceUrl:node.sourceUrl,
    childCount:counts.get(node.code) || 0,
    searchMatch:node.searchMatch || null,
  };
}

function searchableNode(node) {
  const aliases = Array.isArray(node?.terminologyAliases) ? node.terminologyAliases.map(clean).filter(Boolean) : [];
  if (!aliases.length) return node;
  return {
    ...node,
    albanianDraft:[node.albanianDraft, ...aliases].map(clean).filter(Boolean).join(' '),
  };
}

function restoreNode(node, originals) {
  const original = originals.get(node?.code);
  if (!original) return node;
  return { ...original, searchMatch:node.searchMatch || null };
}

function meta(dataset) {
  return {
    version:dataset.version,
    sourceSpreadsheetId:dataset.sourceSpreadsheetId,
    counts:dataset.counts,
    quality:dataset.quality,
    search:{
      version:'sq-clinical-search-v1',
      supports:['code', 'sq-title', 'en-title', 'sq-synonym', 'editorial-alias', 'typo', 'wildcard', 'hierarchy-groups'],
      diagnosticDecision:false,
    },
  };
}

function tablePayload(dataset, query, counts) {
  const q = clean(query.q).slice(0, MAX_QUERY_CHARS);
  const parent = clean(query.parent);
  const chapter = clean(query.chapter);
  const requestedLevels = clean(query.levels || query.level || 'category,subcategory')
    .split(',')
    .map(clean)
    .filter(Boolean);
  const levels = new Set(requestedLevels);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
  const page = Math.max(1, Number(query.page) || 1);
  const originals = FullIcd.nodeMap(dataset);

  let rows = dataset.nodes.filter(node => {
    if (parent && node.parentCode !== parent) return false;
    if (chapter && node.chapter !== chapter) return false;
    if (levels.size && !levels.has(node.level)) return false;
    return true;
  });

  const ranked = Search.rankNodes(rows.map(searchableNode), q);
  rows = ranked.map(item => ({ ...restoreNode(item.node, originals), searchMatch:item.match ? {
    type:item.match.type,
    field:item.match.field,
    score:item.match.score,
    matchedTerm:item.match.matchedTerm || '',
    expandedTerm:item.match.expandedTerm || '',
    label:Search.MATCH_LABELS[item.match.type] || 'Përputhje',
  } : null }));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const context = parent ? originals.get(parent) || null : null;

  return {
    meta:meta(dataset),
    query:q,
    page:safePage,
    pageSize,
    total,
    totalPages,
    rows:rows.slice(start, start + pageSize).map(node => compactNode(node, counts)),
    context:compactNode(context, counts),
    ancestors:context
      ? FullIcd.ancestorsOf(dataset, context.code).map(node => compactNode(node, counts))
      : [],
  };
}

function suggestionPayload(dataset, query, counts) {
  const q = clean(query.q).slice(0, MAX_QUERY_CHARS);
  if (q.length < 2) {
    return {
      meta:meta(dataset),
      query:q,
      interpretedAs:'',
      rows:[],
      groups:[],
      total:0,
      safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
    };
  }
  const originals = FullIcd.nodeMap(dataset);
  const searchableDataset = { ...dataset, nodes:dataset.nodes.map(searchableNode) };
  const result = Search.suggestDataset(searchableDataset, q, { limit:18 });
  const restoredRows = result.rows.map(node => restoreNode(node, originals));
  return {
    meta:meta(dataset),
    ...result,
    rows:restoredRows.map(node => compactNode(node, counts)),
  };
}

function send(req, res, payload, stale, startedAt) {
  const body = JSON.stringify({ ok:true, data:payload });
  const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=900');
  res.setHeader('ETag', etag);
  res.setHeader('X-MedIndex-Search-Version', 'sq-clinical-search-v1');
  res.setHeader('Server-Timing', `icd-search;dur=${Date.now() - startedAt}`);
  if (stale) res.setHeader('Warning', '110 - "Response is stale"');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(body);
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok:false, data:null, error:'Metoda nuk lejohet.' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ ok:false, data:null, error:'Kërkohet autentikim.' });
  }

  try {
    const loaded = await loadDataset();
    const counts = childCounts(loaded.data);
    const view = clean(req.query?.view).toLowerCase() === 'suggest' ? 'suggest' : 'table';
    const payload = view === 'suggest'
      ? suggestionPayload(loaded.data, req.query || {}, counts)
      : tablePayload(loaded.data, req.query || {}, counts);
    return send(req, res, payload, loaded.stale, startedAt);
  } catch (error) {
    console.error('Advanced ICD search failed:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(502).json({
      ok:false,
      data:null,
      error:'Kërkimi i avancuar ICD-10 nuk u ngarkua.',
      detail:String(error?.message || error).slice(0, 500),
    });
  }
};

module.exports._test = { searchableNode, restoreNode, tablePayload, suggestionPayload };
