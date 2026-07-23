const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_CLIENTS = 2000;

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function pruneAttempts(now = Date.now()) {
  if (attempts.size < MAX_TRACKED_CLIENTS) return;
  attempts.forEach((state, ip) => {
    if (!state || now - state.startedAt > WINDOW_MS) attempts.delete(ip);
  });
  while (attempts.size > MAX_TRACKED_CLIENTS) attempts.delete(attempts.keys().next().value);
}

function activeAttemptState(ip, now = Date.now()) {
  pruneAttempts(now);
  const state = attempts.get(ip);
  if (!state || now - state.startedAt > WINDOW_MS) {
    const fresh = { count: 0, startedAt: now };
    attempts.set(ip, fresh);
    return fresh;
  }
  return state;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error('Kërkesa është tepër e madhe.');
  }
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  securityHeaders(res);
  const auth = await import('../lib/auth.mjs');
  const token = auth.sessionFromRequest(req);

  if (req.method === 'GET') {
    return res.status(200).json({
      authenticated: auth.verifySessionToken(token),
      sessionHours: auth.SESSION_TTL_SECONDS / 3600,
      hardened: auth.secureConfigurationEnabled(),
    });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', auth.expiredSessionCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metoda nuk lejohet.' });
  }

  const ip = clientIp(req);
  const state = activeAttemptState(ip);
  if (state.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - state.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Shumë tentativa. Provo përsëri pas pak.' });
  }

  try {
    const body = await readBody(req);
    const password = String(body.password || '');
    if (!auth.verifyAccessCode(password)) {
      state.count += 1;
      attempts.set(ip, state);
      await new Promise(resolve => setTimeout(resolve, 250));
      return res.status(401).json({ error: 'Password-i nuk është i saktë.' });
    }

    if (!auth.secureConfigurationEnabled()) {
      return res.status(503).json({ error: 'Konfigurimi privat i sesionit mungon në server.' });
    }

    attempts.delete(ip);
    const sessionToken = auth.createSessionToken();
    res.setHeader('Set-Cookie', auth.sessionCookie(sessionToken));
    return res.status(200).json({
      ok: true,
      expiresIn: auth.SESSION_TTL_SECONDS,
      hardened: true,
    });
  } catch (error) {
    console.error('Auth error:', error);
    const configurationError = /SESSION_SECRET|sesionit/i.test(String(error?.message || ''));
    return res.status(configurationError ? 503 : 400).json({
      error: configurationError ? 'Konfigurimi privat i sesionit mungon në server.' : 'Kërkesa e hyrjes nuk u lexua.',
    });
  }
};
