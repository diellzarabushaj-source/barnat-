export const COOKIE_NAME = 'medindex_session';
const encoder = new TextEncoder();

function privateSessionSecret() {
  const candidates = [
    process.env.SESSION_SECRET,
    process.env.MEDINDEX_SESSION_SECRET,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY1,
  ];
  const secret = candidates.map(value => String(value || '').trim()).find(value => value.length >= 32);
  if (!secret) throw new Error('Mungon SESSION_SECRET privat.');
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
    { name: 'HMAC', hash: 'SHA-256' },
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
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

export function sessionFromRequest(request) {
  return parseCookies(request.headers.get('cookie'))[COOKIE_NAME] || '';
}

export async function verifySessionToken(token, now = Date.now()) {
  try {
    const [payload, suppliedSignature] = String(token || '').split('.');
    if (!payload || !suppliedSignature) return false;
    const supplied = base64UrlBytes(suppliedSignature);
    const expected = await expectedSignature(payload);
    if (!equalBytes(supplied, expected)) return false;
    const data = JSON.parse(base64UrlText(payload));
    const nowSeconds = Math.floor(now / 1000);
    return data?.v === 1 && Number.isFinite(data.exp) && data.exp > nowSeconds && data.iat <= nowSeconds + 60;
  } catch {
    return false;
  }
}
