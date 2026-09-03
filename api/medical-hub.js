'use strict';

const medicalHubImageHandler = require('../lib/medical-hub-image-handler.js');

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

const PRESCRIPTION_CHAPTER_QUERY = `*[_type == "prescriptionChapter" && reviewStatus != "archived"] | order(chapterNumber asc) {
  chapterNumber, title, hasPrescriptions, sourceNote, reviewStatus, version,
  "count": count(*[_type == "prescriptionGuide" && reviewStatus != "archived" && chapterNumber == ^.chapterNumber])
}`;

const PRESCRIPTION_GUIDE_QUERY = `*[_type == "prescriptionGuide" && reviewStatus != "archived" && chapterNumber == $chapter] | order(orderInChapter asc, title asc) {
  _id, title, "slug": slug.current, externalId, chapterNumber, chapterTitle, orderInChapter, keywords,
  logicBlocks[]{
    _key, order, relation, sourceConnectorLabel, condition, selection, note,
    items[]{
      _key, order, sourceNumber, kind, title, genericName, form, strength, dose, route,
      frequency, duration, sig, note
    }
  },
  sourceDocument, sourceHeading, sourcePageStart, sourcePageEnd, reviewStatus, version
}`;

const PRESCRIPTION_SEARCH_INDEX_QUERY = `*[_type == "prescriptionGuide" && reviewStatus != "archived"] | order(chapterNumber asc, orderInChapter asc) {
  _id, title, chapterNumber, chapterTitle, orderInChapter, keywords, sourceHeading,
  logicBlocks[]{
    relation, sourceConnectorLabel, condition, note,
    items[]{kind,title,genericName,form,strength,dose,route,frequency,duration,sig,note}
  }
}`;

let prescriptionSearchCache = { expiresAt:0, docs:[] };

function prescriptionSearchDocument(item) {
  const title = normalize([item?.title, item?.sourceHeading].filter(Boolean).join(' '));
  const chapter = normalize(item?.chapterTitle);
  const keywords = normalize(flattenStrings(item?.keywords).join(' '));
  const substances = normalize(flattenStrings((item?.logicBlocks || []).flatMap(block =>
    (block?.items || []).flatMap(entry => [entry?.genericName, entry?.title, entry?.form, entry?.strength])
  )).join(' '));
  const clinical = normalize(flattenStrings((item?.logicBlocks || []).flatMap(block => [
    block?.condition, block?.sourceConnectorLabel, block?.note,
    ...(block?.items || []).flatMap(entry => [
      entry?.dose, entry?.route, entry?.frequency, entry?.duration, entry?.sig, entry?.note,
    ]),
  ])).join(' '));
  return {
    item:{
      _id:item?._id,
      title:clean(item?.title || item?.sourceHeading),
      chapterNumber:Number(item?.chapterNumber) || 0,
      chapterTitle:clean(item?.chapterTitle),
      orderInChapter:Number(item?.orderInChapter) || 0,
    },
    title,
    chapter,
    keywords,
    substances,
    clinical,
    haystack:normalize([title, chapter, keywords, substances, clinical].join(' ')),
  };
}

async function getPrescriptionSearchIndex() {
  if (prescriptionSearchCache.expiresAt > Date.now() && prescriptionSearchCache.docs.length) {
    return prescriptionSearchCache.docs;
  }
  const items = await querySanity(PRESCRIPTION_SEARCH_INDEX_QUERY);
  const docs = (Array.isArray(items) ? items : []).map(prescriptionSearchDocument);
  prescriptionSearchCache = {
    expiresAt:Date.now() + SEARCH_CACHE_MS,
    docs,
  };
  return docs;
}

function editDistanceWithin(left, right, maxDistance = 2) {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length:right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length];
}

function fuzzyTokenScore(token, textValue) {
  if (!token || !textValue) return 0;
  if (textValue === token) return 120;
  if (textValue.startsWith(token)) return 90;
  if (textValue.includes(token)) return 72;

  const words = textValue.split(/\s+/).filter(Boolean);
  let best = 0;
  const maxDistance = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;
  if (!maxDistance) return 0;

  for (const word of words) {
    if (word === token) return 120;
    if (word.startsWith(token) || token.startsWith(word)) best = Math.max(best, 82);
    if (Math.abs(word.length - token.length) > maxDistance) continue;
    const distance = editDistanceWithin(token, word, maxDistance);
    if (distance <= maxDistance) {
      best = Math.max(best, distance === 1 ? 68 : 52);
    }
  }
  return best;
}

function scorePrescriptionSearch(doc, term, tokens) {
  let score = 0;
  if (doc.title === term) score += 1200;
  else if (doc.title.startsWith(term)) score += 900;
  else if (doc.title.includes(term)) score += 720;
  if (doc.substances === term) score += 780;
  else if (doc.substances.includes(term)) score += 520;
  if (doc.keywords.includes(term)) score += 420;
  if (doc.chapter.includes(term)) score += 200;
  if (doc.clinical.includes(term)) score += 140;

  let matched = 0;
  for (const token of tokens) {
    const weighted = Math.max(
      fuzzyTokenScore(token, doc.title) * 4,
      fuzzyTokenScore(token, doc.substances) * 3.4,
      fuzzyTokenScore(token, doc.keywords) * 2.5,
      fuzzyTokenScore(token, doc.chapter) * 1.7,
      fuzzyTokenScore(token, doc.clinical),
    );
    if (weighted > 0) {
      matched += 1;
      score += weighted;
    }
  }
  if (matched === tokens.length) score += 240;
  else if (matched === 0) return 0;
  else score -= (tokens.length - matched) * 100;
  return score;
}

async function searchPrescriptionGuides(rawQuery, limit = 40) {
  const term = normalize(rawQuery).slice(0, MAX_QUERY);
  if (!term || term.length < 2) return [];
  const tokens = term.split(/\s+/).filter(Boolean).slice(0, 8);
  const docs = await getPrescriptionSearchIndex();

  return docs
    .map(doc => ({ doc, score:scorePrescriptionSearch(doc, term, tokens) }))
    .filter(entry => entry.score > 0)
    .sort((a,b) => b.score - a.score
      || a.doc.item.chapterNumber - b.doc.item.chapterNumber
      || a.doc.item.orderInChapter - b.doc.item.orderInChapter)
    .slice(0, Math.min(Math.max(1, Number(limit) || 40), 80))
    .map(entry => ({
      ...entry.doc.item,
      score:Math.round(entry.score),
      lessonNumber:entry.doc.item.orderInChapter,
      label:`Kapitulli ${entry.doc.item.chapterNumber} · Mësimi ${entry.doc.item.orderInChapter}`,
    }));
}


function prescriptionChapters(rows) {
  const seen = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const number = Number(row?.chapterNumber);
    const title = clean(row?.title || row?.chapterTitle);
    if (!Number.isInteger(number) || number < 1 || !title || seen.has(number)) return;
    seen.set(number, {
      number,
      title,
      count:Math.max(0, Number(row?.count || 0)),
      hasPrescriptions:Boolean(row?.hasPrescriptions),
      sourceNote:clean(row?.sourceNote),
      reviewStatus:clean(row?.reviewStatus),
      version:clean(row?.version),
    });
  });
  return [...seen.values()].sort((a,b) => a.number - b.number);
}

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
  const requestedRoute = clean(queryValue(req, '_route')).toLowerCase();
  if (requestedRoute === 'image') return medicalHubImageHandler(req, res);

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
    if (requestedRoute === 'prescription-search') {
      const q = clean(queryValue(req, 'q')).slice(0, MAX_QUERY);
      if (q.length < 2) {
        return res.status(200).json({ ok:true, query:q, results:[], count:0, source:'sanity-prescription-smart-search' });
      }
      const results = await searchPrescriptionGuides(q, queryValue(req, 'limit'));
      return res.status(200).json({
        ok:true,
        query:q,
        results,
        count:results.length,
        source:'sanity-prescription-smart-search',
      });
    }

    if (requestedRoute === 'prescription-library') {
      const chapterRows = await querySanity(PRESCRIPTION_CHAPTER_QUERY);
      const chapters = prescriptionChapters(chapterRows);
      const rawChapter = clean(queryValue(req, 'chapter'));
      const requestedChapter = /^\d{1,2}$/.test(rawChapter) ? Number(rawChapter) : 0;
      const selectedChapter = requestedChapter && chapters.some(item => item.number === requestedChapter)
        ? requestedChapter
        : (chapters.find(item => item.hasPrescriptions && item.count > 0)?.number || chapters[0]?.number || 0);
      const chapterMeta = chapters.find(item => item.number === selectedChapter) || null;
      const items = selectedChapter && chapterMeta?.hasPrescriptions
        ? await querySanity(PRESCRIPTION_GUIDE_QUERY, { chapter:selectedChapter })
        : [];
      return res.status(200).json({
        ok:true,
        chapters,
        chapter:selectedChapter,
        chapterMeta,
        items:Array.isArray(items) ? items : [],
        count:Array.isArray(items) ? items.length : 0,
        source:'sanity-prescription-guides',
      });
    }

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
  prescriptionChapters,
};
