'use strict';

// Production gateway hotfix for ranked registry search.
// The original handler correctly builds a PostgREST RPC request as POST,
// but the search execution path forwarded the browser GET method/body instead.
// This gateway keeps every non-search view on the existing handler and only
// repairs the two ranked-search response shapes.

const core = require('./drug-search.js');
const registryHandler = require('./registry.js');
const { supabaseRequest } = require('../lib/supabase-data-api.js');

const REGISTRY_DEFAULT_PAGE_SIZE = core.REGISTRY_DEFAULT_PAGE_SIZE || 25;
const REGISTRY_MAX_PAGE_SIZE = core.REGISTRY_MAX_PAGE_SIZE || 50;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function requestQuery(req) {
  if (req?.query && typeof req.query === 'object') return req.query;
  try {
    return Object.fromEntries(new URL(req?.url || '/api/drug-search', 'https://drx.local').searchParams);
  } catch {
    return {};
  }
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function setHeaders(res, startedAt, timing) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-MedIndex-Data-Source', 'supabase');
  res.setHeader('X-MedIndex-Search-Transport', 'rpc-post-v5');
  res.setHeader('Server-Timing', `${timing};dur=${Date.now() - startedAt}`);
}

async function sendFixedSearch(req, res, startedAt, view, query) {
  const registryMode = view === 'registry-search';
  const requestedLimit = registryMode
    ? boundedInteger(query.pageSize, REGISTRY_DEFAULT_PAGE_SIZE, 1, REGISTRY_MAX_PAGE_SIZE)
    : query.limit;
  const request = core.buildSearchPath(query.q, requestedLimit);

  setHeaders(res, startedAt, registryMode ? 'supabase-ranked-registry-search-v5' : 'supabase-drug-search-v5');

  if (!request) {
    if (req.method === 'HEAD') return res.status(200).end();
    if (registryMode) {
      return res.status(200).json({
        ok:true,
        rows:[],
        pagination:{page:1,pageSize:requestedLimit || REGISTRY_DEFAULT_PAGE_SIZE,total:0,totalPages:1,hasPrevious:false,hasNext:false},
        query:{q:''},
        meta:{source:'supabase',searchVersion:'v5',ranked:true,transport:'rpc-post'},
      });
    }
    return res.status(200).json({
      ok:true,
      query:'',
      results:[],
      meta:{source:'supabase',searchVersion:'v5',transport:'rpc-post'},
    });
  }

  // Critical fix: use the RPC request's POST method and JSON body, not the
  // incoming browser GET method/body. This applies to every drug query.
  const { data } = await supabaseRequest(request.path, {
    method:request.method,
    body:request.body,
    timeoutMs:5000,
    label:registryMode ? 'Supabase ranked registry search v5' : 'Supabase ranked drug search v5',
  });

  const rows = Array.isArray(data) ? data.map(core.searchRow) : [];
  if (req.method === 'HEAD') return res.status(200).end();

  if (registryMode) {
    return res.status(200).json({
      ok:true,
      rows,
      pagination:{page:1,pageSize:request.limit,total:rows.length,totalPages:1,hasPrevious:false,hasNext:false},
      query:{q:request.q},
      meta:{source:'supabase',searchVersion:'v5',ranked:true,limit:request.limit,transport:'rpc-post'},
    });
  }

  return res.status(200).json({
    ok:true,
    query:request.q,
    results:rows,
    meta:{source:'supabase',searchVersion:'v5',limit:request.limit,transport:'rpc-post'},
  });
}

async function handler(req, res) {
  const startedAt = Date.now();
  const query = requestQuery(req);
  const view = clean(query.view).toLowerCase();

  // Paging, detail, personal library and ATC counts keep the proven path.
  if (view && view !== 'registry-search') return core(req, res);

  try {
    if (!['GET', 'HEAD'].includes(req.method)) return core(req, res);

    if (!(await registryHandler.authorized(req))) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
    }

    return await sendFixedSearch(req, res, startedAt, view, query);
  } catch (error) {
    console.error('Supabase fixed drug-search error:', error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-MedIndex-Data-Source', 'supabase');
    return res.status(500).json({
      error:'Regjistri nuk u ngarkua.',
      detail:clean(error?.message).slice(0, 240),
    });
  }
}

// Preserve all exported builders/constants used by tests and other modules.
Object.assign(handler, core);
handler.sendFixedSearch = sendFixedSearch;
module.exports = handler;
