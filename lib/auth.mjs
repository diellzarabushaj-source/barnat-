import crypto from 'node:crypto';

export const COOKIE_NAME = 'medindex_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_ACCESS_CODE_SHA256 = 'e2038b663d8209a2dc7db350ccb5ac0471522e14548732a9e9d9ce8f2ee75aa5';

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function hashAccessCode(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function configuredAccessCodeHash() {
  const explicitHash = String(process.env.ACCESS_CODE_SHA256 || '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(explicitHash)) return explicitHash;
  const explicitCode = String(process.env.ACCESS_CODE || '').trim();
  if (explicitCode) return hashAccessCode(explicitCode);
  return DEFAULT_ACCESS_CODE_SHA256;
}

export function secureConfigurationEnabled() {
  return Boolean(String(process.env.SESSION_SECRET || '').trim());
}

function sessionSecret() {
  const configured = String(process.env.SESSION_SECRET || '').trim();
  if (configured.length >= 32) return configured;
  // Fallback keeps the requested gate functional. A random SESSION_SECRET in Vercel is strongly recommended.
  return `medindex-fallback-v1:${configuredAccessCodeHash()}`;
}

function timingSafeEqualHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function verifyAccessCode(value) {
  return timingSafeEqualHex(hashAccessCode(value), configuredAccessCodeHash());
}

function signature(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(now = Date.now()) {
  const payload = base64UrlEncode(JSON.stringify({
    v: 1,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(12).toString('base64url'),
  }));
  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token, now = Date.now()) {
  try {
    const [payload, suppliedSignature] = String(token || '').split('.');
    if (!payload || !suppliedSignature) return false;
    const expectedSignature = signature(payload);
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(expectedSignature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
    const data = JSON.parse(base64UrlDecode(payload));
    const nowSeconds = Math.floor(now / 1000);
    return data?.v === 1 && Number.isFinite(data.exp) && data.exp > nowSeconds && data.iat <= nowSeconds + 60;
  } catch {
    return false;
  }
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
  const cookieHeader = request?.headers?.get
    ? request.headers.get('cookie')
    : request?.headers?.cookie;
  return parseCookies(cookieHeader)[COOKIE_NAME] || '';
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
