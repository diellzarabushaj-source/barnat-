'use strict';

const ALLOWED_HOSTS = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
]);
const MAX_URL_LENGTH = 2048;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function requestValue(req, name) {
  if (req.query?.[name] !== undefined) {
    const value = Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
    return String(value || '');
  }
  try {
    return new URL(String(req.url || ''), 'https://drx.local').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function safeImageUrl(raw) {
  if (!raw || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  url.username = '';
  url.password = '';
  url.hash = '';
  return url;
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false, error:'Method not allowed' });
  }

  if (!(await authorized(req))) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(401).json({ ok:false, error:'Kërkohet autentikim.' });
  }

  const target = safeImageUrl(requestValue(req, 'url'));
  if (!target) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(400).json({ ok:false, error:'Burim figure i palejuar.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch(target, {
      method:'GET',
      redirect:'follow',
      headers:{
        Accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent':'DRx-Medical-Hub/1.0',
      },
      signal:controller.signal,
    });

    if (!upstream.ok) {
      return res.status(502).json({ ok:false, error:`Figura upstream dështoi (${upstream.status}).` });
    }

    const finalUrl = safeImageUrl(upstream.url);
    if (!finalUrl) {
      return res.status(502).json({ ok:false, error:'Figura ridrejtoi te një host i palejuar.' });
    }

    const type = String(upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) {
      return res.status(415).json({ ok:false, error:'Burimi nuk ktheu figurë.' });
    }

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ ok:false, error:'Figura është shumë e madhe.' });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ ok:false, error:'Figura është shumë e madhe.' });
    }

    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Disposition', 'inline');
    return res.status(200).send(bytes);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Figura nuk u përgjigj në kohë.' : 'Figura nuk mund të ngarkohet.';
    return res.status(502).json({ ok:false, error:message });
  } finally {
    clearTimeout(timer);
  }
};

module.exports._test = { safeImageUrl, ALLOWED_HOSTS, MAX_IMAGE_BYTES };
