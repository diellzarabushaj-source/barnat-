'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Neon = require('../lib/neon-clinical-reader.js');
const Sheets = require('../lib/sheets-icd-reader.js');

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();
const pending = new Map();

function requestScope(req) {
  const queryScope = String(req.query?.scope || '').trim().toLowerCase();
  if (queryScope === 'labs') return 'labs';
  try {
    const scope = new URL(req.url || '/api/icd', 'https://medindex.local').searchParams.get('scope');
    return scope === 'labs' ? 'labs' : 'icd';
  } catch {
    return 'icd';
  }
}

async function buildNeonIcdDataset() {
  const result = await Neon.getPublishedIcdCodes();
  const entries = result.entries;
  return {
    source:'Neon Postgres · kopje e sinkronizuar nga Google Sheet-i i aprovuar',
    sourceSpreadsheetId:'19ncbnrTJ_w-WQ0msWO9_dUoxjmicSUAz6Nt4sh20gFw',
    version:'ICD-10-WHO 2019',
    generatedAt:new Date().toISOString(),
    counts:{
      total:entries.length,
      familyMedicine:entries.filter(entry => entry.isFamilyMedicine).length,
      emergency:entries.filter(entry => entry.isEmergency).length,
      critical:entries.filter(entry => entry.isCritical).length,
    },
    entries,
    dataSource:'neon',
    neonQueryMs:result.queryMs,
  };
}

async function resolveIcd(mode) {
  if (mode === 'sheets') return Sheets.buildSheetsIcdDataset();
  try {
    return await buildNeonIcdDataset();
  } catch (error) {
    if (!Neon.allowSheetsFallback(mode)) throw error;
    console.warn(`ICD Neon fallback: ${error.message}`);
    const dataset = await Sheets.buildSheetsIcdDataset();
    dataset.neonError = error.message;
    dataset.dataSource = 'sheets-fallback';
    return dataset;
  }
}

async function buildLabsDataset(mode) {
  if (mode === 'sheets') {
    const error = new Error('Analizat përdorin fallback-un statik lokal në mënyrën sheets.');
    error.status = 503;
    throw error;
  }
  const result = await Neon.getPublishedLabTests();
  const json = JSON.stringify(result.data);
  return {
    generatedAt:result.data.generatedAt,
    counts:{ total:result.data.tests.length, categories:result.data.categories.length },
    gzipBase64:zlib.gzipSync(Buffer.from(json, 'utf8'), { level:9 }).toString('base64'),
    dataSource:'neon',
    neonQueryMs:result.queryMs,
  };
}

async function buildResult(scope, mode) {
  const data = scope === 'labs' ? await buildLabsDataset(mode) : await resolveIcd(mode);
  const body = scope === 'labs'
    ? JSON.stringify({ ok:true, data:{
      generatedAt:data.generatedAt,
      counts:data.counts,
      dataSource:data.dataSource,
    }, gzipBase64:data.gzipBase64 })
    : JSON.stringify({ ok:true, data });
  return {
    loadedAt:Date.now(),
    body,
    data,
    etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
  };
}

async function loadResult(scope) {
  const mode = Neon.dataSourceMode();
  const key = `${scope}:${mode}`;
  const current = cache.get(key);
  if (current && Date.now() - current.loadedAt < CACHE_TTL_MS) return current;
  if (!pending.has(key)) {
    pending.set(key, buildResult(scope, mode).then(result => {
      cache.set(key, result);
      return result;
    }).finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const scope = requestScope(req);
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

  try {
    const result = await loadResult(scope);
    const source = result.data.dataSource || 'unknown';
    res.setHeader('ETag', result.etag);
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-MedIndex-Data-Source', source);
    if (scope === 'labs') {
      res.setHeader('X-MedIndex-Lab-Tests', String(result.data.counts.total));
      res.setHeader('X-MedIndex-Lab-Categories', String(result.data.counts.categories));
    } else {
      res.setHeader('X-MedIndex-ICD-Codes', String(result.data.counts.total));
      res.setHeader('X-MedIndex-ICD-Source', source);
    }
    res.setHeader('Server-Timing', [
      `${scope};dur=${Date.now() - startedAt}`,
      result.data.neonQueryMs != null ? `neon;dur=${result.data.neonQueryMs}` : '',
    ].filter(Boolean).join(', '));
    if (req.headers['if-none-match'] === result.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).send(result.body);
  } catch (error) {
    console.error(`${scope.toUpperCase()} data load failed:`, error);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-MedIndex-Data-Source', scope === 'labs' ? 'local-static-fallback' : 'unavailable');
    return res.status(error.status || 502).json({
      error:scope === 'labs'
        ? 'Analizat nuk u ngarkuan nga Neon; përdoret kopja lokale.'
        : 'Të dhënat ICD-10 nuk u ngarkuan.',
      ok:false,
      data:null,
    });
  }
};

module.exports.buildNeonIcdDataset = buildNeonIcdDataset;
module.exports.buildLabsDataset = buildLabsDataset;
