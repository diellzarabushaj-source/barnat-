'use strict';

const DATA_API_BASE = String(
  process.env.MEDINDEX_NEON_DATA_API_URL
  || process.env.NEON_DATA_API_URL
  || 'https://ep-sweet-sun-afpg3338.apirest.c-2.us-west-2.aws.neon.tech/neondb/rest/v1'
).replace(/\/+$/, '');

const DEFAULT_MAX_READ_ROWS = 250;
const BULK_READ_TABLES = new Set([
  'drugs',
  'dosage_regimens',
  'icd_codes',
  'lab_tests',
  'drive_sheet_rows',
  'audit_logs',
]);
const TARGET_FILTER_KEYS = new Set([
  'id',
  'registry_number',
  'pdid',
  'drug_id',
  'source_key',
  'regimen_code',
  'code',
  'form_name',
  'spreadsheet_id',
  'sheet_name',
  'category_number',
  'source_id',
  'row_key',
]);

let tokenPromise = null;

function configuredToken() {
  return process.env.MEDINDEX_NEON_DATA_API_TOKEN
    || process.env.NEON_DATA_API_TOKEN
    || process.env.VERCEL_OIDC_TOKEN
    || '';
}

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

function envFlag(name) {
  return ['1', 'TRUE', 'YES', 'ON'].includes(String(process.env[name] || '').trim().toUpperCase());
}

function maximumReadRows() {
  const configured = Number(process.env.MEDINDEX_NEON_MAX_READ_ROWS);
  return Number.isFinite(configured) && configured >= 1
    ? Math.min(1000, Math.floor(configured))
    : DEFAULT_MAX_READ_ROWS;
}

function parsedDataPath(path) {
  try {
    return new URL(String(path || '').replace(/^\/+/, ''), 'https://medindex.local/');
  } catch {
    return null;
  }
}

function targetedRead(params) {
  for (const key of TARGET_FILTER_KEYS) {
    const value = params.get(key);
    if (value && /^(?:eq|in)\./i.test(value)) return true;
  }
  return false;
}

function assertEgressSafeRead(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' || envFlag('MEDINDEX_ALLOW_BULK_NEON_READS')) return;

  const parsed = parsedDataPath(path);
  if (!parsed) return;
  const table = parsed.pathname.replace(/^\/+/, '').split('/')[0];
  if (!BULK_READ_TABLES.has(table)) return;

  const limitRaw = parsed.searchParams.get('limit');
  const limit = limitRaw === null ? null : Number(limitRaw);
  const maximum = maximumReadRows();
  const isTargeted = targetedRead(parsed.searchParams);
  const broadWithoutLimit = limit === null && !isTargeted;
  const oversized = limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > maximum);

  if (!broadWithoutLimit && !oversized) return;

  const error = new Error(
    `Neon egress guard blocked a broad ${table} read. `
      + `Use a targeted filter and LIMIT <= ${maximum}, or an offline/Sheets dataset for bulk runtime reads.`
  );
  error.code = 'NEON_EGRESS_GUARD';
  error.status = 429;
  error.table = table;
  error.maximumRows = maximum;
  throw error;
}

async function oidcToken() {
  if (!tokenPromise) {
    const fallback = configuredToken();
    tokenPromise = import('@vercel/oidc')
      .then(async module => {
        try {
          return await module.getVercelOidcToken() || fallback;
        } catch {
          return fallback;
        }
      })
      .catch(() => fallback)
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function neonRequest(path, options = {}) {
  assertEgressSafeRead(path, options);

  const token = await oidcToken();
  if (!token) throw new Error('Neon Data API token is not available.');

  const controller = options.signal ? null : new AbortController();
  const timeout = controller && Number(options.timeoutMs) > 0
    ? setTimeout(() => controller.abort(), Number(options.timeoutMs))
    : null;
  try {
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
      signal:options.signal || controller?.signal,
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
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${options.label || 'Neon Data API'} timed out.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function exactCount(response) {
  const value = response?.headers?.get?.('content-range') || '';
  const total = Number(value.split('/').pop());
  return Number.isFinite(total) ? total : null;
}

module.exports = {
  DATA_API_BASE,
  configuredToken,
  hasNeonConfig,
  dataOf,
  isRelationMissing,
  oidcToken,
  neonRequest,
  exactCount,
  assertEgressSafeRead,
  maximumReadRows,
};
