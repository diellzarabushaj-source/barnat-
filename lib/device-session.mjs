import crypto from 'node:crypto';

// Only the server can read this credential. The application session remains
// eight hours; Supabase refreshes and rechecks the account before replacing it.
export const DEVICE_COOKIE_NAME = 'medindex_device';
export const DEVICE_TTL_SECONDS = 90 * 24 * 60 * 60;
const AAD = 'drx-device-session-v1';

function secret() {
  const value = [process.env.SESSION_SECRET, process.env.MEDINDEX_SESSION_SECRET]
    .map(item => String(item || '').trim()).find(item => item.length >= 32);
  if (!value) throw new Error('Device session configuration is missing.');
  return value;
}

function key() {
  return crypto.hkdfSync('sha256', secret(), AAD, 'cookie-encryption', 32);
}

export function accessRevision() {
  return crypto.createHmac('sha256', secret())
    .update(`access-code:${process.env.ACCESS_CODE || ''}:${process.env.ACCESS_CODE_SCRYPT || ''}`).digest('base64url');
}

export function createDeviceToken(identity, refreshToken = '', now = Date.now()) {
  const provider = String(identity.provider || '');
  if (!['supabase-google', 'supabase-password', 'legacy-password'].includes(provider)) return '';
  if (provider !== 'legacy-password' && (!refreshToken || !identity.authUid)) return '';
  const issuedAt = Math.floor(now / 1000);
  const data = {
    version:1, issuedAt, expiresAt:issuedAt + DEVICE_TTL_SECONDS,
    provider, authUid:String(identity.authUid || ''), uid:String(identity.uid || ''),
    email:String(identity.email || '').trim().toLowerCase(), name:String(identity.name || '').slice(0, 160),
    refreshToken:provider === 'legacy-password' ? '' : String(refreshToken),
    accessRevision:provider === 'legacy-password' ? accessRevision() : '',
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(AAD));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return `d1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')}`;
}

export function deviceData(token, now = Date.now()) {
  try {
    if (!/^d1\.[A-Za-z0-9_-]+$/.test(String(token || '')) || token.length > 3800) return null;
    const bytes = Buffer.from(token.slice(3), 'base64url');
    if (bytes.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(AAD));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    const seconds = Math.floor(now / 1000);
    if (data.version !== 1 || !Number.isFinite(data.issuedAt) || !Number.isFinite(data.expiresAt)
      || data.issuedAt > seconds + 60 || data.expiresAt <= seconds
      || data.expiresAt - data.issuedAt !== DEVICE_TTL_SECONDS || !data.uid || !data.email) return null;
    if (data.provider === 'legacy-password') {
      if (data.accessRevision !== accessRevision()) return null;
    } else if (!['supabase-google', 'supabase-password'].includes(data.provider) || !data.authUid || !data.refreshToken) return null;
    return data;
  } catch { return null; }
}

export function deviceFromRequest(req) {
  const header = req?.headers?.get ? req.headers.get('cookie') : req?.headers?.cookie;
  const value = String(header || '').split(';').find(part => part.trim().startsWith(`${DEVICE_COOKIE_NAME}=`));
  try { return value ? decodeURIComponent(value.trim().slice(DEVICE_COOKIE_NAME.length + 1)) : ''; }
  catch { return ''; }
}

export function deviceCookie(token) {
  return `${DEVICE_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${DEVICE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function expiredDeviceCookie() {
  return `${DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function safeResumePath(value) {
  const path = String(value || '');
  // Parse the destination as the browser would, including backslashes and
  // control characters; a mere startsWith('/') check permits open redirects.
  try {
    const url = new URL(path, 'https://drx.local');
    if (!path.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(path) || url.origin !== 'https://drx.local'
      || /^\/(api|login|admin-login|landing|recovery|hyrje)(\/|\.|$)/.test(url.pathname)) return '/index.html';
    return url.pathname + url.search + url.hash;
  } catch { return '/index.html'; }
}
