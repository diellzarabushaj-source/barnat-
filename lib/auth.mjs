import crypto from 'node:crypto';

export const COOKIE_NAME = 'medindex_session';
export const CSRF_COOKIE_NAME = 'medindex_csrf';
export const ENROLLMENT_COOKIE_NAME = 'medindex_enrollment';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const CSRF_TTL_SECONDS = 15 * 60;
export const ENROLLMENT_TTL_SECONDS = 15 * 60;
export const OWNER_EMAIL = 'diellzarabushaj@gmail.com';
export const SESSION_VERSION = 3;

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
  ];
  const secret = candidates.map(value => String(value || '').trim()).find(value => value.length >= 32);
  if (!secret) throw new Error('Mungon SESSION_SECRET privat me së paku 32 karaktere.');
  return secret;
}

function plainAccessCode() {
  return String(process.env.ACCESS_CODE || '').trim();
}

function scryptAccessVerifier() {
  return String(process.env.ACCESS_CODE_SCRYPT || '').trim();
}

function hasConflictingAccessVerifiers() {
  return Boolean(plainAccessCode() && scryptAccessVerifier());
}

function configuredScryptVerifier() {
  const raw = scryptAccessVerifier();
  const match = raw.match(/^scrypt:(\d+):(\d+):(\d+):([a-f0-9]{32,}):([a-f0-9]{64})$/i);
  if (!match) return null;
  const verifier = {
    n:Number(match[1]),
    r:Number(match[2]),
    p:Number(match[3]),
    salt:match[4].toLowerCase(),
    hash:match[5].toLowerCase(),
  };
  if (!Number.isInteger(verifier.n) || verifier.n < 4096 || verifier.n > 131072) return null;
  if (!Number.isInteger(verifier.r) || verifier.r < 1 || verifier.r > 32) return null;
  if (!Number.isInteger(verifier.p) || verifier.p < 1 || verifier.p > 16) return null;
  return verifier;
}

export function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.MEDINDEX_GOOGLE_CLIENT_ID || '').trim();
}

export function googleConfigurationEnabled() {
  return /\.apps\.googleusercontent\.com$/i.test(googleClientId());
}

export function accessConfigurationEnabled() {
  if (hasConflictingAccessVerifiers()) return false;
  return Boolean(plainAccessCode() || configuredScryptVerifier());
}

export function sessionConfigurationEnabled() {
  try {
    privateSessionSecret();
    return true;
  } catch {
    return false;
  }
}

export function secureConfigurationEnabled() {
  return sessionConfigurationEnabled() && (googleConfigurationEnabled() || accessConfigurationEnabled());
}

function timingSafeEqualBuffers(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPlainEnvironmentCode(value) {
  const configured = plainAccessCode();
  if (!configured) return null;
  const suppliedHash = crypto.createHash('sha256').update(String(value || ''), 'utf8').digest();
  const configuredHash = crypto.createHash('sha256').update(configured, 'utf8').digest();
  return timingSafeEqualBuffers(suppliedHash, configuredHash);
}

export function verifyAccessCode(value) {
  if (hasConflictingAccessVerifiers()) return false;
  const environmentResult = verifyPlainEnvironmentCode(value);
  if (environmentResult !== null) return environmentResult;
  const verifier = configuredScryptVerifier();
  if (!verifier) return false;
  try {
    const expected = Buffer.from(verifier.hash, 'hex');
    const supplied = crypto.scryptSync(String(value || ''), Buffer.from(verifier.salt, 'hex'), expected.length, {
      N:verifier.n,
      r:verifier.r,
      p:verifier.p,
      maxmem:64 * 1024 * 1024,
    });
    return timingSafeEqualBuffers(supplied, expected);
  } catch {
    return false;
  }
}

function signature(payload) {
  return crypto.createHmac('sha256', privateSessionSecret()).update(payload).digest('base64url');
}

function normalizedIdentity(identity = {}) {
  const email = String(identity.email || OWNER_EMAIL).trim().toLowerCase();
  const authRole = ['doctor', 'admin'].includes(String(identity.authRole || '')) ? String(identity.authRole) : '';
  const authStatus = ['active', 'suspended', 'disabled'].includes(String(identity.authStatus || '')) ? String(identity.authStatus) : '';
  const provider = ['supabase-google', 'legacy-password', 'legacy-session'].includes(String(identity.provider || ''))
    ? String(identity.provider)
    : 'legacy-session';
  return {
    uid:String(identity.uid || identity.id || '').trim().slice(0, 80),
    authUid:String(identity.authUid || identity.aid || '').trim().slice(0, 80),
    sub:String(identity.sub || identity.googleSub || (email === OWNER_EMAIL ? 'owner' : '')).trim().slice(0, 255),
    email,
    role:identity.role === 'user' ? 'user' : 'editor',
    name:String(identity.name || identity.displayName || '').trim().slice(0, 160),
    authRole,
    authStatus,
    provider,
  };
}

export function createSessionToken(identity = {}, now = Date.now()) {
  if (typeof identity === 'number') {
    now = identity;
    identity = {};
  }
  const user = normalizedIdentity(identity);
  const payload = base64UrlEncode(JSON.stringify({
    v:SESSION_VERSION,
    iat:Math.floor(now / 1000),
    exp:Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    nonce:crypto.randomBytes(12).toString('base64url'),
    uid:user.uid,
    aid:user.authUid,
    sub:user.sub,
    email:user.email,
    role:user.role,
    name:user.name,
    arole:user.authRole,
    astatus:user.authStatus,
    provider:user.provider,
  }));
  return `${payload}.${signature(payload)}`;
}

export function createEnrollmentToken(identity = {}, now = Date.now()) {
  const authUid = String(identity.authUid || identity.id || '').trim();
  const email = String(identity.email || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(authUid) || !email) {
    throw new Error('Identiteti i regjistrimit nuk është i vlefshëm.');
  }
  const payload = base64UrlEncode(JSON.stringify({
    v:'enrollment-v1',
    iat:Math.floor(now / 1000),
    exp:Math.floor(now / 1000) + ENROLLMENT_TTL_SECONDS,
    nonce:crypto.randomBytes(16).toString('base64url'),
    aid:authUid,
    email,
  }));
  return `${payload}.${signature(payload)}`;
}

function validTimes(data, now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000);
  return Number.isFinite(data?.exp)
    && Number.isFinite(data?.iat)
    && data.exp > nowSeconds
    && data.exp - data.iat === SESSION_TTL_SECONDS
    && data.iat <= nowSeconds + 60;
}

function legacySession(data) {
  const email = String(data.email || '').trim().toLowerCase();
  const role = String(data.role || '');
  if (!email || !['editor', 'user'].includes(role)) return null;
  return {
    v:2,
    uid:String(data.uid || '').trim(),
    authUid:'',
    sub:String(data.sub || '').trim(),
    email,
    role,
    name:String(data.name || '').trim(),
    authRole:'',
    authStatus:'',
    provider:'legacy-v2',
    iat:data.iat,
    exp:data.exp,
  };
}

export function sessionData(token, now = Date.now()) {
  try {
    const [payload, suppliedSignature] = String(token || '').split('.');
    if (!payload || !suppliedSignature) return null;
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(signature(payload), 'base64url');
    if (!timingSafeEqualBuffers(supplied, expected)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    if (!validTimes(data, now)) return null;
    if (data.v === 1) {
      return { v:1, uid:'', authUid:'', sub:'legacy-owner', email:OWNER_EMAIL, role:'editor', name:'Diellza Rabushaj', authRole:'', authStatus:'', provider:'legacy-v1', iat:data.iat, exp:data.exp };
    }
    if (data.v === 2) return legacySession(data);
    if (data.v !== SESSION_VERSION) return null;

    const email = String(data.email || '').trim().toLowerCase();
    const role = String(data.role || '');
    const authRole = String(data.arole || '');
    const authStatus = String(data.astatus || '');
    const provider = String(data.provider || '');
    const authUid = String(data.aid || '').trim();
    if (!email || !['editor', 'user'].includes(role)) return null;
    if (!['supabase-google', 'legacy-password', 'legacy-session'].includes(provider)) return null;
    if (provider === 'supabase-google') {
      if (!authUid || !['doctor', 'admin'].includes(authRole) || authStatus !== 'active') return null;
    }
    return {
      v:SESSION_VERSION,
      uid:String(data.uid || '').trim(),
      authUid,
      sub:String(data.sub || '').trim(),
      email,
      role,
      name:String(data.name || '').trim(),
      authRole,
      authStatus,
      provider,
      iat:data.iat,
      exp:data.exp,
    };
  } catch {
    return null;
  }
}

export function verifySessionToken(token, now = Date.now()) {
  return Boolean(sessionData(token, now));
}

export function enrollmentData(token, now = Date.now()) {
  try {
    const [payload, suppliedSignature] = String(token || '').split('.');
    if (!payload || !suppliedSignature) return null;
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    const expected = Buffer.from(signature(payload), 'base64url');
    if (!timingSafeEqualBuffers(supplied, expected)) return null;
    const data = JSON.parse(base64UrlDecode(payload));
    const nowSeconds = Math.floor(now / 1000);
    if (data?.v !== 'enrollment-v1'
      || !Number.isFinite(data.iat)
      || !Number.isFinite(data.exp)
      || data.exp <= nowSeconds
      || data.exp - data.iat !== ENROLLMENT_TTL_SECONDS
      || data.iat > nowSeconds + 60
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(data.aid || ''))
      || !String(data.email || '').includes('@')) return null;
    return {
      authUid:String(data.aid),
      email:String(data.email).trim().toLowerCase(),
      iat:data.iat,
      exp:data.exp,
    };
  } catch {
    return null;
  }
}

export function isSupabaseSession(session) {
  return Boolean(session && session.v === SESSION_VERSION && session.provider === 'supabase-google' && session.authUid && session.authStatus === 'active');
}

export function isRollbackSession(session) {
  return Boolean(session && session.v === SESSION_VERSION && session.provider === 'legacy-password');
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

function cookieHeader(request) {
  return request?.headers?.get ? request.headers.get('cookie') : request?.headers?.cookie;
}

export function sessionFromRequest(request) {
  return parseCookies(cookieHeader(request))[COOKIE_NAME] || '';
}

export function csrfFromRequest(request) {
  return parseCookies(cookieHeader(request))[CSRF_COOKIE_NAME] || '';
}

export function enrollmentFromRequest(request) {
  return parseCookies(cookieHeader(request))[ENROLLMENT_COOKIE_NAME] || '';
}

export function createCsrfToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function verifyCsrfToken(request, supplied) {
  const cookie = csrfFromRequest(request);
  const value = String(supplied || '').trim();
  if (!cookie || !value) return false;
  const left = crypto.createHash('sha256').update(cookie).digest();
  const right = crypto.createHash('sha256').update(value).digest();
  return timingSafeEqualBuffers(left, right);
}

export function csrfCookie(token) {
  return `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${CSRF_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredCsrfCookie() {
  return `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function enrollmentCookie(token) {
  return `${ENROLLMENT_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/auth; Max-Age=${ENROLLMENT_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function expiredEnrollmentCookie() {
  return `${ENROLLMENT_COOKIE_NAME}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
