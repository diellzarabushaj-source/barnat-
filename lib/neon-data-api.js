'use strict';

const DATA_API_BASE = String(
  process.env.MEDINDEX_NEON_DATA_API_URL
  || 'https://ep-sweet-sun-afpg3338.apirest.c-2.us-west-2.aws.neon.tech/neondb/rest/v1'
).replace(/\/+$/, '');

let tokenPromise = null;

function hasNeonConfig() {
  return Boolean(DATA_API_BASE);
}

function dataOf(result) {
  if (result && typeof result === 'object' && Object.hasOwn(result, 'data')) return result.data;
  return result;
}

function isRelationMissing(error) {
  const status = Number(error?.status || 0);
  const detail = [error?.message, error?.payload?.message, error?.payload?.details, error?.payload?.code]
    .filter(Boolean)
    .join(' ');
  return status === 404 || /(?:42P01|PGRST205|relation\s+.+\s+does not exist)/i.test(detail);
}

async function oidcToken() {
  if (!tokenPromise) {
    tokenPromise = import('@vercel/oidc')
      .then(async module => {
        const token = await module.getVercelOidcToken();
        return token || process.env.VERCEL_OIDC_TOKEN || '';
      })
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function neonRequest(path, options = {}) {
  const token = await oidcToken();
  if (!token) throw new Error('Vercel OIDC token is not available.');

  const response = await fetch(`${DATA_API_BASE}/${String(path).replace(/^\/+/, '')}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type':'application/json' } : {}),
      ...(options.prefer ? { Prefer:options.prefer } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

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
    const error = new Error(`Neon Data API ${response.status}: ${detail || response.statusText}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return { data, response };
}

function exactCount(response) {
  const value = response?.headers?.get?.('content-range') || '';
  const total = Number(value.split('/').pop());
  return Number.isFinite(total) ? total : null;
}

module.exports = {
  DATA_API_BASE,
  hasNeonConfig,
  dataOf,
  isRelationMissing,
  oidcToken,
  neonRequest,
  exactCount,
};
