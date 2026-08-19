'use strict';

const DEFAULT_TIMEOUT_MS = 10000;

function supabaseUrl() {
  return String(
    process.env.MEDINDEX_SUPABASE_URL
    || process.env.SUPABASE_URL
    || 'https://ftuchtmolddhhsdcwnqe.supabase.co'
  ).replace(/\/+$/, '');
}

function publishableKey() {
  return String(
    process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || ''
  ).trim();
}

class SupabaseBootstrapError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'SupabaseBootstrapError';
    this.code = code;
    this.status = status;
  }
}

async function responseJson(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function exchangeGoogleIdToken({ credential, nonce, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const idToken = String(credential || '').trim();
  const rawNonce = String(nonce || '').trim();
  const key = publishableKey();
  if (!key) throw new SupabaseBootstrapError('SUPABASE_AUTH_NOT_CONFIGURED', 'Supabase publishable key is missing.', 503);
  if (!idToken) throw new SupabaseBootstrapError('GOOGLE_CREDENTIAL_MISSING', 'Google credential is missing.', 400);
  if (!rawNonce) throw new SupabaseBootstrapError('AUTH_NONCE_MISSING', 'Authentication nonce is missing.', 400);
  if (typeof fetchImpl !== 'function') throw new SupabaseBootstrapError('AUTH_UPSTREAM_UNAVAILABLE', 'Fetch is unavailable.', 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(30000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)));
  let response;
  try {
    response = await fetchImpl(`${supabaseUrl()}/auth/v1/token?grant_type=id_token`, {
      method:'POST',
      headers:{
        apikey:key,
        'Content-Type':'application/json',
        Accept:'application/json',
      },
      body:JSON.stringify({
        provider:'google',
        id_token:idToken,
        nonce:rawNonce,
      }),
      signal:controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new SupabaseBootstrapError('AUTH_UPSTREAM_TIMEOUT', 'Supabase Auth timed out.', 503);
    throw new SupabaseBootstrapError('AUTH_UPSTREAM_UNAVAILABLE', 'Supabase Auth is unavailable.', 503);
  } finally {
    clearTimeout(timer);
  }

  const payload = await responseJson(response);
  if (!response.ok) {
    const upstreamMessage = String(payload?.msg || payload?.message || payload?.error_description || '').trim();
    throw new SupabaseBootstrapError(
      'SUPABASE_GOOGLE_EXCHANGE_FAILED',
      upstreamMessage || 'Supabase rejected the Google ID token.',
      response.status === 429 ? 429 : (response.status >= 500 ? 503 : 401),
    );
  }

  const accessToken = String(payload?.access_token || '').trim();
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : null;
  const userId = String(user?.id || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!accessToken || !userId || !email) {
    throw new SupabaseBootstrapError('SUPABASE_AUTH_RESPONSE_INVALID', 'Supabase Auth returned an incomplete session.', 502);
  }

  return { accessToken, user:{ id:userId, email } };
}

module.exports = {
  SupabaseBootstrapError,
  exchangeGoogleIdToken,
  _test:{ supabaseUrl, publishableKey, responseJson, DEFAULT_TIMEOUT_MS },
};
