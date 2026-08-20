export const COOKIE_NAME = 'medindex_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_VERSION = 3;
const encoder = new TextEncoder();

function privateSessionSecret() {
  const candidates = [
    process.env.SESSION_SECRET,
    process.env.MEDINDEX_SESSION_SECRET,
  ];
  const secret = candidates.map(value => String(value || '').trim()).find(value => value.length >= 32);
  if (!secret) throw new Error('Mungon SESSION_SECRET privat me së paku 32 karaktere.');
  return secret;
}

function base64UrlBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function base64UrlText(value) {
  return new TextDecoder().decode(base64UrlBytes(value));
}

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function expectedSignature(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(privateSessionSecret()),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  String(cookieHeader || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    try { cookies[key] = decodeURIComponent(value); }
    catch { cookies[key] = value; }
  });
  return cookies;
}

export function sessionFromRequest(request) {
  return parseCookies(request.headers.get('cookie'))[COOKIE_NAME] || '';
}

function validSessionPayload(data, now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000);
  const validTimes = Number.isFinite(data?.exp)
    && Number.isFinite(data?.iat)
    && data.exp > nowSeconds
    && data.exp - data.iat === SESSION_TTL_SECONDS
    && data.iat <= nowSeconds + 60;
  if (!validTimes || data?.v !== SESSION_VERSION) return false;
  if (typeof data.email !== 'string' || !data.email.includes('@')) return false;
  if (!['editor', 'user'].includes(data.role)) return false;

  const provider = String(data.provider || '');
  if (!['supabase-google', 'legacy-password', 'legacy-session'].includes(provider)) return false;
  if (provider === 'supabase-google') {
    return typeof data.aid === 'string'
      && data.aid.length > 0
      && ['doctor', 'admin'].includes(data.arole)
      && data.astatus === 'active';
  }
  return true;
}

export async function verifySessionToken(token, now = Date.now()) {
  try {
    const [payload, suppliedSignature] = String(token || '').split('.');
    if (!payload || !suppliedSignature) return false;
    const supplied = base64UrlBytes(suppliedSignature);
    const expected = await expectedSignature(payload);
    if (!equalBytes(supplied, expected)) return false;
    return validSessionPayload(JSON.parse(base64UrlText(payload)), now);
  } catch {
    return false;
  }
}

export const _test = { validSessionPayload };