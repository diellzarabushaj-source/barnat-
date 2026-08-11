'use strict';

const { verifyGoogleIdToken } = require('../lib/google-id-token.js');
const UserStore = require('../lib/user-store.js');
const UserLibrary = require('../lib/user-library.js');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_CLIENTS = 2000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PASSWORD_CHARS = 128;

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return true;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
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
  if (req.query && req.query[key] !== undefined) return req.query[key];
  try { return new URL(req.url || '/api/auth', 'https://medindex.local').searchParams.get(key); }
  catch { return null; }
}

function libraryRequested(req) {
  return queryValue(req, 'scope') === 'library';
}

function resetRequested(req) {
  return req.method === 'GET' && queryValue(req, 'reset') === '1';
}

function browserResetPage() {
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="3;url=/login.html?reset-complete=1"><title>Po pastrohet MedIndex</title><style>*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:20px;background:#eef4f2;color:#173238;font-family:Arial,sans-serif}.card{width:min(440px,100%);padding:28px;border:1px solid #d8e2df;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(13,71,75,.18)}.mark{width:54px;height:54px;display:grid;place-items:center;margin-bottom:18px;border-radius:14px;background:#0d474b;color:#fff;font-size:24px;font-weight:800}.mark span{color:#efb660}h1{margin:0 0 10px;font-size:25px;line-height:1.2;color:#0d474b}p{margin:0 0 16px;color:#607277;line-height:1.55}.bar{height:8px;overflow:hidden;border-radius:999px;background:#e4efec}.bar::after{content:"";display:block;width:55%;height:100%;border-radius:inherit;background:#155f64;animation:move 1s ease-in-out infinite alternate}a{display:inline-block;margin-top:18px;color:#0d474b;font-weight:700}@keyframes move{to{transform:translateX(82%)}}@media(prefers-reduced-motion:reduce){.bar::after{animation:none;width:100%}}</style></head><body><main class="card"><div class="mark">M<span>+</span></div><h1>Po pastrohet cache-i i dëmtuar</h1><p>MedIndex po heq Service Worker-in, cache-in, sesionin dhe ruajtjen lokale të vjetër. Pas pak do të hapet hyrja e pastër.</p><div class="bar" aria-hidden="true"></div><a href="/login.html?reset-complete=1">Hape hyrjen tani</a></main></body></html>`;
}

function publicUser(session) {
  return session ? { email:session.email, role:session.role, name:session.name || '' } : null;
}

function ownerFallbackUser(identity = {}) {
  return {
    id:'',
    sub:String(identity.sub || '').trim().slice(0, 255),
    email:UserStore.OWNER_EMAIL,
    name:String(identity.name || 'Diellza Rabushaj').trim().slice(0, 160),
    picture:String(identity.picture || '').trim(),
    role:'editor',
    enabled:true,
    lastLoginAt:new Date().toISOString(),
  };
}

function ownerStoreUnavailable(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /Neon Data API\s+(?:402|408|409|425|429|5\d\d)|data transfer quota|quota|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|upstream/i.test(text);
}

async function ensureLoginUser(identity = {}) {
  const email = String(identity.email || '').trim().toLowerCase();
  try {
    return await UserStore.ensureUser(identity);
  } catch (error) {
    if (email === UserStore.OWNER_EMAIL && ownerStoreUnavailable(error)) {
      console.warn('Auth owner-store fallback:', error?.code || error?.message || error);
      return ownerFallbackUser(identity);
    }
    throw error;
  }
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

  if (libraryRequested(req)) return UserLibrary.handle(req, res);

  const auth = await import('../lib/auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));

  if (req.method === 'GET') {
    const csrfToken = auth.createCsrfToken();
    res.setHeader('Set-Cookie', auth.csrfCookie(csrfToken));
    return res.status(200).json({
      authenticated:Boolean(session),
      user:publicUser(session),
      sessionHours:auth.SESSION_TTL_SECONDS / 3600,
      hardened:auth.secureConfigurationEnabled(),
      accessConfigured:auth.accessConfigurationEnabled(),
      passwordFallbackConfigured:auth.accessConfigurationEnabled(),
      googleConfigured:auth.googleConfigurationEnabled(),
      googleClientId:auth.googleConfigurationEnabled() ? auth.googleClientId() : '',
      sessionConfigured:auth.sessionConfigurationEnabled(),
      csrfToken,
    });
  }

  if (req.method === 'DELETE') {
    if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });
    res.setHeader('Set-Cookie', [auth.expiredSessionCookie(), auth.expiredCsrfCookie()]);
    return res.status(200).json({ ok:true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) return res.status(415).json({ error:'Kërkohet Content-Type application/json.' });
  if (!auth.sessionConfigurationEnabled() || (!auth.googleConfigurationEnabled() && !auth.accessConfigurationEnabled())) {
    return res.status(503).json({
      code:'AUTH_NOT_CONFIGURED',
      error:'Konfigurimi privat i hyrjes mungon në server. Vendos SESSION_SECRET dhe GOOGLE_CLIENT_ID; password-i rezervë mbetet opsional.',
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
    const suppliedCsrf = String(req.headers['x-csrf-token'] || body.csrfToken || '');
    if (!auth.verifyCsrfToken(req, suppliedCsrf)) {
      state.count += 1;
      setRateLimitHeaders(res, state);
      return res.status(403).json({ code:'CSRF_INVALID', error:'Kontrolli i sigurisë së hyrjes skadoi. Rifresko faqen.' });
    }

    let user;
    let provider;
    if (String(body.credential || '').trim()) {
      if (!auth.googleConfigurationEnabled()) return res.status(503).json({ code:'GOOGLE_NOT_CONFIGURED', error:'Hyrja me Google nuk është konfiguruar ende.' });
      const identity = await verifyGoogleIdToken(body.credential, {
        clientId:auth.googleClientId(),
        nonce:suppliedCsrf,
      });
      user = await ensureLoginUser(identity);
      provider = 'google';
    } else {
      if (!auth.accessConfigurationEnabled()) return res.status(403).json({ error:'Hyrja me password rezervë nuk është aktive.' });
      const password = String(body.password || '').slice(0, MAX_PASSWORD_CHARS);
      if (!password || !auth.verifyAccessCode(password)) {
        state.count += 1;
        attempts.set(ip, state);
        setRateLimitHeaders(res, state);
        await new Promise(resolve => setTimeout(resolve, 250));
        return res.status(401).json({ error:'Password-i nuk është i saktë.' });
      }
      user = await ensureLoginUser({ email:UserStore.OWNER_EMAIL, name:'Diellza Rabushaj' });
      provider = 'password';
    }

    attempts.delete(ip);
    const sessionToken = auth.createSessionToken({
      uid:user.id,
      sub:user.sub || (provider === 'password' ? 'password-owner' : ''),
      email:user.email,
      role:user.role,
      name:user.name,
    });
    const nextCsrf = auth.createCsrfToken();
    res.setHeader('Set-Cookie', [auth.sessionCookie(sessionToken), auth.csrfCookie(nextCsrf)]);
    res.setHeader('RateLimit-Remaining', String(MAX_ATTEMPTS));
    return res.status(200).json({
      ok:true,
      expiresIn:auth.SESSION_TTL_SECONDS,
      hardened:true,
      provider,
      user:{ email:user.email, role:user.role, name:user.name },
    });
  } catch (error) {
    console.error('Auth error:', error?.code || error?.message || error);
    if (error?.code === 'BODY_TOO_LARGE') return res.status(413).json({ error:'Kërkesa është tepër e madhe.' });
    if (error?.code === 'EMAIL_NOT_ALLOWED' || error?.code === 'USER_DISABLED') return res.status(403).json({ code:error.code, error:error.message });
    if (error?.code === 'GOOGLE_KEYS_UNAVAILABLE') return res.status(503).json({ code:error.code, error:'Google nuk u përgjigj për verifikim. Provo përsëri.' });
    if (/^GOOGLE_/.test(String(error?.code || ''))) return res.status(401).json({ code:error.code, error:error.message });
    const configurationError = /SESSION_SECRET|ACCESS_CODE|GOOGLE_CLIENT_ID|çelësi privat/i.test(String(error?.message || ''));
    return res.status(configurationError ? 503 : 400).json({
      error:configurationError ? 'Konfigurimi privat i hyrjes mungon në server.' : 'Kërkesa e hyrjes nuk u përfundua.',
    });
  }
};

module.exports._test = {
  clientIp,
  sameOrigin,
  declaredBodySize,
  queryValue,
  libraryRequested,
  resetRequested,
  browserResetPage,
  ownerFallbackUser,
  ownerStoreUnavailable,
  ensureLoginUser,
  MAX_ATTEMPTS,
  MAX_BODY_BYTES,
  MAX_PASSWORD_CHARS,
  WINDOW_MS,
};
