'use strict';

// Email + password registration and sign-in against Supabase Auth (GoTrue).
//
// Google was the only door. This opens a second one for clinicians who do not
// use a Google account, and it deliberately arrives in exactly the same place:
// the `auth.users` trigger creates `public.profiles` as `pending`, the account
// still owes a professional document, and an admin still has to approve it.
// Nothing here grants access — it only establishes who is asking.

const DEFAULT_TIMEOUT_MS = 8000;
const MIN_PASSWORD_CHARS = 10;
const MAX_PASSWORD_CHARS = 200;
const MAX_EMAIL_CHARS = 320;
const MAX_NAME_CHARS = 160;

class SupabasePasswordError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'SupabasePasswordError';
    this.code = code;
    this.status = status;
  }
}

function supabaseUrl() {
  return String(
    process.env.MEDINDEX_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ftuchtmolddhhsdcwnqe.supabase.co',
  ).replace(/\/+$/, '');
}

function publishableKey() {
  return String(
    process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '',
  ).trim();
}

function requireConfiguration() {
  const key = publishableKey();
  if (!key) {
    throw new SupabasePasswordError('SUPABASE_AUTH_NOT_CONFIGURED', 'Hyrja me email nuk është konfiguruar në server.', 503);
  }
  return { url:supabaseUrl(), key };
}

function normalizedEmail(value) {
  const email = String(value ?? '').trim().toLowerCase().slice(0, MAX_EMAIL_CHARS);
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    throw new SupabasePasswordError('EMAIL_INVALID', 'Shkruaj një email të vlefshëm.', 400);
  }
  return email;
}

// A medical registry is not the place for a six-character password, which is all
// GoTrue asks for by default. Length does most of the work; the distinct-character
// floor exists so "aaaaaaaaaa" cannot pass a pure length check.
function assertPassword(value) {
  const password = String(value ?? '');
  if (password.length > MAX_PASSWORD_CHARS) {
    throw new SupabasePasswordError('PASSWORD_TOO_LONG', 'Fjalëkalimi është tepër i gjatë.', 400);
  }
  if (password.length < MIN_PASSWORD_CHARS) {
    throw new SupabasePasswordError('PASSWORD_TOO_WEAK', `Fjalëkalimi duhet të ketë së paku ${MIN_PASSWORD_CHARS} shenja.`, 400);
  }
  if (new Set(password).size < 4) {
    throw new SupabasePasswordError('PASSWORD_TOO_WEAK', 'Fjalëkalimi duhet të përmbajë shenja më të ndryshme.', 400);
  }
  return password;
}

async function readJson(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function gotrue(path, body, options = {}) {
  const config = requireConfiguration();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(`${config.url}${path}`, {
      method:'POST',
      headers:{ apikey:config.key, 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify(body),
      signal:controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new SupabasePasswordError('AUTH_UPSTREAM_TIMEOUT', 'Supabase nuk u përgjigj në kohë.', 503);
    throw new SupabasePasswordError('AUTH_UPSTREAM_UNAVAILABLE', 'Supabase nuk është i arritshëm.', 503);
  } finally {
    clearTimeout(timer);
  }

  const data = await readJson(response);
  if (response.ok) return data;

  const code = String(data?.error_code || data?.error || '').toLowerCase();
  const description = String(data?.msg || data?.error_description || data?.message || '').toLowerCase();

  if (response.status === 429) {
    throw new SupabasePasswordError('AUTH_RATE_LIMITED', 'Shumë tentativa. Provo përsëri pas pak.', 429);
  }
  if (code.includes('email_not_confirmed') || description.includes('email not confirmed')) {
    throw new SupabasePasswordError('EMAIL_NOT_CONFIRMED', 'Konfirmo emailin nga mesazhi që të dërguam, pastaj hyr.', 403);
  }
  if (code.includes('weak_password') || description.includes('password')) {
    throw new SupabasePasswordError('PASSWORD_TOO_WEAK', `Fjalëkalimi duhet të ketë së paku ${MIN_PASSWORD_CHARS} shenja.`, 400);
  }
  if (response.status === 400 || response.status === 401) {
    throw new SupabasePasswordError('INVALID_CREDENTIALS', 'Emaili ose fjalëkalimi nuk është i saktë.', 401);
  }
  throw new SupabasePasswordError('AUTH_UPSTREAM_ERROR', 'Regjistrimi nuk u përfundua.', 503);
}

// GoTrue answers 200 for an address that already exists, so this response can
// never say whether the email was new. That silence is the point: a signup form
// that distinguishes the two is an account-enumeration oracle.
async function signUp(input = {}, options = {}) {
  const email = normalizedEmail(input.email);
  const password = assertPassword(input.password);
  const fullName = String(input.fullName ?? '').trim().slice(0, MAX_NAME_CHARS);

  const data = await gotrue('/auth/v1/signup', {
    email,
    password,
    data:fullName ? { full_name:fullName } : {},
  }, options);

  const user = data?.user && typeof data.user === 'object' ? data.user : data;
  const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  return {
    ok:true,
    email,
    // A project with email confirmation on returns a user with no session; one
    // with it off signs the account in immediately. The caller needs to know
    // which happened to decide where to send the person next.
    confirmationRequired:!confirmed,
    accessToken:String(data?.access_token || ''),
    userId:String(user?.id || ''),
  };
}

async function signIn(input = {}, options = {}) {
  const email = normalizedEmail(input.email);
  const password = String(input.password ?? '');
  if (!password || password.length > MAX_PASSWORD_CHARS) {
    throw new SupabasePasswordError('INVALID_CREDENTIALS', 'Emaili ose fjalëkalimi nuk është i saktë.', 401);
  }

  const data = await gotrue('/auth/v1/token?grant_type=password', { email, password }, options);
  const accessToken = String(data?.access_token || '');
  if (!accessToken) {
    throw new SupabasePasswordError('INVALID_CREDENTIALS', 'Emaili ose fjalëkalimi nuk është i saktë.', 401);
  }
  const user = data?.user && typeof data.user === 'object' ? data.user : {};
  return {
    accessToken,
    userId:String(user.id || ''),
    email:String(user.email || email).trim().toLowerCase(),
    fullName:String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim().slice(0, MAX_NAME_CHARS),
  };
}

async function requestPasswordReset(input = {}, options = {}) {
  const email = normalizedEmail(input.email);
  // Same reasoning as signup: the answer is identical whether or not the address
  // is registered.
  try {
    await gotrue('/auth/v1/recover', { email }, options);
  } catch (error) {
    if (error?.status === 429) throw error;
  }
  return { ok:true, email };
}

// Whether this deployment can serve the email door at all. The publishable key
// is the only secret it needs; everything else is per-request.
function configurationEnabled() {
  return Boolean(publishableKey());
}

module.exports = {
  SupabasePasswordError,
  configurationEnabled,
  MIN_PASSWORD_CHARS,
  MAX_PASSWORD_CHARS,
  signUp,
  signIn,
  requestPasswordReset,
  _test:{ normalizedEmail, assertPassword, supabaseUrl, publishableKey, requireConfiguration },
};
