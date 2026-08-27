'use strict';

const crypto = require('node:crypto');
const { verifyGoogleIdToken } = require('../lib/google-id-token.js');
const { exchangeGoogleIdToken, SupabaseBootstrapError } = require('../lib/supabase-auth-bootstrap.js');
const SupabaseAuth = require('../lib/supabase-auth.js');
const SupabasePassword = require('../lib/supabase-password-auth.js');
const UserStore = require('../lib/user-store.js');
const UserLibrary = require('../lib/user-library.js');
const ProfileAvatar = require('../lib/profile-avatar.js');
const AdminUsers = require('../lib/admin-users.js');
const AdminAccess = require('../lib/admin-access.js');
const ProfessionalVerification = require('../lib/professional-verification.js');
const Phase4AuthBootstrap = require('../lib/phase4-auth-bootstrap-route.js');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_CLIENTS = 2000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PASSWORD_CHARS = 128;

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return true;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
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

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return req.query[key];
  try { return new URL(req.url || '/api/auth', 'https://medindex.local').searchParams.get(key); }
  catch { return null; }
}

function libraryRequested(req) {
  return queryValue(req, 'scope') === 'library';
}

function profilePhotoRequested(req) {
  return queryValue(req, 'scope') === 'profile-photo';
}

function resetRequested(req) {
  return req.method === 'GET' && queryValue(req, 'reset') === '1';
}

// single-version-release-endpoint-v1
function releaseRequested(req) {
  return req.method === 'GET' && queryValue(req, 'release') === '1';
}

function deploymentRelease() {
  return String(
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GITHUB_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || 'local-1.8.0'
  ).trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 96);
}

function browserResetPage() {
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="3;url=/login.html?reset-complete=1"><title>Po pastrohet MedIndex</title><style>*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:20px;background:#eef4f2;color:#173238;font-family:Arial,sans-serif}.card{width:min(440px,100%);padding:28px;border:1px solid #d8e2df;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(13,71,75,.18)}.mark{width:54px;height:54px;display:grid;place-items:center;margin-bottom:18px;border-radius:14px;background:#0d474b;color:#fff;font-size:24px;font-weight:800}.mark span{color:#efb660}h1{margin:0 0 10px;font-size:25px;line-height:1.2;color:#0d474b}p{margin:0 0 16px;color:#607277;line-height:1.55}.bar{height:8px;overflow:hidden;border-radius:999px;background:#e4efec}.bar::after{content:"";display:block;width:55%;height:100%;border-radius:inherit;background:#155f64;animation:move 1s ease-in-out infinite alternate}a{display:inline-block;margin-top:18px;color:#0d474b;font-weight:700}@keyframes move{to{transform:translateX(82%)}}@media(prefers-reduced-motion:reduce){.bar::after{animation:none;width:100%}}</style></head><body><main class="card"><div class="mark">M<span>+</span></div><h1>Po pastrohet cache-i i dëmtuar</h1><p>MedIndex po heq Service Worker-in, cache-in, sesionin dhe ruajtjen lokale të vjetër. Pas pak do të hapet hyrja e pastër.</p><div class="bar" aria-hidden="true"></div><a href="/login.html?reset-complete=1">Hape hyrjen tani</a></main></body></html>`;
}

function publicUser(session) {
  return session ? { email:session.email, role:session.role, name:session.name || '' } : null;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function ownerFallbackUser(identity = {}) {
  return {
    id:String(identity.id || identity.uid || '').trim().slice(0, 80),
    sub:String(identity.sub || '').trim().slice(0, 255),
    email:UserStore.OWNER_EMAIL,
    name:String(identity.name || 'Diellza Rabushaj').trim().slice(0, 160),
    picture:String(identity.picture || '').trim(),
    role:'editor',
    enabled:true,
    lastLoginAt:new Date().toISOString(),
  };
}

function ownerStoreUnavailable(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /Neon Data API\s+(?:402|408|409|425|429|5\d\d)|data transfer quota|quota|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|upstream/i.test(text);
}

async function ensureLoginUser(identity = {}) {
  const email = String(identity.email || '').trim().toLowerCase();
  try {
    return await UserStore.ensureUser(identity);
  } catch (error) {
    if (email === UserStore.OWNER_EMAIL && ownerStoreUnavailable(error)) {
      console.warn('Auth owner-store fallback:', error?.code || error?.message || error);
      return ownerFallbackUser(identity);
    }
    throw error;
  }
}

function cutoverError(code, message, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

// A pending account never receives a session. It receives a short-lived
// enrollment proof instead, which is only good for uploading the professional
// document — and the answer says which of the two things it still owes: the
// document, or the administrator's decision.
async function pendingEnrollment(res, canonicalIdentity) {
  const auth = await import('../lib/auth.mjs');
  const verificationStatus = String(canonicalIdentity.profile?.verificationStatus || 'missing');
  const verificationRequired = !['submitted', 'verified'].includes(verificationStatus);
  const enrollmentToken = auth.createEnrollmentToken({
    authUid:canonicalIdentity.id,
    email:canonicalIdentity.email,
  });
  res.setHeader('Set-Cookie', [auth.expiredSessionCookie(), auth.enrollmentCookie(enrollmentToken)]);
  return res.status(403).json({
    ok:false,
    code:verificationRequired ? 'PROFESSIONAL_VERIFICATION_REQUIRED' : 'ACCOUNT_PENDING_APPROVAL',
    error:verificationRequired
      ? 'Ngarko dokumentin profesional para se administratori ta shqyrtojë regjistrimin.'
      : 'Dokumenti profesional u dërgua dhe llogaria pret aprovimin e administratorit.',
    verificationRequired,
    verificationStatus,
    enrollmentExpiresIn:auth.ENROLLMENT_TTL_SECONDS,
  });
}

// Shared by both Supabase doors. Approved profiles authorize themselves: a
// doctor gets a private library and an admin keeps shared clinical write access.
// New accounts have no legacy bridge, so their private storage UUID is their
// Supabase Auth UUID.
async function approvedSupabaseUser(canonicalIdentity, hints = {}) {
  SupabaseAuth.assertActive(canonicalIdentity);

  const legacyUserId = String(canonicalIdentity.profile?.legacyUserId || '').trim();
  if (canonicalIdentity.email === UserStore.OWNER_EMAIL && !legacyUserId) {
    throw cutoverError('LEGACY_OWNER_MAPPING_MISSING', 'Lidhja e sigurt me të dhënat ekzistuese të pronarit mungon.');
  }
  const user = await ensureLoginUser({
    id:legacyUserId || canonicalIdentity.id,
    sub:hints.sub,
    email:canonicalIdentity.email,
    name:hints.name,
    picture:hints.picture,
    authorizedRole:canonicalIdentity.role,
  });
  if (legacyUserId && String(user.id) !== legacyUserId) {
    throw cutoverError('LEGACY_OWNER_MAPPING_MISMATCH', 'Identiteti Supabase nuk përputhet me pronarin e të dhënave ekzistuese.');
  }
  return user;
}

module.exports = async function handler(req, res) {
  securityHeaders(res);

  if (Phase4AuthBootstrap.requested(req)) return Phase4AuthBootstrap.handle(req, res);

  if (releaseRequested(req)) {
    return res.status(200).json({ id:deploymentRelease(), strategy:'single-version-v1' });
  }

  if (resetRequested(req)) {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('Refresh', '3; url=/login.html?reset-complete=1');
    return res.status(200).end(browserResetPage());
  }

  if (libraryRequested(req)) return UserLibrary.handle(req, res);
  if (profilePhotoRequested(req)) return ProfileAvatar.handle(req, res);

  // Admin user management shares this function instead of claiming another Vercel
  // Hobby function slot; it enforces its own live admin check.
  if (AdminUsers.requested(req, queryValue)) {
    if (!sameOrigin(req)) return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });
    return AdminUsers.handle(req, res, { parseBody:readBody });
  }

  if (ProfessionalVerification.requested(req, queryValue)) {
    if (!sameOrigin(req)) return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });
    return ProfessionalVerification.handle(req, res, { queryValue });
  }

  const auth = await import('../lib/auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));

  if (req.method === 'GET') {
    const csrfToken = auth.createCsrfToken();
    const supabaseAuthenticated = auth.isSupabaseSession(session);
    const rollbackSession = auth.isRollbackSession(session);
    const identityContract = supabaseAuthenticated
      ? 'supabase-v1'
      : (rollbackSession ? 'legacy-password-rollback' : (session ? `legacy-v${session.v}` : ''));
    res.setHeader('Set-Cookie', auth.csrfCookie(csrfToken));
    return res.status(200).json({
      authenticated:Boolean(session),
      user:publicUser(session),
      sessionVersion:Number(session?.v || 0),
      identityContract,
      supabaseAuthenticated,
      rollbackSession,
      authUser:supabaseAuthenticated ? {
        id:session.authUid,
        role:session.authRole,
        status:session.authStatus,
        // Whether this session may open the admin console. The address list
        // lives on the server, so the console never has to carry its own copy —
        // a copy that would lock out a co-administrator the server allows.
        adminConsole:session.authRole === 'admin'
          && session.authStatus === 'active'
          && AdminAccess.isAdminEmail(session.email),
      } : null,
      sessionHours:auth.SESSION_TTL_SECONDS / 3600,
      hardened:auth.secureConfigurationEnabled(),
      accessConfigured:auth.accessConfigurationEnabled(),
      passwordFallbackConfigured:auth.accessConfigurationEnabled(),
      googleConfigured:auth.googleConfigurationEnabled(),
      googleClientId:auth.googleConfigurationEnabled() ? auth.googleClientId() : '',
      sessionConfigured:auth.sessionConfigurationEnabled(),
      csrfToken,
    });
  }

  if (req.method === 'DELETE') {
    if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });
    res.setHeader('Set-Cookie', [auth.expiredSessionCookie(), auth.expiredEnrollmentCookie(), auth.expiredCsrfCookie()]);
    return res.status(200).json({ ok:true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error:'Metoda nuk lejohet.' });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error:'Origjina e kërkesës nuk lejohet.' });

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) return res.status(415).json({ error:'Kërkohet Content-Type application/json.' });
  const anyDoorConfigured = auth.googleConfigurationEnabled()
    || SupabasePassword.configurationEnabled()
    || auth.accessConfigurationEnabled();
  if (!auth.sessionConfigurationEnabled() || !anyDoorConfigured) {
    return res.status(503).json({
      code:'AUTH_NOT_CONFIGURED',
      error:'Konfigurimi privat i hyrjes mungon në server. Vendos SESSION_SECRET dhe së paku një hyrje: GOOGLE_CLIENT_ID ose çelësin publik të Supabase.',
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
    const suppliedCsrf = String(req.headers['x-csrf-token'] || body.csrfToken || '');
    if (!auth.verifyCsrfToken(req, suppliedCsrf)) {
      state.count += 1;
      setRateLimitHeaders(res, state);
      return res.status(403).json({ code:'CSRF_INVALID', error:'Kontrolli i sigurisë së hyrjes skadoi. Rifresko faqen.' });
    }

    // Registration with an email address. It creates nothing but a pending
    // Supabase account: the professional document and the admin's approval are
    // still ahead of it, exactly as with Google.
    if (String(body.action || '').trim() === 'signup') {
      const created = await SupabasePassword.signUp(body);
      attempts.delete(ip);
      return res.status(201).json({
        ok:true,
        code:created.confirmationRequired ? 'EMAIL_CONFIRMATION_SENT' : 'SIGNUP_COMPLETE',
        email:created.email,
        confirmationRequired:created.confirmationRequired,
        message:created.confirmationRequired
          ? 'Nëse ky email është i lirë, të dërguam një mesazh konfirmimi. Hape atë dhe pastaj hyr për të ngarkuar dokumentin profesional.'
          : 'Llogaria u krijua. Hyr për të ngarkuar dokumentin profesional.',
      });
    }

    if (String(body.action || '').trim() === 'reset') {
      await SupabasePassword.requestPasswordReset(body);
      attempts.delete(ip);
      return res.status(200).json({
        ok:true,
        code:'PASSWORD_RESET_SENT',
        message:'Nëse ky email ka llogari, të dërguam një lidhje për ta ndryshuar fjalëkalimin.',
      });
    }

    let user;
    let provider;
    let canonicalIdentity = null;
    if (String(body.credential || '').trim()) {
      if (!auth.googleConfigurationEnabled()) return res.status(503).json({ code:'GOOGLE_NOT_CONFIGURED', error:'Hyrja me Google nuk është konfiguruar ende.' });
      const credential = String(body.credential || '').trim();
      const googleIdentity = await verifyGoogleIdToken(credential, {
        clientId:auth.googleClientId(),
        nonce:sha256Hex(suppliedCsrf),
      });
      const exchanged = await exchangeGoogleIdToken({ credential, nonce:suppliedCsrf });
      if (String(exchanged.user.email || '').toLowerCase() !== String(googleIdentity.email || '').toLowerCase()) {
        throw cutoverError('AUTH_IDENTITY_MISMATCH', 'Google dhe Supabase kthyen identitete të ndryshme.');
      }
      canonicalIdentity = await SupabaseAuth.identityFromRequest({
        headers:{ authorization:`Bearer ${exchanged.accessToken}` },
      });
      if (canonicalIdentity.id !== exchanged.user.id || canonicalIdentity.email !== String(googleIdentity.email || '').toLowerCase()) {
        throw cutoverError('PROFILE_IDENTITY_MISMATCH', 'Profili MedIndex nuk përputhet me identitetin Supabase.');
      }

      if (canonicalIdentity.status === 'pending') {
        attempts.delete(ip);
        return pendingEnrollment(res, canonicalIdentity);
      }
      user = await approvedSupabaseUser(canonicalIdentity, {
        sub:googleIdentity.sub,
        name:googleIdentity.name,
        picture:googleIdentity.picture,
      });
      provider = 'supabase-google';
    } else if (String(body.email || '').trim() && String(body.password || '')) {
      // The second Supabase door. Once the access token is in hand this path is
      // identical to Google's: the same profile lookup, the same pending gate,
      // the same approval requirement. Only the proof of identity differs.
      const signedIn = await SupabasePassword.signIn(body);
      canonicalIdentity = await SupabaseAuth.identityFromRequest({
        headers:{ authorization:`Bearer ${signedIn.accessToken}` },
      });
      if (canonicalIdentity.id !== signedIn.userId || canonicalIdentity.email !== signedIn.email) {
        throw cutoverError('PROFILE_IDENTITY_MISMATCH', 'Profili MedIndex nuk përputhet me identitetin Supabase.');
      }

      if (canonicalIdentity.status === 'pending') {
        attempts.delete(ip);
        return pendingEnrollment(res, canonicalIdentity);
      }
      user = await approvedSupabaseUser(canonicalIdentity, {
        sub:`supabase:${canonicalIdentity.id}`,
        name:signedIn.fullName || canonicalIdentity.profile?.fullName || '',
        picture:canonicalIdentity.profile?.avatarUrl || '',
      });
      provider = 'supabase-password';
    } else {
      if (!auth.accessConfigurationEnabled()) return res.status(403).json({ error:'Hyrja me password rezervë nuk është aktive.' });
      const password = String(body.password || '').slice(0, MAX_PASSWORD_CHARS);
      if (!password || !auth.verifyAccessCode(password)) {
        state.count += 1;
        attempts.set(ip, state);
        setRateLimitHeaders(res, state);
        await new Promise(resolve => setTimeout(resolve, 250));
        return res.status(401).json({ error:'Password-i nuk është i saktë.' });
      }
      user = await ensureLoginUser({ email:UserStore.OWNER_EMAIL, name:'Diellza Rabushaj' });
      provider = 'legacy-password';
    }

    attempts.delete(ip);
    const sessionToken = auth.createSessionToken({
      uid:user.id,
      authUid:canonicalIdentity?.id || '',
      sub:user.sub || (provider === 'legacy-password' ? 'password-owner' : ''),
      email:user.email,
      role:user.role,
      name:user.name,
      authRole:canonicalIdentity?.role || '',
      authStatus:canonicalIdentity?.status || '',
      provider,
    });
    const nextCsrf = auth.createCsrfToken();
    res.setHeader('Set-Cookie', [auth.sessionCookie(sessionToken), auth.expiredEnrollmentCookie(), auth.csrfCookie(nextCsrf)]);
    res.setHeader('RateLimit-Remaining', String(MAX_ATTEMPTS));
    return res.status(200).json({
      ok:true,
      expiresIn:auth.SESSION_TTL_SECONDS,
      hardened:true,
      provider:{ 'supabase-google':'google', 'supabase-password':'email' }[provider] || 'password',
      sessionVersion:auth.SESSION_VERSION,
      identityContract:auth.SUPABASE_PROVIDERS.includes(provider) ? 'supabase-v1' : 'legacy-password-rollback',
      supabaseAuthenticated:auth.SUPABASE_PROVIDERS.includes(provider),
      rollbackSession:provider === 'legacy-password',
      user:{ email:user.email, role:user.role, name:user.name },
      authUser:canonicalIdentity ? {
        id:canonicalIdentity.id,
        role:canonicalIdentity.role,
        status:canonicalIdentity.status,
      } : null,
    });
  } catch (error) {
    console.error('Auth error:', error?.code || error?.message || error);
    if (error?.code === 'BODY_TOO_LARGE') return res.status(413).json({ error:'Kërkesa është tepër e madhe.' });
    if (error?.code === 'EMAIL_NOT_ALLOWED' || error?.code === 'USER_DISABLED') return res.status(403).json({ code:error.code, error:error.message });
    if (error?.code === 'GOOGLE_KEYS_UNAVAILABLE') return res.status(503).json({ code:error.code, error:'Google nuk u përgjigj për verifikim. Provo përsëri.' });
    if (/^GOOGLE_/.test(String(error?.code || ''))) return res.status(401).json({ code:error.code, error:error.message });
    if (error instanceof SupabasePassword.SupabasePasswordError) {
      // A wrong password has to cost the same as a wrong access code, or the
      // per-IP limiter never trips and the email door is the soft one.
      if (error.code === 'INVALID_CREDENTIALS') {
        const state = activeAttemptState(ip);
        state.count += 1;
        attempts.set(ip, state);
        setRateLimitHeaders(res, state);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      return res.status(Number(error.status) || 400).json({ code:error.code, error:error.message });
    }
    if (error instanceof SupabaseBootstrapError || error instanceof SupabaseAuth.SupabaseAuthError) {
      return res.status(Number(error.status) || 400).json({ code:error.code, error:error.message });
    }
    if (/^(AUTH_IDENTITY_MISMATCH|PROFILE_IDENTITY_MISMATCH|LEGACY_OWNER_MAPPING_MISSING|LEGACY_OWNER_MAPPING_MISMATCH)$/.test(String(error?.code || ''))) {
      return res.status(Number(error.status) || 409).json({ code:error.code, error:error.message });
    }
    const configurationError = /SESSION_SECRET|ACCESS_CODE|GOOGLE_CLIENT_ID|SUPABASE|çelësi privat/i.test(String(error?.message || ''));
    return res.status(configurationError ? 503 : 400).json({
      error:configurationError ? 'Konfigurimi privat i hyrjes mungon në server.' : 'Kërkesa e hyrjes nuk u përfundua.',
    });
  }
};

module.exports._test = {
  clientIp,
  sameOrigin,
  declaredBodySize,
  queryValue,
  libraryRequested,
  profilePhotoRequested,
  resetRequested,
  releaseRequested,
  deploymentRelease,
  browserResetPage,
  sha256Hex,
  ownerFallbackUser,
  ownerStoreUnavailable,
  ensureLoginUser,
  cutoverError,
  MAX_ATTEMPTS,
  MAX_BODY_BYTES,
  MAX_PASSWORD_CHARS,
  WINDOW_MS,
};
