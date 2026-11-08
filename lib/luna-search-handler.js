'use strict';

const Luna = require('./luna-search-core.js');
const DrugSearch = require('../api/drug-search.js');
const { supabaseRequest } = require('./supabase-data-api.js');
const SharedBudget = require('./shared-request-budget.js');

const WINDOW_MS = 60 * 1000;
const MAX_PER_MINUTE = 6;
const MAX_BODY_BYTES = 4096;
const tracked = new Map();

function enabled() {
  // Paid AI endpoint must never run without cross-instance request budgeting.
  return process.env.DRX_LUNA_ENABLED === '1'
    && SharedBudget.enabled()
    && Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const site = String(req.headers?.['sec-fetch-site'] || '');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  if (!origin) return true; // Non-browser clients still require a signed session.
  const host = String(req.headers?.host || '').toLowerCase();
  try { return Boolean(host && new URL(origin).host.toLowerCase() === host && ['https:', 'http:'].includes(new URL(origin).protocol)); }
  catch { return false; }
}

function throttle(subject, now = Date.now()) {
  for (const [key, state] of tracked) if (now - state.startedAt >= WINDOW_MS) tracked.delete(key);
  while (tracked.size > 1000) tracked.delete(tracked.keys().next().value);
  const state = tracked.get(subject) || { count:0, startedAt:now };
  state.count += 1;
  tracked.set(subject, state);
  return { allowed:state.count <= MAX_PER_MINUTE, remaining:Math.max(0, MAX_PER_MINUTE-state.count), reset:Math.max(1, Math.ceil((WINDOW_MS-(now-state.startedAt))/1000)) };
}

function readQuestion(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return null;
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(raw) : req.body; }
  catch { return null; }
  return typeof body?.question === 'string' ? body.question.trim() : null;
}

module.exports = async function lunaSearch(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET' && (req.query?.status === '1' || new URL(req.url || '/api/luna-search', 'https://drx.local').searchParams.get('status') === '1')) {
    return res.status(200).json({ ok:true, enabled:enabled(), model:Luna.MODEL });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ ok:false, code:'METHOD_NOT_ALLOWED' });
  }
  if (!enabled()) return res.status(503).json({ ok:false, code:'LUNA_NOT_CONFIGURED', error:'Kërkimi Luna nuk është aktivizuar ende.' });
  if (!sameOrigin(req)) return res.status(403).json({ ok:false, code:'ORIGIN_DENIED', error:'Kërkesë nga origjinë e palejuar.' });
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ ok:false, code:'JSON_REQUIRED' });
  }

  try {
    const Auth = await import('./auth.mjs');
    const session = Auth.sessionData(Auth.sessionFromRequest(req));
    if (!Auth.isSupabaseSession(session)) return res.status(401).json({ ok:false, code:'AUTH_REQUIRED', error:'Hyr në llogarinë e aprovuar të DRx.' });
    const question = readQuestion(req);
    if (!Luna.validQuestion(question)) return res.status(400).json({ ok:false, code:'INVALID_QUERY', error:'Shkruaj vetëm emër bari, substancë ose ATC, pa të dhëna identifikuese të pacientit (maksimumi 220 karaktere).' });

    const budget = throttle(session.authUid);
    res.setHeader('RateLimit-Limit', String(MAX_PER_MINUTE));
    res.setHeader('RateLimit-Remaining', String(budget.remaining));
    res.setHeader('RateLimit-Reset', String(budget.reset));
    if (!budget.allowed) {
      res.setHeader('Retry-After', String(budget.reset));
      return res.status(429).json({ ok:false, code:'LUNA_RATE_LIMIT', error:'Shumë kërkime. Provo përsëri pas pak.' });
    }
    if (!await SharedBudget.enforce(res, [['luna-user',session.authUid,MAX_PER_MINUTE,60]])) return;

    const terms = await Luna.extractTerms(question, String(process.env.OPENAI_API_KEY).trim());
    const results = await Luna.findPublishedDrugs(terms, DrugSearch, supabaseRequest);
    return res.status(200).json({ ok:true, model:Luna.MODEL, terms, results, registry:'DRx / Supabase', note:'Rezultatet janë nga regjistri i publikuar. Luna nuk llogarit doza dhe nuk rekomandon trajtim.' });
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    console.warn('DRx Luna request failed:', error?.code || 'LUNA_REQUEST_FAILED');
    return res.status(status).json({ ok:false, code:error?.code || 'LUNA_UNAVAILABLE', error:status === 429 ? 'Kufiri i kërkesave Luna u arrit.' : 'Kërkimi Luna nuk është i disponueshëm tani.' });
  }
};

module.exports._test = { enabled, sameOrigin, throttle, readQuestion };
