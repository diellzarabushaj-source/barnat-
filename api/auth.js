const crypto = require('node:crypto');
const { neonRequest, exactCount } = require('../lib/neon-data-api');
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_CLIENTS = 2000;
const MAX_BODY_BYTES = 4096;
const MAX_PASSWORD_CHARS = 128;

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function pruneAttempts(now = Date.now()) {
  attempts.forEach((state, ip) => {
    if (!state || now - state.startedAt > WINDOW_MS) attempts.delete(ip);
  });
  while (attempts.size > MAX_TRACKED_CLIENTS) attempts.delete(attempts.keys().next().value);
}

function activeAttemptState(ip, now = Date.now()) {
  pruneAttempts(now);
  const state = attempts.get(ip);
  if (!state || now - state.startedAt > WINDOW_MS) {
    const fresh = { count:0, startedAt:now };
    attempts.set(ip, fresh);
    return fresh;
  }
  return state;
}

function setRateLimitHeaders(res, state, now = Date.now()) {
  const remaining = Math.max(0, MAX_ATTEMPTS - state.count);
  const resetSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - state.startedAt)) / 1000));
  res.setHeader('RateLimit-Limit', String(MAX_ATTEMPTS));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));
  return resetSeconds;
}

function declaredBodySize(req) {
  const declared = Number(req.headers['content-length']);
  return Number.isFinite(declared) && declared >= 0 ? declared : null;
}

async function readBody(req) {
  const declared = declaredBodySize(req);
  if (declared !== null && declared > MAX_BODY_BYTES) throw Object.assign(new Error('Kërkesa është tepër e madhe.'), { code:'BODY_TOO_LARGE' });
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Kërkesa është tepër e madhe.'), { code:'BODY_TOO_LARGE' });
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Kërkesa është tepër e madhe.'), { code:'BODY_TOO_LARGE' });
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Kërkesa është tepër e madhe.'), { code:'BODY_TOO_LARGE' });
  }
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

function queryValue(req, key) {
  try { return new URL(req.url || '/api/auth', 'https://medindex.local').searchParams.get(key); }
  catch { return null; }
}

function resetRequested(req) {
  return req.method === 'GET' && queryValue(req, 'reset') === '1';
}

function oidcDiagnosticRequested(req) {
  return req.method === 'GET' && queryValue(req, 'diagnostic') === 'oidc';
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function decodeJwtPayload(token) {
  const segment = String(token || '').split('.')[1] || '';
  if (!segment) return {};
  try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); }
  catch { return {}; }
}

async function visibleDosageCount() {
  const path = 'dosage_regimens?select=id&editorial_status=eq.published'
    + '&calculation_status=in.(text_verified,calculable_verified)&limit=1';
  const { response } = await neonRequest(path, {
    headers:{ Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

async function databaseAuthorizationState() {
  const { data } = await neonRequest('rpc/medindex_vercel_authorized', {
    method:'POST',
    body:{},
  });
  if (Array.isArray(data)) return Boolean(data[0]);
  return Boolean(data);
}

async function hashedOidcDiagnostic() {
  const oidc = await import('@vercel/oidc');
  const token = process.env.VERCEL_OIDC_TOKEN || await oidc.getVercelOidcToken();
  const payload = decodeJwtPayload(token);
  const result = {
    available:Boolean(token),
    subjectHash:hash(payload.sub),
    ownerHash:hash(payload.owner),
    projectHash:hash(payload.project),
    environment:String(payload.environment || ''),
    issuerHash:hash(payload.iss),
    databaseAuthorized:null,
    visibleDosageRows:null,
  };
  try {
    [result.databaseAuthorized, result.visibleDosageRows] = await Promise.all([
      databaseAuthorizationState(),
      visibleDosageCount(),
    ]);
  } catch (error) {
    result.databaseErrorHash = hash(error?.message || error);
  }
  return result;
}

function browserResetPage() {
  return `<!doctype html>
<html lang="sq">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta http-equiv="refresh" content="3;url=/login.html?reset-complete=1">
  <title>Po pastrohet MedIndex</title>
  <style>
    *{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:20px;background:#eef4f2;color:#173238;font-family:Arial,sans-serif}.card{width:min(440px,100%);padding:28px;border:1px solid #d8e2df;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(13,71,75,.18)}.mark{width:54px;height:54px;display:grid;place-items:center;margin-bottom:18px;border-radius:14px;background:#0d474b;color:#fff;font-size:24px;font-weight:800}.mark span{color:#efb660}h1{margin:0 0 10px;font-size:25px;line-height:1.2;color:#0d474b}p{margin:0 0 16px;color:#607277;line-height:1.55}.bar{height:8px;overflow:hidden;border-radius:999px;background:#e4efec}.bar::after{content:"";display:block;width:55%;height:100%;border-radius:inherit;background:#155f64;animation:move 1s ease-in-out infinite alternate}a{display:inline-block;margin-top:18px;color:#0d474b;font-weight:700}@keyframes move{to{transform:translateX(82%)}}@media(prefers-reduced-motion:reduce){.bar::after{animation:none;width:100%}}
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">M<span>+</span></div>
    <h1>Po pastrohet cache-i i dëmtuar</h1>
    <p>MedIndex po heq Service Worker-in, cache-in, sesionin dhe ruajtjen lokale të vjetër. Pas pak do të hapet hyrja e pastër.</p>
    <div class="bar" aria-hidden="true"></div>
    <a href="/login.html?reset-complete=1">Hape hyrjen tani</a>
  </main>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  securityHeaders(res);

  if (resetRequested(req)) {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Refresh', '3; url=/login.html?reset-complete=1');
    return res.status(200).end(browserResetPage());
  }

  if (oidcDiagnosticRequested(req)) {
    try { return res.status(200).json({ diagnostic:await hashedOidcDiagnostic() }); }
    catch { return res.status(500).json({ diagnostic:{ available:false } }); }
  }

  const auth = await import('../lib/auth.mjs');
  const token = auth.sessionFromRequest(req);

  if (req.method === 'GET') {
    return res.status(200).json({
      authenticated:auth.verifySessionToken(token),
      sessionHours:auth.SESSION_TTL_SECONDS / 3600,
      hardened:auth.secureConfigurationEnabled(),
      accessConfigured:auth.accessConfigurationEnabled(),
      sessionConfigured:auth.sessionConfigurationEnabled(),
    });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', auth.expiredSessionCookie());
    return res.status(200).json({ ok:true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return res.status(415).json({ error:'Kërkohet Content-Type application/json.' });
  }
  if (!auth.sessionConfigurationEnabled() || !auth.accessConfigurationEnabled()) {
    return res.status(503).json({
      code:'AUTH_NOT_CONFIGURED',
      error:'Konfigurimi privat i hyrjes mungon në server. Vendos SESSION_SECRET dhe ACCESS_CODE ose ACCESS_CODE_SCRYPT.',
    });
  }

  const ip = clientIp(req);
  const state = activeAttemptState(ip);
  const retryAfter = setRateLimitHeaders(res, state);
  if (state.count >= MAX_ATTEMPTS) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error:'Shumë tentativa. Provo përsëri pas pak.' });
  }

  try {
    const body = await readBody(req);
    const password = String(body.password || '').slice(0, MAX_PASSWORD_CHARS);
    if (!password || !auth.verifyAccessCode(password)) {
      state.count += 1;
      attempts.set(ip, state);
      setRateLimitHeaders(res, state);
      await new Promise(resolve => setTimeout(resolve, 250));
      return res.status(401).json({ error:'Password-i nuk është i saktë.' });
    }

    attempts.delete(ip);
    const sessionToken = auth.createSessionToken();
    res.setHeader('Set-Cookie', auth.sessionCookie(sessionToken));
    res.setHeader('RateLimit-Remaining', String(MAX_ATTEMPTS));
    return res.status(200).json({
      ok:true,
      expiresIn:auth.SESSION_TTL_SECONDS,
      hardened:true,
    });
  } catch (error) {
    console.error('Auth error:', error?.code || error?.message || error);
    if (error?.code === 'BODY_TOO_LARGE') return res.status(413).json({ error:'Kërkesa është tepër e madhe.' });
    const configurationError = /SESSION_SECRET|ACCESS_CODE|sesionit|hyrjes/i.test(String(error?.message || ''));
    return res.status(configurationError ? 503 : 400).json({
      error:configurationError ? 'Konfigurimi privat i hyrjes mungon në server.' : 'Kërkesa e hyrjes nuk u lexua.',
    });
  }
};

module.exports._test = {
  clientIp,
  declaredBodySize,
  resetRequested,
  oidcDiagnosticRequested,
  decodeJwtPayload,
  browserResetPage,
  MAX_ATTEMPTS,
  MAX_BODY_BYTES,
  MAX_PASSWORD_CHARS,
  WINDOW_MS,
};
