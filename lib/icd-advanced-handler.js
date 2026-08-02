const crypto = require('node:crypto');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Search = require('../lib/icd-search-engine-v3.js');
const IcdPublicSource = require('../lib/icd-public-source.js');

const MAX_QUERY_CHARS = 160;
const MAX_PAYLOAD_CACHE = 120;
const searchRuntimeByDataset = new WeakMap();
const payloadCacheByDataset = new WeakMap();

const clean = value => String(value ?? '').trim();

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function breadcrumb(node, dataset) {
  if (!node) return [];
  return FullIcd.ancestorsOf(dataset, node.code).map(item => ({
    code:item.code,
    level:item.level,
    title:item.displayTitle,
  }));
}

function compactNode(node, dataset, options = {}) {
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
    childCount:FullIcd.childCountOf(dataset, node.code),
    breadcrumb:options.breadcrumb === false ? [] : breadcrumb(node, dataset),
    searchMatch:node.searchMatch || null,
  };
}

function searchableNode(node) {
  return node;
}

function restoreNode(node, originals) {
  const original = originals.get(node?.code);
  if (!original) return node;
  return { ...original, searchMatch:node.searchMatch || null };
}

function searchRuntime(dataset) {
  const cached = searchRuntimeByDataset.get(dataset);
  if (cached) return cached;
  const runtime = Object.freeze({
    originals:FullIcd.nodeMap(dataset),
    searchableDataset:dataset,
  });
  searchRuntimeByDataset.set(dataset, runtime);
  return runtime;
}

function payloadCache(dataset) {
  let cache = payloadCacheByDataset.get(dataset);
  if (!cache) {
    cache = new Map();
    payloadCacheByDataset.set(dataset, cache);
  }
  return cache;
}

function cacheKey(view, query, loaded) {
  const values = [
    view,
    clean(query.q).toLocaleLowerCase('sq-AL'),
    clean(query.parent),
    clean(query.chapter),
    clean(query.levels || query.level),
    String(query.page || 1),
    String(query.pageSize || 50),
    loaded?.sourceRevision || '',
    loaded?.stale ? 'stale' : 'live',
  ];
  return values.join('|');
}

function cachedPayload(dataset, key, builder) {
  const cache = payloadCache(dataset);
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  const value = builder();
  cache.set(key, value);
  while (cache.size > MAX_PAYLOAD_CACHE) cache.delete(cache.keys().next().value);
  return value;
}

function meta(dataset, loaded = {}) {
  return {
    version:dataset.version,
    sourceSpreadsheetId:dataset.sourceSpreadsheetId,
    counts:dataset.counts,
    quality:dataset.quality,
    source:IcdPublicSource.sourceMeta(loaded),
    search:{
      version:'sq-clinical-search-v1',
      engine:'clinical-ranking-v3',
      supports:[
        'code', 'normalized-code', 'sq-title', 'en-title', 'sq-synonym', 'editorial-alias',
        'typo', 'wildcard', 'hierarchy-groups', 'breadcrumbs', 'bounded-lru-cache',
      ],
      diagnosticDecision:false,
    },
  };
}

function candidatesFor(dataset, query, defaultLevels = 'category,subcategory') {
  const parent = clean(query.parent);
  const chapter = clean(query.chapter);
  const requestedLevels = clean(query.levels || query.level || defaultLevels)
    .split(',')
    .map(clean)
    .filter(Boolean);
  const levels = new Set(requestedLevels);
  const indexes = FullIcd.attachIndexes(dataset);

  let rows = dataset.nodes;
  if (parent) rows = indexes.childrenByParent.get(parent) || [];
  else if (chapter) rows = indexes.byChapter.get(chapter) || [];
  else if (levels.size) rows = requestedLevels.flatMap(level => indexes.byLevel.get(level) || []);

  return rows.filter(node => {
    if (parent && node.parentCode !== parent) return false;
    if (chapter && node.chapter !== chapter) return false;
    if (levels.size && !levels.has(node.level)) return false;
    return true;
  });
}

function tablePayload(dataset, query, loaded = {}) {
  const key = cacheKey('table', query, loaded);
  return cachedPayload(dataset, key, () => {
    const q = clean(query.q).slice(0, MAX_QUERY_CHARS);
    const parent = clean(query.parent);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const page = Math.max(1, Number(query.page) || 1);
    const runtime = searchRuntime(dataset);
    let rows = candidatesFor(runtime.searchableDataset, query);

    const ranked = Search.rankNodes(rows, q);
    rows = ranked.map(item => ({ ...restoreNode(item.node, runtime.originals), searchMatch:item.match ? {
      type:item.match.type,
      field:item.match.field,
      score:item.match.score,
      matchedTerm:item.match.matchedTerm || '',
      expandedTerm:item.match.expandedTerm || '',
      normalizedCode:item.match.normalizedCode || '',
      label:Search.MATCH_LABELS[item.match.type] || 'Përputhje',
    } : null }));

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const context = parent ? runtime.originals.get(parent) || null : null;

    return {
      meta:meta(dataset, loaded),
      query:q,
      page:safePage,
      pageSize,
      total,
      totalPages,
      rows:rows.slice(start, start + pageSize).map(node => compactNode(node, dataset)),
      context:compactNode(context, dataset),
      ancestors:context
        ? FullIcd.ancestorsOf(dataset, context.code).map(node => compactNode(node, dataset, { breadcrumb:false }))
        : [],
    };
  });
}

function suggestionPayload(dataset, query, loaded = {}) {
  const key = cacheKey('suggest', query, loaded);
  return cachedPayload(dataset, key, () => {
    const q = clean(query.q).slice(0, MAX_QUERY_CHARS);
    if (q.length < 2) {
      return {
        meta:meta(dataset, loaded),
        query:q,
        interpretedAs:'',
        interpretationType:'',
        normalizedCode:'',
        rows:[],
        groups:[],
        total:0,
        safetyNote:'Sugjerimet ndihmojnë kërkimin dhe kodimin; nuk vendosin diagnozë.',
      };
    }
    const runtime = searchRuntime(dataset);
    const result = Search.suggestDataset(runtime.searchableDataset, q, { limit:18 });
    const restoredRows = result.rows.map(node => restoreNode(node, runtime.originals));
    return {
      meta:meta(dataset, loaded),
      ...result,
      rows:restoredRows.map(node => compactNode(node, dataset)),
    };
  });
}

function send(req, res, payload, loaded, startedAt) {
  const body = JSON.stringify({ ok:true, data:payload });
  const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=900');
  res.setHeader('ETag', etag);
  res.setHeader('X-MedIndex-Search-Version', 'sq-clinical-search-v1');
  res.setHeader('X-MedIndex-Search-Engine', 'clinical-ranking-v3');
  res.setHeader('X-MedIndex-ICD-Source-State', loaded?.stale ? 'stale' : 'live');
  res.setHeader('X-MedIndex-ICD-Revision', loaded?.sourceRevision || 'unknown');
  res.setHeader('Server-Timing', `icd-search;dur=${Date.now() - startedAt}`);
  if (loaded?.stale) res.setHeader('Warning', '110 - "Response is stale"');
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
    const loaded = await IcdPublicSource.load();
    const view = clean(req.query?.view).toLowerCase() === 'suggest' ? 'suggest' : 'table';
    const payload = view === 'suggest'
      ? suggestionPayload(loaded.data, req.query || {}, loaded)
      : tablePayload(loaded.data, req.query || {}, loaded);
    return send(req, res, payload, loaded, startedAt);
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

module.exports._test = {
  searchableNode,
  restoreNode,
  searchRuntime,
  payloadCache,
  cacheKey,
  cachedPayload,
  candidatesFor,
  compactNode,
  tablePayload,
  suggestionPayload,
};
