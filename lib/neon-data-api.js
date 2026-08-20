'use strict';

// Legacy filename kept to avoid a risky repo-wide import rename during the cutover.
// Runtime database traffic is Supabase-only from this point forward.
const SUPABASE_URL = String(
  process.env.MEDINDEX_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://ftuchtmolddhhsdcwnqe.supabase.co'
).replace(/\/+$/, '');
const SUPABASE_DATA_API_BASE = `${SUPABASE_URL}/rest/v1`;
// Compatibility export: callers that still reference DATA_API_BASE receive Supabase.
const DATA_API_BASE = SUPABASE_DATA_API_BASE;
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
const SUPABASE_BASE_READ_RELATIONS = new Set([
  'clinical_sources',
  'content_versions',
  'dosage_regimens',
  'drug_clinical_profiles',
  'drug_indications',
  'drugs',
  'icd_codes',
  'icd_hierarchy_nodes',
  'icd_hierarchy_revisions',
  'lab_categories',
  'lab_tests',
  'generic_dosage_regimen_templates',
  'product_dosage_regimens',
  'icd_hierarchy_active',
]);
const PRIVATE_SERVER_RELATIONS = new Set([
  'medindex_users',
  'profiles',
  'verification_documents',
  'user_drugs',
  'user_favorites',
  'user_prescriptions',
  'drive_sync_sources',
  'drive_sheet_rows',
  'sync_runs',
  'sync_outbox',
  'audit_logs',
]);

// Compatibility shims. Neon is intentionally disconnected from runtime.
function configuredToken() { return ''; }
function hasNeonConfig() { return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY); }
function readProvider() { return 'supabase'; }
function writeProvider() { return 'supabase'; }
async function oidcToken() { return ''; }

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
  const configured = Number(process.env.MEDINDEX_DATA_API_MAX_READ_ROWS);
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

function relationFromPath(path) {
  const parsed = parsedDataPath(path);
  return parsed ? parsed.pathname.replace(/^\/+/, '').split('/')[0] : '';
}

function isSupabaseMedicalRelation(relation) {
  if (!relation) return false;
  if (SUPABASE_BASE_READ_RELATIONS.has(relation)) return true;
  if (relation.startsWith('dose_')) return true;
  if (relation.startsWith('medindex_') && relation !== 'medindex_users') return true;
  return false;
}

function isPrivateServerRelation(relation) {
  return PRIVATE_SERVER_RELATIONS.has(relation);
}

function shouldUseSupabaseRead(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return method === 'GET' && !isPrivateServerRelation(relationFromPath(path));
}

function shouldUseSupabaseServer(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') return true;
  return isPrivateServerRelation(relationFromPath(path));
}

function targetedRead(params) {
  for (const key of TARGET_FILTER_KEYS) {
    const value = params.get(key);
    if (value && /^(?:eq|in)\./i.test(value)) return true;
  }
  return false;
}

// Retained as an explicit utility for callers/tests. Supabase reads in neonRequest
// follow the already-validated Phase 2 behavior and are not routed back to Neon.
function assertEgressSafeRead(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' || envFlag('MEDINDEX_ALLOW_BULK_DATA_API_READS')) return;

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
    `Data API egress guard blocked a broad ${table} read. `
      + `Use a targeted filter and LIMIT <= ${maximum} for bulk-sensitive runtime reads.`
  );
  error.code = 'DATA_API_EGRESS_GUARD';
  error.status = 429;
  error.table = table;
  error.maximumRows = maximum;
  throw error;
}

async function parseApiResponse(response, provider) {
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
    const error = new Error(`${provider} Data API ${response.status}: ${detail || response.statusText}`);
    error.status = response.status;
    error.payload = data;
    error.provider = provider.toLowerCase();
    throw error;
  }

  return { data, response };
}

function secretAuthorizationHeaders(key) {
  if (!key || key.startsWith('sb_')) return {};
  return { Authorization:`Bearer ${key}` };
}

async function supabaseRequest(path, options = {}, requestOptions = {}) {
  const privileged = requestOptions.privileged === true;
  const key = privileged ? SUPABASE_SECRET_KEY : SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error(privileged
      ? 'Supabase server secret key is not available.'
      : 'Supabase publishable key is not available.');
  }

  const method = String(options.method || 'GET').toUpperCase();
  const controller = options.signal ? null : new AbortController();
  const timeout = controller && Number(options.timeoutMs) > 0
    ? setTimeout(() => controller.abort(), Number(options.timeoutMs))
    : null;
  try {
    const response = await fetch(`${SUPABASE_DATA_API_BASE}/${String(path).replace(/^\/+/, '')}`, {
      method,
      headers:{
        apikey:key,
        ...secretAuthorizationHeaders(privileged ? key : ''),
        Accept:'application/json',
        ...(options.body !== undefined ? { 'Content-Type':'application/json' } : {}),
        ...(options.prefer ? { Prefer:options.prefer } : {}),
        ...(options.headers || {}),
      },
      body:options.body === undefined ? undefined : JSON.stringify(options.body),
      signal:options.signal || controller?.signal,
    });
    return await parseApiResponse(response, 'Supabase');
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${options.label || 'Supabase Data API'} timed out.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Compatibility name retained so the rest of the application can be migrated
// without a risky all-at-once import rename. This function never calls Neon.
async function neonRequest(path, options = {}) {
  const privileged = shouldUseSupabaseServer(path, options);
  if (privileged && !SUPABASE_SECRET_KEY) {
    throw new Error('Supabase server secret key is required for private reads and writes.');
  }
  return supabaseRequest(path, options, { privileged });
}

function exactCount(response) {
  const value = response?.headers?.get?.('content-range') || '';
  const total = Number(value.split('/').pop());
  return Number.isFinite(total) ? total : null;
}

module.exports = {
  DATA_API_BASE,
  SUPABASE_DATA_API_BASE,
  configuredToken,
  hasNeonConfig,
  readProvider,
  writeProvider,
  dataOf,
  isRelationMissing,
  oidcToken,
  neonRequest,
  supabaseRequest,
  exactCount,
  assertEgressSafeRead,
  maximumReadRows,
  _test:{
    relationFromPath,
    isSupabaseMedicalRelation,
    isPrivateServerRelation,
    shouldUseSupabaseRead,
    shouldUseSupabaseServer,
    secretAuthorizationHeaders,
  },
};
