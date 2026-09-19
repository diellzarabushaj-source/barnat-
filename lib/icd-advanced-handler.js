const crypto = require('node:crypto');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Search = require('../lib/icd-search-engine-v3.js');
const SymptomIntent = require('../lib/icd-symptom-intent.js');
const QkmfHot = require('../data/icd-qkmf-hot-search-v1.json');
const PrimaryCareAction = require('../data/icd-primary-care-action-v1.json');
const IcdPublicSource = require('../lib/icd-public-source.js');

const MAX_QUERY_CHARS = 160;
const MAX_PAYLOAD_CACHE = 240;
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
  const exactLatin = clean(node.latinTitle) || clean(FullIcd.LATIN_TITLE_BY_CODE?.get(node.code));
  let latinParentTitle = '';
  let latinParentCode = '';
  if (!exactLatin && clean(node.parentCode)) {
    const parent = FullIcd.attachIndexes(dataset).byCode.get(node.parentCode);
    const parentLatin = clean(parent?.latinTitle) || clean(FullIcd.LATIN_TITLE_BY_CODE?.get(node.parentCode));
    if (parentLatin) {
      latinParentTitle = parentLatin;
      latinParentCode = clean(node.parentCode);
    }
  }
  return {
    code:node.code,
    level:node.level,
    chapter:node.chapter,
    block:node.block,
    parentCode:node.parentCode,
    englishTitle:node.englishTitle,
    albanianDraft:node.albanianDraft,
    latinTitle:exactLatin,
    latinParentTitle,
    latinParentCode,
    displayTitle:node.displayTitle,
    translationStatus:node.translationStatus,
    primaryCareRole:node.primaryCareRole || '',
    managementSummary:node.managementSummary || '',
    urgencyLevel:node.urgencyLevel || 'none',
    isUrgent:Boolean(node.isUrgent),
    isDirectUrgency:Boolean(node.isDirectUrgency),
    sourceUrl:node.sourceUrl,
    childCount:FullIcd.childCountOf(dataset, node.code),
    breadcrumb:options.breadcrumb === false ? [] : breadcrumb(node, dataset),
    searchMatch:node.searchMatch || null,
    symptomRelation:node.symptomRelation || null,
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
    Search.normalize(clean(query.q)),
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
      version:'sq-clinical-search-v6',
      engine:'clinical-ranking-v8',
      supports:[
        'code', 'normalized-code', 'sq-title', 'en-title', 'la-title', 'sq-synonym', 'editorial-alias',
        'typo', 'adaptive-edit-distance', 'code-confusion-correction', 'trigram-candidate-index',
        'category-first', 'family-grouping', 'latin-parent-fallback', 'category-seed', 'instant-local-preview',
        'symptom-intent', 'symptom-typo', 'symptom-differential-retrieval', 'symptom-red-flags',
        'qkmf-hot-cache', 'hot-symptom-cache', 'zero-network-common-preview',
        'primary-care-action-panel', 'primary-care-quick-workspace', 'referral-template', 'working-diagnosis-summary',
        'wildcard', 'hierarchy-groups', 'breadcrumbs', 'bounded-lru-cache',
      ],
      symptomIntentVersion:SymptomIntent.DATASET.version,
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

function symptomDifferentialRows(dataset, intent) {
  if (!intent || intent.ambiguous || Number(intent.confidence || 0) < 0.78) return [];
  const indexes = FullIcd.attachIndexes(dataset);
  const rows = [];
  for (const candidate of intent.candidates || []) {
    const node = indexes.byCode.get(clean(candidate.code));
    if (!node) continue;
    rows.push({
      ...node,
      searchMatch:{
        type:'symptom-differential',
        field:'symptom',
        score:900 + Math.round(Number(candidate.retrieval_weight || 0) * 100),
        matchedTerm:intent.label_sq,
        expandedTerm:'',
        normalizedCode:'',
        label:'Nga simptoma',
        group:'suggested',
        groupLabel:'Sugjerime',
      },
      symptomRelation:{
        intentId:intent.id,
        symptomCode:intent.symptom_code || '',
        reason_sq:clean(candidate.reason_sq),
        retrievalWeight:Number(candidate.retrieval_weight || 0),
        urgent:Boolean(candidate.urgent),
      },
    });
  }
  return rows.sort((a, b) => Number(b.symptomRelation.retrievalWeight || 0) - Number(a.symptomRelation.retrievalWeight || 0)
    || clean(a.code).localeCompare(clean(b.code), 'en', { numeric:true }));
}

function mergeSymptomRows(baseRows, differentialRows, limit = 18) {
  if (!differentialRows.length) return baseRows.slice(0, limit);
  const seen = new Set();
  const merged = [];
  for (const row of [...differentialRows, ...baseRows]) {
    if (!row?.code || seen.has(row.code)) continue;
    seen.add(row.code);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
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
    const symptomIntent = SymptomIntent.intentPayload(q);
    const restoredRows = result.rows.map(node => restoreNode(node, runtime.originals));
    const differentialRows = symptomDifferentialRows(dataset, symptomIntent);
    const mergedRows = mergeSymptomRows(differentialRows, restoredRows, 18);
    return {
      meta:meta(dataset, loaded),
      ...result,
      symptomIntent,
      differentialCount:differentialRows.length,
      rows:mergedRows.map(node => compactNode(node, dataset)),
      safetyNote:symptomIntent
        ? symptomIntent.note_sq
        : result.safetyNote,
    };
  });
}

function guidanceEntryForCode(dataset, code) {
  const value = clean(code).toUpperCase();
  if (!value) return null;
  const entries = PrimaryCareAction.entries || [];
  const exact = entries.find(entry => clean(entry.code).toUpperCase() === value);
  if (exact) return { entry:exact, inheritedFrom:'' };

  const indexes = FullIcd.attachIndexes(dataset);
  let node = indexes.byCode.get(value) || null;
  const visited = new Set();
  while (node && clean(node.parentCode) && !visited.has(node.parentCode)) {
    visited.add(node.parentCode);
    const parentCode = clean(node.parentCode).toUpperCase();
    const parentEntry = entries.find(entry => clean(entry.code).toUpperCase() === parentCode);
    if (parentEntry) return { entry:parentEntry, inheritedFrom:parentCode };
    node = indexes.byCode.get(parentCode) || null;
  }

  if (value.includes('.')) {
    const categoryCode = value.slice(0, 3);
    const categoryEntry = entries.find(entry => clean(entry.code).toUpperCase() === categoryCode);
    if (categoryEntry) return { entry:categoryEntry, inheritedFrom:categoryCode };
  }
  return null;
}

function guidancePayload(dataset, query, loaded = {}) {
  const code = clean(query.code).toUpperCase().slice(0, 16);
  const match = guidanceEntryForCode(dataset, code);
  return {
    meta:meta(dataset, loaded),
    code,
    available:Boolean(match),
    inherited:Boolean(match?.inheritedFrom),
    inheritedFrom:match?.inheritedFrom || '',
    disclaimer:PrimaryCareAction.disclaimer || '',
    guidance:match?.entry || null,
  };
}

function guidanceListPayload(dataset, loaded = {}) {
  const items = (PrimaryCareAction.entries || []).map(entry => ({
    code:clean(entry.code).toUpperCase(),
    title_sq:clean(entry.title_sq),
    working_diagnosis:clean(entry.working_diagnosis),
    specialist:clean(entry.referral?.specialist),
    urgent:Boolean(entry.urgent),
    red_flag_count:Array.isArray(entry.red_flags) ? entry.red_flags.length : 0,
  }));
  return {
    meta:meta(dataset, loaded),
    kind:'primary-care-guidance-index',
    version:PrimaryCareAction.version || 1,
    disclaimer:PrimaryCareAction.disclaimer || '',
    total:items.length,
    items,
  };
}

function hotPayload(dataset, loaded = {}) {
  const key = cacheKey('hot', {}, loaded);
  return cachedPayload(dataset, key, () => {
    const indexes = FullIcd.attachIndexes(dataset);
    const quick = (QkmfHot.rows || []).map(item => {
      const node = indexes.byCode.get(clean(item.code));
      if (!node) return null;
      return {
        code:item.code,
        label_sq:item.label_sq,
        aliases:Array.isArray(item.aliases) ? item.aliases : [],
        urgent:Boolean(item.urgent),
        node:compactNode(node, dataset, { breadcrumb:false }),
      };
    }).filter(Boolean);

    const symptoms = (SymptomIntent.DATASET.concepts || []).map(concept => {
      const intent = SymptomIntent.intentPayload(concept.label_sq);
      if (!intent) return null;
      const rows = symptomDifferentialRows(dataset, intent).map(node => compactNode(node, dataset, { breadcrumb:false }));
      return {
        id:intent.id,
        label_sq:intent.label_sq,
        symptom_code:intent.symptom_code,
        aliases:Array.isArray(concept.aliases) ? concept.aliases : [],
        red_flags:Array.isArray(intent.red_flags) ? intent.red_flags : [],
        candidates:rows,
      };
    }).filter(Boolean);

    return {
      meta:meta(dataset, loaded),
      kind:'qkmf-hot-search',
      version:QkmfHot.version,
      quick,
      symptoms,
      counts:{ quick:quick.length, symptoms:symptoms.length },
    };
  });
}

function seedPayload(dataset, loaded = {}) {
  const key = cacheKey('seed', {}, loaded);
  return cachedPayload(dataset, key, () => {
    const runtime = searchRuntime(dataset);
    const categories = candidatesFor(runtime.searchableDataset, { levels:'category' }, 'category')
      .map(node => restoreNode(node, runtime.originals))
      .map(node => {
        const compact = compactNode(node, dataset, { breadcrumb:false });
        return {
          code:compact.code,
          level:compact.level,
          chapter:compact.chapter,
          block:compact.block,
          parentCode:compact.parentCode,
          englishTitle:compact.englishTitle,
          albanianDraft:compact.albanianDraft,
          latinTitle:compact.latinTitle,
          latinParentTitle:compact.latinParentTitle,
          latinParentCode:compact.latinParentCode,
          displayTitle:compact.displayTitle,
          childCount:compact.childCount,
        };
      });

    return {
      meta:meta(dataset, loaded),
      rows:categories,
      total:categories.length,
      kind:'category-seed',
    };
  });
}

function send(req, res, payload, loaded, startedAt) {
  const body = JSON.stringify({ ok:true, data:payload });
  const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=120, stale-while-revalidate=900');
  res.setHeader('ETag', etag);
  res.setHeader('X-MedIndex-Search-Version', 'sq-clinical-search-v6');
  res.setHeader('X-MedIndex-Search-Engine', 'clinical-ranking-v8');
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
    const requestedView = clean(req.query?.view).toLowerCase();
    const view = requestedView === 'suggest' ? 'suggest'
      : requestedView === 'seed' ? 'seed'
        : requestedView === 'hot' ? 'hot'
          : requestedView === 'guidance' ? 'guidance'
            : requestedView === 'guidance-list' ? 'guidance-list'
              : 'table';
    const payload = view === 'suggest'
      ? suggestionPayload(loaded.data, req.query || {}, loaded)
      : view === 'seed'
        ? seedPayload(loaded.data, loaded)
        : view === 'hot'
          ? hotPayload(loaded.data, loaded)
          : view === 'guidance'
            ? guidancePayload(loaded.data, req.query || {}, loaded)
            : view === 'guidance-list'
              ? guidanceListPayload(loaded.data, loaded)
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
  symptomDifferentialRows,
  mergeSymptomRows,
  suggestionPayload,
  hotPayload,
  guidanceEntryForCode,
  guidancePayload,
  guidanceListPayload,
  seedPayload,
};
