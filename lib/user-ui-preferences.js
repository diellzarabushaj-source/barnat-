'use strict';

const { supabaseRequest } = require('./supabase-data-api.js');

const COLUMN_IDS = Object.freeze([
  'registry','name','substance','strength','form','atc',
  'adultDose','pediatricDose','status','price',
]);
const DEFAULT_COLUMNS = Object.freeze([...COLUMN_IDS]);
const REQUIRED_COLUMNS = Object.freeze(['name']);
const MAX_BODY_BYTES = 8 * 1024;

class PreferencesError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'PreferencesError';
    this.status = status;
    this.code = code;
  }
}

const clean = value => String(value ?? '').trim();

function sameOrigin(req) {
  const origin = clean(req.headers?.origin);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
}

function uuid(value) {
  const result = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)
    ? result
    : '';
}

async function identity(req) {
  const auth = await import('./auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));
  if (!session) throw new PreferencesError(401, 'Kërkohet hyrje aktive në DRx.', 'AUTH_REQUIRED');
  const userId = uuid(session.authUid) || uuid(session.uid);
  if (!userId) throw new PreferencesError(409, 'Llogaria nuk ka identitet Supabase për preferencat.', 'PREFERENCES_ID_MISSING');
  return { userId, email:clean(session.email).toLowerCase() };
}

async function bodyJson(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new PreferencesError(413, 'Preferencat janë tepër të mëdha.', 'BODY_TOO_LARGE');
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
        throw new PreferencesError(413, 'Preferencat janë tepër të mëdha.', 'BODY_TOO_LARGE');
      }
    }
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new PreferencesError(400, 'JSON i preferencave nuk është valid.', 'BODY_INVALID'); }
}

function normalizeColumns(value) {
  const requested = Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
  const unique = [...new Set(requested)].filter(item => COLUMN_IDS.includes(item));
  for (const required of REQUIRED_COLUMNS) if (!unique.includes(required)) unique.unshift(required);
  return unique.length ? unique : [...DEFAULT_COLUMNS];
}

async function row(userId) {
  const { data } = await supabaseRequest(
    `user_preferences?select=user_id,preferences,updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { privileged:true, timeoutMs:5000, label:'UI preferences lookup' },
  );
  return Array.isArray(data) ? data[0] || null : null;
}

async function save(userId, preferences, exists) {
  const payload = {
    user_id:userId,
    preferences,
    updated_at:new Date().toISOString(),
  };
  if (exists) {
    const { data } = await supabaseRequest(
      `user_preferences?user_id=eq.${encodeURIComponent(userId)}`,
      {
        privileged:true,
        method:'PATCH',
        body:{ preferences:payload.preferences, updated_at:payload.updated_at },
        prefer:'return=representation',
        timeoutMs:5000,
        label:'UI preferences update',
      },
    );
    return Array.isArray(data) ? data[0] || payload : payload;
  }
  const { data } = await supabaseRequest('user_preferences', {
    privileged:true,
    method:'POST',
    body:payload,
    prefer:'return=representation',
    timeoutMs:5000,
    label:'UI preferences insert',
  });
  return Array.isArray(data) ? data[0] || payload : payload;
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie, Origin');
  if (!sameOrigin(req)) throw new PreferencesError(403, 'Origjina e kërkesës nuk lejohet.', 'ORIGIN_FORBIDDEN');

  const account = await identity(req);
  const existing = await row(account.userId);
  const preferences = existing?.preferences && typeof existing.preferences === 'object' && !Array.isArray(existing.preferences)
    ? existing.preferences
    : {};

  if (req.method === 'GET') {
    return res.status(200).json({
      ok:true,
      userId:account.userId,
      registryColumns:normalizeColumns(preferences.registryColumns),
      updatedAt:existing?.updated_at || '',
    });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const body = await bodyJson(req);
    const registryColumns = normalizeColumns(body.registryColumns);
    const nextPreferences = { ...preferences, registryColumns };
    const stored = await save(account.userId, nextPreferences, Boolean(existing));
    return res.status(200).json({
      ok:true,
      userId:account.userId,
      registryColumns,
      updatedAt:stored?.updated_at || new Date().toISOString(),
    });
  }

  res.setHeader('Allow', 'GET, PUT, PATCH');
  return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
}

async function route(req, res) {
  try { return await handle(req, res); }
  catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500 || !(error instanceof PreferencesError)) {
      console.error('UI preferences error:', error?.code || error?.message || error);
    }
    return res.status(status).json({
      ok:false,
      code:error?.code || '',
      error:status >= 500 ? 'Preferencat nuk mund të ruhen për momentin.' : clean(error?.message),
    });
  }
}

module.exports = {
  handle:route,
  _test:{ normalizeColumns, COLUMN_IDS, DEFAULT_COLUMNS, REQUIRED_COLUMNS, uuid, sameOrigin },
};
