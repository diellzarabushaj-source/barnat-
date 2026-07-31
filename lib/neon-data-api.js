'use strict';

const DATA_API_BASE = String(
  process.env.MEDINDEX_NEON_DATA_API_URL
  || 'https://ep-sweet-sun-afpg3338.apirest.c-2.us-west-2.aws.neon.tech/neondb/rest/v1'
).replace(/\/+$/, '');

let tokenPromise = null;
let diagnosticLogged = false;

async function oidcToken() {
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  if (!tokenPromise) {
    tokenPromise = import('@vercel/oidc')
      .then(module => module.getVercelOidcToken())
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

function safeOidcClaims(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8'));
    return {
      sub:String(payload.sub || ''),
      owner:String(payload.owner || ''),
      owner_id:String(payload.owner_id || ''),
      project:String(payload.project || ''),
      project_id:String(payload.project_id || ''),
      environment:String(payload.environment || ''),
      issuer:String(payload.iss || ''),
      audience:Array.isArray(payload.aud) ? payload.aud.join(',') : String(payload.aud || ''),
    };
  } catch {
    return { invalid:true };
  }
}

async function neonRequest(path, options = {}) {
  const token = await oidcToken();
  if (!token) throw new Error('Vercel OIDC token is not available.');

  if (!diagnosticLogged) {
    diagnosticLogged = true;
    console.info('MedIndex OIDC diagnostic:', safeOidcClaims(token));
  }

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
  oidcToken,
  neonRequest,
  exactCount,
};
