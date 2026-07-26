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

module.exports = async function handler(req, res) {
  securityHeaders(res);
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
  MAX_ATTEMPTS,
  MAX_BODY_BYTES,
  MAX_PASSWORD_CHARS,
  WINDOW_MS,
};
