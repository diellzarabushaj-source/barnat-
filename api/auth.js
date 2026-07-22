const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

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

function activeAttemptState(ip, now = Date.now()) {
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

    attempts.delete(ip);
    const sessionToken = auth.createSessionToken();
    res.setHeader('Set-Cookie', auth.sessionCookie(sessionToken));
    return res.status(200).json({
      ok: true,
      expiresIn: auth.SESSION_TTL_SECONDS,
      hardened: auth.secureConfigurationEnabled(),
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(400).json({ error: 'Kërkesa e hyrjes nuk u lexua.' });
  }
};
