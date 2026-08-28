'use strict';

const SUPABASE_URL = String(
  process.env.MEDINDEX_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://ftuchtmolddhhsdcwnqe.supabase.co'
).replace(/\/+$/, '');

const SUPABASE_PUBLISHABLE_KEY = String(
  process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_HVz4u_h5jfcuejVWY44AsA_nk38rGa-'
).trim();

const SUPABASE_SECRET_KEY = String(
  process.env.MEDINDEX_SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.MEDINDEX_SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || ''
).trim();

const DATA_API_BASE = `${SUPABASE_URL}/rest/v1`;

function authorizationHeaders(key) {
  if (!key || key.startsWith('sb_')) return {};
  return { Authorization:`Bearer ${key}` };
}

async function parseResponse(response) {
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = raw; }
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? data.message || data.details || data.hint || JSON.stringify(data)
      : raw;
    const error = new Error(`Supabase Data API ${response.status}: ${detail || response.statusText}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return { data, response };
}

async function supabaseRequest(path, options = {}) {
  const privileged = options.privileged === true;
  const key = privileged ? SUPABASE_SECRET_KEY : SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error(privileged
    ? 'Supabase server secret key is not configured.'
    : 'Supabase publishable key is not configured.');

  const controller = options.signal ? null : new AbortController();
  const timeoutMs = Math.max(500, Math.min(30_000, Number(options.timeoutMs) || 6_000));
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${DATA_API_BASE}/${String(path || '').replace(/^\/+/, '')}`, {
      method:String(options.method || 'GET').toUpperCase(),
      headers:{
        apikey:key,
        ...authorizationHeaders(key),
        Accept:'application/json',
        ...(options.body !== undefined ? { 'Content-Type':'application/json' } : {}),
        ...(options.prefer ? { Prefer:options.prefer } : {}),
        ...(options.headers || {}),
      },
      body:options.body === undefined ? undefined : JSON.stringify(options.body),
      signal:options.signal || controller?.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error(`${options.label || 'Supabase request'} timed out.`);
      timeout.code = 'SUPABASE_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function exactCount(response) {
  const value = response?.headers?.get?.('content-range') || '';
  const total = Number(value.split('/').pop());
  return Number.isFinite(total) ? total : null;
}

module.exports = {
  SUPABASE_URL,
  DATA_API_BASE,
  supabaseRequest,
  exactCount,
  _test:{ authorizationHeaders, parseResponse },
};
