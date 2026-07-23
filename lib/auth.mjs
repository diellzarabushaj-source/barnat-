import crypto from 'node:crypto';

export const COOKIE_NAME = 'medindex_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const DEFAULT_SCRYPT = {
  n: 16384,
  r: 8,
  p: 1,
  salt: '745d78e6825faad4647f6e0ef9d291d2',
  hash: '0f7933f2de0297506fb39f019484fe030c9785050150e52e70a87b661dc47d0c',
};

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function privateSessionSecret() {
  const candidates = [
    process.env.SESSION_SECRET,
    process.env.MEDINDEX_SESSION_SECRET,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY1,
  ];
  const secret = candidates.map(value => String(value || '').trim()).find(value => value.length >= 32);
  if (!secret) throw new Error('Mungon SESSION_SECRET privat për nënshkrimin e sesionit.');
  return secret;
}

export function secureConfigurationEnabled() {
  try {
    privateSessionSecret();
    return true;
  } catch {
    return false;
  }
}

function timingSafeEqualBuffers(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPlainEnvironmentCode(value) {
  const configured = String(process.env.ACCESS_CODE || '').trim();
  if (!configured) return null;
  const suppliedHash = crypto.createHash('sha256').update(String(value || ''), 'utf8').digest();
  const configuredHash = crypto.createHash('sha256').update(configured, 'utf8').digest();
  return timingSafeEqualBuffers(suppliedHash, configuredHash);
}

function configuredScryptVerifier() {
  const raw = String(process.env.ACCESS_CODE_SCRYPT || '').trim();
  const match = raw.match(/^scrypt:(\d+):(\d+):(\d+):([a-f0-9]{32,}):([a-f0-9]{64})$/i);
  if (!match) return DEFAULT_SCRYPT;
  return {
    n: Number(match[1]),
    r: Number(match[2]),
    p: Number(match[3]),
    salt: match[4].toLowerCase(),
    hash: match[5].toLowerCase(),
  };
}

export function verifyAccessCode(value) {
  const environmentResult = verifyPlainEnvironmentCode(value);
  if (environmentResult !== null) return environmentResult;

  try {
    const verifier = configuredScryptVerifier();
    if (!Number.isInteger(verifier.n) || verifier.n < 4096 || verifier.n > 131072 || !Number.isInteger(verifier.r) || !Number.isInteger(verifier.p)) return false;
    const expected = Buffer.from(verifier.hash, 'hex');
    const supplied = crypto.scryptSync(String(value || ''), Buffer.from(verifier.salt, 'hex'), expected.length, {
      N: verifier.n,
      r: verifier.r,
      p: verifier.p,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqualBuffers(supplied, expected);
  } catch {
    return false;
  }
}

function signature(payload) {
  return crypto.createHmac('sha256', privateSessionSecret()).update(payload).digest('base64url');
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
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(signature(payload), 'base64url');
    if (!timingSafeEqualBuffers(supplied, expected)) return false;
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
  const cookieHeader = request?.headers?.get ? request.headers.get('cookie') : request?.headers?.cookie;
  return parseCookies(cookieHeader)[COOKIE_NAME] || '';
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
