'use strict';

const dozologjia = require('../lib/dozologjia.js');
const registryHandler = require('./registry.js');

async function authorized(req) { return registryHandler.authorized(req); }

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

function requestUrl(req) {
  try { return new URL(req?.url || '/api/dosage', 'http://drx.local'); }
  catch { return new URL('http://drx.local/api/dosage'); }
}

async function bodyOf(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (!req || typeof req.on !== 'function') return {};
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 32_768) reject(new Error('Payload too large.'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (!(await authorized(req))) return send(res, 401, { ok:false, error:'UNAUTHORIZED' });

  const method = String(req?.method || 'GET').toUpperCase();
  const url = requestUrl(req);
  const view = url.searchParams.get('view') || 'substances';

  if (method === 'GET' && view === 'substances') {
    return send(res, 200, { ok:true, substances:dozologjia.substances(url.searchParams.get('q') || '') });
  }

  if (method === 'GET' && view === 'regimens') {
    const substanceId = url.searchParams.get('substance') || '';
    const substance = dozologjia.substanceById(substanceId);
    if (!substance) return send(res, 404, { ok:false, error:'Substanca aktive nuk u gjet.' });
    const regimens = dozologjia.regimens(substance.id, {
      population:url.searchParams.get('population') || '',
      route:url.searchParams.get('route') || '',
    });
    return send(res, 200, {
      ok:true,
      substance:{ id:substance.id, name:substance.name, atc:substance.atc },
      regimens,
    });
  }

  if (method === 'POST') {
    const body = await bodyOf(req);
    if (body.action !== 'calculate') return send(res, 400, { ok:false, error:'Veprim i panjohur.' });
    const result = dozologjia.calculate(body);
    if (result.outcome === 'NOT_FOUND') return send(res, 404, { ok:false, ...result });
    if (result.outcome === 'NEEDS_PATIENT_DATA') return send(res, 422, { ok:false, ...result });
    return send(res, 200, { ok:true, result });
  }

  const legacyViews = new Set([
    'calculator','safety','product-rules','card','cards','prescription','prescription-context',
    'approved-population','pediatric-search','pediatric-product','pediatric-calculate'
  ]);
  if (legacyViews.has(view)) {
    return send(res, 410, {
      ok:false,
      error:'Ky endpoint i Dozologjisë së vjetër është hequr. Përdor API-në e re substance-first.',
      replacement:'/api/dosage?view=substances'
    });
  }

  return send(res, 404, { ok:false, error:'Rruga e Dozologjisë nuk u gjet.' });
}

handler.authorized = authorized;
handler.requestUrl = requestUrl;
handler.bodyOf = bodyOf;
handler.engine = dozologjia;
module.exports = handler;
