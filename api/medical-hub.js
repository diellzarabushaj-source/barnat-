'use strict';

const PROJECT_ID = '4wdtp8cz';
const DATASET = 'production';
const API_VERSION = '2026-08-30';
const SANITY_URL = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}`;
const SEARCH_CACHE_MS = 45 * 1000;
const INDEX_CACHE_MS = 20 * 1000;
const MAX_RESULTS = 120;
const MAX_QUERY = 120;

const INDEX_QUERY = `*[_type == "learningTopic" && reviewStatus != "archived" && contentKind != "section"] | order(chapterNumber asc, lessonNumber asc) {
  _id, question, title, "slug": slug.current, keywords, icdCodes, procedureCodes, summary,
  contentKind, chapterNumber, lessonNumber, reviewStatus, reviewedBy, lastReviewedAt, version, sourceRxTitle,
  "stepCount": count(steps), "prescriptionCount": count(prescriptions),
  "protocolCount": count(relatedProtocols), "childCount": count(relatedTopics)
}`;

const DETAIL_QUERY = `*[_type == "learningTopic" && _id == $id && reviewStatus != "archived"][0] {
  _id, question, title, "slug": slug.current, keywords, icdCodes, procedureCodes, summary,
  contentKind, chapterNumber, lessonNumber, sourceRxTitle,
  contentOrder[]{_key,kind,refKey,title,text},
  steps[]{_key,title,action,why,setting,priority,note},
  prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
  figures[]{_key,title,caption,alt,url,sourceUrl,credit,kind,order},
  sources[]{_key,title,organization,url,publishedAt,note},
  redFlags, whenToRefer, reviewStatus, reviewedBy, lastReviewedAt, version,
  relatedProtocols[]->{_id,title,"slug":slug.current,summary,reviewStatus},
  relatedTopics[]->{_id,question,title,"slug":slug.current,summary,keywords,icdCodes,procedureCodes,contentKind,chapterNumber,lessonNumber,sectionNumber,sourceRxTitle,
    contentOrder[]{_key,kind,refKey,title,text},
    steps[]{_key,title,action,why,setting,priority,note},
    prescriptions[]{_key,medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    figures[]{_key,title,caption,alt,url,sourceUrl,credit,kind,order},
    redFlags,whenToRefer,sources[]{_key,title,organization,url,publishedAt,note},reviewStatus,version}
}`;

const SEARCH_INDEX_QUERY = `*[_type == "learningTopic" && reviewStatus != "archived" && contentKind != "section"] {
  _id, question, title, "slug": slug.current, keywords, icdCodes, procedureCodes, summary,
  contentKind, chapterNumber, lessonNumber, reviewStatus, reviewedBy, lastReviewedAt, version,
  "stepCount": count(steps), "prescriptionCount": count(prescriptions),
  "protocolCount": count(relatedProtocols), "childCount": count(relatedTopics),
  steps[]{title,action,why,setting,priority,note},
  prescriptions[]{medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
  figures[]{title,caption,alt,kind},
  sources[]{title,organization,note},
  redFlags, whenToRefer,
  "nested": relatedTopics[]->{
    question,title,summary,keywords,icdCodes,procedureCodes,
    steps[]{title,action,why,setting,priority,note},
    prescriptions[]{medicine,genericName,form,strength,dose,route,frequency,duration,quantity,instructions,patientGroup,clinicalNote},
    figures[]{title,caption,alt,kind},
    redFlags,whenToRefer,sources[]{title,organization,note}
  }
}`;

let indexCache = { expiresAt:0, items:[] };
let searchCache = { expiresAt:0, items:[] };

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = value => clean(value)
  .toLocaleLowerCase('sq')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

function queryValue(req, name) {
  if (req.query?.[name] !== undefined) {
    const value = Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
    return String(value || '');
  }
  try { return new URL(String(req.url || ''), 'https://drx.local').searchParams.get(name) || ''; }
  catch { return ''; }
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

async function querySanity(query, params = {}) {
  const url = new URL(SANITY_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('perspective', 'published');
  url.searchParams.set('returnQuery', 'false');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method:'GET',
      headers:{ Accept:'application/json' },
      cache:'no-store',
      signal:controller.signal,
    });
    if (!response.ok) throw new Error(`Sanity ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.description || 'Sanity query failed');
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

async function getIndex() {
  if (indexCache.expiresAt > Date.now() && indexCache.items.length) return indexCache.items;
  const items = await querySanity(INDEX_QUERY);
  indexCache = { expiresAt:Date.now() + INDEX_CACHE_MS, items:Array.isArray(items) ? items : [] };
  return indexCache.items;
}

function flattenStrings(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = clean(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach(entry => flattenStrings(entry, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(entry => flattenStrings(entry, output));
  }
  return output;
}

function searchDocument(item) {
  const fields = flattenStrings({
    question:item.question,
    title:item.title,
    summary:item.summary,
    sourceRxTitle:item.sourceRxTitle,
    keywords:item.keywords,
    icdCodes:item.icdCodes,
    procedureCodes:item.procedureCodes,
    steps:item.steps,
    prescriptions:item.prescriptions,
    figures:item.figures,
    sources:item.sources,
    redFlags:item.redFlags,
    whenToRefer:item.whenToRefer,
    nested:item.nested,
  });
  return {
    item,
    haystack:normalize(fields.join(' ')),
    title:normalize([item.question, item.title].filter(Boolean).join(' ')),
    codes:normalize(flattenStrings([item.icdCodes, item.procedureCodes]).join(' ')),
  };
}

async function getSearchIndex() {
  if (searchCache.expiresAt > Date.now() && searchCache.items.length) return searchCache.items;
  const items = await querySanity(SEARCH_INDEX_QUERY);
  const docs = (Array.isArray(items) ? items : []).map(searchDocument);
  searchCache = { expiresAt:Date.now() + SEARCH_CACHE_MS, items:docs };
  return docs;
}

function publicItem(item) {
  if (!item || typeof item !== 'object') return null;
  const {
    steps, prescriptions, figures, sources, redFlags, whenToRefer, nested, ...rest
  } = item;
  return rest;
}

function scoreDocument(doc, term, tokens) {
  let score = 0;
  if (doc.codes === term) score += 1000;
  if (doc.codes.includes(term)) score += 700;
  if (doc.title === term) score += 650;
  if (doc.title.startsWith(term)) score += 500;
  if (doc.title.includes(term)) score += 360;
  if (doc.haystack.includes(term)) score += 180;
  for (const token of tokens) {
    if (doc.title.includes(token)) score += 55;
    if (doc.codes.includes(token)) score += 85;
    else if (doc.haystack.includes(token)) score += 18;
  }
  return score;
}

async function searchItems(rawQuery, chapter) {
  const term = normalize(rawQuery).slice(0, MAX_QUERY);
  if (!term) return [];
  const tokens = term.split(/\s+/).filter(Boolean);
  const chapterNo = /^\d{1,2}$/.test(chapter) ? Number(chapter) : null;
  const docs = await getSearchIndex();

  return docs
    .filter(doc => chapterNo == null || Number(doc.item.chapterNumber) === chapterNo)
    .filter(doc => tokens.every(token => doc.haystack.includes(token)))
    .map(doc => ({ score:scoreDocument(doc, term, tokens), item:publicItem(doc.item) }))
    .sort((a,b) => b.score - a.score
      || Number(a.item.chapterNumber || 999) - Number(b.item.chapterNumber || 999)
      || Number(a.item.lessonNumber || 0) - Number(b.item.lessonNumber || 0))
    .slice(0, MAX_RESULTS)
    .map(entry => entry.item);
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'Method not allowed' });
  }

  if (!(await authorized(req))) {
    return res.status(401).json({ ok:false, error:'Kërkohet autentikim.' });
  }

  try {
    const id = clean(queryValue(req, 'id'));
    const mode = clean(queryValue(req, 'mode')).toLowerCase() || 'index';

    if (id) {
      if (!/^[a-z0-9._-]{1,180}$/i.test(id)) {
        return res.status(400).json({ ok:false, error:'ID e pavlefshme.' });
      }
      const item = await querySanity(DETAIL_QUERY, { id });
      if (!item) return res.status(404).json({ ok:false, error:'Tema nuk u gjet.' });
      return res.status(200).json({ ok:true, item, source:'sanity-published' });
    }

    if (mode === 'search') {
      const q = clean(queryValue(req, 'q')).slice(0, MAX_QUERY);
      const chapter = clean(queryValue(req, 'chapter'));
      const items = await searchItems(q, chapter);
      return res.status(200).json({
        ok:true,
        items,
        count:items.length,
        source:'sanity-published-search',
      });
    }

    if (mode !== 'index') return res.status(400).json({ ok:false, error:'Mode i panjohur.' });

    const items = await getIndex();
    return res.status(200).json({
      ok:true,
      items,
      count:items.length,
      generatedAt:new Date().toISOString(),
      source:'sanity-published-index',
    });
  } catch (error) {
    console.error('[medical-hub-api]', error?.message || error);
    return res.status(502).json({
      ok:false,
      error:'Medical Hub nuk mund të lidhet me Sanity për momentin.',
    });
  }
};

module.exports._test = {
  normalize,
  flattenStrings,
  searchDocument,
  scoreDocument,
  publicItem,
};
