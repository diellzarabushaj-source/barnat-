const handler = require('../lib/gemini-prescription.js');

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 8;
const MAX_TRACKED_CLIENTS = 1000;
const MAX_BODY_BYTES = 48 * 1024;
const requests = new Map();

function clientKey(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function prune(now = Date.now()) {
  for (const [key, state] of requests) {
    if (!state || now - state.startedAt >= WINDOW_MS) requests.delete(key);
  }
  while (requests.size > MAX_TRACKED_CLIENTS) requests.delete(requests.keys().next().value);
}

function rateLimit(req, res) {
  const now = Date.now();
  prune(now);
  const key = clientKey(req);
  const current = requests.get(key);
  const state = !current || now - current.startedAt >= WINDOW_MS
    ? { count:0, startedAt:now }
    : current;
  state.count += 1;
  requests.set(key, state);
  const remaining = Math.max(0, MAX_REQUESTS - state.count);
  const resetSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - state.startedAt)) / 1000));
  res.setHeader('RateLimit-Limit', String(MAX_REQUESTS));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  if (state.count <= MAX_REQUESTS) return true;
  res.setHeader('Retry-After', String(resetSeconds));
  res.status(429).json({ code:'GEMINI_RATE_LIMIT', error:'Shumë kërkesa për Gemini. Provo përsëri pas pak.' });
  return false;
}

function bodySize(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared >= 0) return declared;
  try { return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8'); }
  catch { return MAX_BODY_BYTES + 1; }
}

module.exports = async function secureGeminiPrescription(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }

  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return res.status(415).json({ error:'Kërkohet Content-Type application/json.' });
  }
  if (bodySize(req) > MAX_BODY_BYTES) {
    return res.status(413).json({ error:'Kërkesa është tepër e madhe.' });
  }
  if (!rateLimit(req, res)) return;
  return handler(req, res);
};

module.exports._test = { bodySize, clientKey, MAX_BODY_BYTES, MAX_REQUESTS, WINDOW_MS };
