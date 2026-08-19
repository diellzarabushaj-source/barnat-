'use strict';

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BEARER_CHARS = 16 * 1024;

function supabaseUrl() {
  return String(process.env.MEDINDEX_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ftuchtmolddhhsdcwnqe.supabase.co').replace(/\/+$/, '');
}

function publishableKey() {
  return String(process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
}

class SupabaseAuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = 'SupabaseAuthError';
    this.code = code;
    this.status = status;
  }
}

function bearerToken(req) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  if (!raw) return '';
  if (raw.length > MAX_BEARER_CHARS) throw new SupabaseAuthError('AUTH_HEADER_TOO_LARGE', 'Authorization header is too large.', 400);
  const match = /^Bearer\s+([^\s,]+)$/i.exec(raw);
  if (!match) throw new SupabaseAuthError('AUTH_HEADER_INVALID', 'Authorization header must use Bearer authentication.', 401);
  return match[1];
}

function requireBearerToken(req) {
  const token = bearerToken(req);
  if (!token) throw new SupabaseAuthError('AUTH_REQUIRED', 'Authentication is required.', 401);
  return token;
}

async function responseJson(response) {
  const raw = await response.text();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function timedFetch(url, options = {}, requestOptions = {}) {
  const fetchImpl = requestOptions.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available.');
  const timeoutMs = Number(requestOptions.timeoutMs) > 0 ? Math.min(30000, Number(requestOptions.timeoutMs)) : DEFAULT_TIMEOUT_MS;
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, { ...options, signal:options.signal || controller?.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new SupabaseAuthError('AUTH_UPSTREAM_TIMEOUT', 'Supabase Auth timed out.', 503);
    throw new SupabaseAuthError('AUTH_UPSTREAM_UNAVAILABLE', 'Supabase Auth is unavailable.', 503);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requireConfiguration() {
  const key = publishableKey();
  if (!key) throw new SupabaseAuthError('SUPABASE_AUTH_NOT_CONFIGURED', 'Supabase publishable key is not configured on the server.', 503);
  return { url:supabaseUrl(), key };
}

async function verifyAccessToken(token, options = {}) {
  const value = String(token || '').trim();
  if (!value) throw new SupabaseAuthError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (value.length > MAX_BEARER_CHARS) throw new SupabaseAuthError('AUTH_TOKEN_TOO_LARGE', 'Access token is too large.', 400);
  const config = requireConfiguration();
  const response = await timedFetch(`${config.url}/auth/v1/user`, {
    method:'GET',
    headers:{ apikey:config.key, Authorization:`Bearer ${value}`, Accept:'application/json' },
  }, options);
  const data = await responseJson(response);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new SupabaseAuthError('AUTH_TOKEN_INVALID', 'Supabase access token is invalid or expired.', 401);
    throw new SupabaseAuthError('AUTH_UPSTREAM_ERROR', 'Supabase Auth could not verify the access token.', 503);
  }
  const id = String(data?.id || '').trim();
  if (!id) throw new SupabaseAuthError('AUTH_TOKEN_INVALID', 'Supabase access token did not resolve to a user.', 401);
  return {
    id,
    email:String(data?.email || '').trim().toLowerCase(),
    userMetadata:data?.user_metadata && typeof data.user_metadata === 'object' ? data.user_metadata : {},
    appMetadata:data?.app_metadata && typeof data.app_metadata === 'object' ? data.app_metadata : {},
  };
}

async function loadOwnProfile(token, userId, options = {}) {
  const config = requireConfiguration();
  const select = 'id,full_name,avatar_url,specialty,license_number,role,status,created_at,updated_at';
  const path = `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=${encodeURIComponent(select)}`;
  const response = await timedFetch(`${config.url}${path}`, {
    method:'GET',
    headers:{ apikey:config.key, Authorization:`Bearer ${token}`, Accept:'application/json' },
  }, options);
  const data = await responseJson(response);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new SupabaseAuthError('PROFILE_FORBIDDEN', 'The authenticated user cannot access this MedIndex profile.', 403);
    throw new SupabaseAuthError('PROFILE_UPSTREAM_ERROR', 'MedIndex profile lookup failed.', 503);
  }
  const profile = Array.isArray(data) ? data[0] : null;
  if (!profile || String(profile.id || '') !== String(userId)) throw new SupabaseAuthError('PROFILE_MISSING', 'MedIndex profile is missing for this account.', 403);
  const role = String(profile.role || '').trim();
  const status = String(profile.status || '').trim();
  if (!['doctor', 'admin'].includes(role)) throw new SupabaseAuthError('PROFILE_ROLE_INVALID', 'MedIndex profile role is invalid.', 403);
  if (!['active', 'suspended', 'disabled'].includes(status)) throw new SupabaseAuthError('PROFILE_STATUS_INVALID', 'MedIndex profile status is invalid.', 403);
  return {
    id:String(profile.id),
    fullName:String(profile.full_name || '').trim(),
    avatarUrl:String(profile.avatar_url || '').trim(),
    specialty:String(profile.specialty || '').trim(),
    licenseNumber:String(profile.license_number || '').trim(),
    role,
    status,
  };
}

async function identityFromRequest(req, options = {}) {
  const token = requireBearerToken(req);
  const authUser = await verifyAccessToken(token, options);
  const profile = await loadOwnProfile(token, authUser.id, options);
  return { token, id:authUser.id, email:authUser.email, role:profile.role, status:profile.status, profile };
}

function assertActive(identity) {
  if (!identity || identity.status !== 'active') throw new SupabaseAuthError('ACCOUNT_INACTIVE', 'This MedIndex account is not active.', 403);
  return identity;
}

async function requireDoctor(req, options = {}) {
  const identity = assertActive(await identityFromRequest(req, options));
  if (!['doctor', 'admin'].includes(identity.role)) throw new SupabaseAuthError('DOCTOR_REQUIRED', 'Doctor access is required.', 403);
  return identity;
}

async function requireAdmin(req, options = {}) {
  const identity = assertActive(await identityFromRequest(req, options));
  if (identity.role !== 'admin') throw new SupabaseAuthError('ADMIN_REQUIRED', 'Administrator access is required.', 403);
  return identity;
}

function publicIdentity(identity) {
  if (!identity) return null;
  return {
    id:identity.id,
    email:identity.email,
    role:identity.role,
    status:identity.status,
    profile:identity.profile ? {
      fullName:identity.profile.fullName,
      avatarUrl:identity.profile.avatarUrl,
      specialty:identity.profile.specialty,
      licenseNumber:identity.profile.licenseNumber,
    } : null,
  };
}

module.exports = {
  SupabaseAuthError,
  bearerToken,
  requireBearerToken,
  verifyAccessToken,
  loadOwnProfile,
  identityFromRequest,
  requireDoctor,
  requireAdmin,
  publicIdentity,
  _test:{ supabaseUrl, publishableKey, responseJson, timedFetch, requireConfiguration, assertActive, DEFAULT_TIMEOUT_MS, MAX_BEARER_CHARS },
};
