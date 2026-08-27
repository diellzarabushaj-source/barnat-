'use strict';

const { neonRequest } = require('./neon-data-api.js');

const BUCKET = 'profile-avatars';
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8192;

class ProfileAvatarError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'ProfileAvatarError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function supabaseUrl() {
  return String(
    process.env.MEDINDEX_SUPABASE_URL
      || process.env.SUPABASE_URL
      || 'https://ftuchtmolddhhsdcwnqe.supabase.co',
  ).replace(/\/+$/, '');
}

function secretKey() {
  return String(
    process.env.MEDINDEX_SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.MEDINDEX_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || '',
  ).trim();
}

function serverHeaders(extra = {}) {
  const key = secretKey();
  if (!key) throw new ProfileAvatarError(503, 'Ruajtja e profilit nuk është konfiguruar.', 'SUPABASE_SECRET_MISSING');
  return {
    apikey:key,
    Authorization:`Bearer ${key}`,
    ...extra,
  };
}

function sameOrigin(req) {
  const origin = clean(req.headers?.origin);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
}

function queryValue(req, key) {
  if (req.query && req.query[key] !== undefined) {
    return Array.isArray(req.query[key]) ? String(req.query[key][0] || '') : String(req.query[key] || '');
  }
  try { return new URL(String(req.url || ''), 'https://drx.local').searchParams.get(key) || ''; }
  catch { return ''; }
}

async function authIdentity(req) {
  const auth = await import('./auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));
  if (!auth.isSupabaseSession(session)) {
    throw new ProfileAvatarError(401, 'Kërkohet hyrje aktive në DRx.', 'AUTH_REQUIRED');
  }
  return {
    authUid:clean(session.authUid, 80),
    email:clean(session.email, 320),
  };
}

function avatarPath(authUid) {
  if (!/^[0-9a-f-]{36}$/i.test(clean(authUid, 80))) {
    throw new ProfileAvatarError(400, 'Identiteti i profilit nuk është valid.', 'PROFILE_ID_INVALID');
  }
  return `${authUid}/avatar.jpg`;
}

function storageObjectUrl(storagePath) {
  const encodedPath = String(storagePath).split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl()}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedPath}`;
}

function isStoragePath(value, authUid) {
  return clean(value, 500) === avatarPath(authUid);
}

function trustedRemoteAvatar(value) {
  try {
    const url = new URL(clean(value, 1500));
    return url.protocol === 'https:'
      && (url.hostname === 'lh3.googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'));
  } catch {
    return false;
  }
}

function decodeAvatar(dataUrl) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!match) throw new ProfileAvatarError(415, 'Fotografia duhet të jetë JPEG.', 'AVATAR_TYPE_INVALID');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length) throw new ProfileAvatarError(400, 'Fotografia është bosh.', 'AVATAR_EMPTY');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ProfileAvatarError(413, 'Fotografia duhet të jetë më e vogël se 1 MB.', 'AVATAR_TOO_LARGE');
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    throw new ProfileAvatarError(415, 'Përmbajtja nuk është JPEG valid.', 'AVATAR_SIGNATURE_INVALID');
  }
  return buffer;
}

async function readJsonBody(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw new ProfileAvatarError(413, 'Fotografia është tepër e madhe.', 'BODY_TOO_LARGE');
  }
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_JSON_BYTES) {
      throw new ProfileAvatarError(413, 'Fotografia është tepër e madhe.', 'BODY_TOO_LARGE');
    }
    return req.body;
  }
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) {
        throw new ProfileAvatarError(413, 'Fotografia është tepër e madhe.', 'BODY_TOO_LARGE');
      }
    }
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new ProfileAvatarError(400, 'Kërkesa JSON nuk është valide.', 'BODY_INVALID'); }
}

async function profileRow(authUid) {
  const { data } = await neonRequest(
    `profiles?select=id,avatar_url,updated_at&id=eq.${encodeURIComponent(authUid)}&limit=1`,
    { timeoutMs:5000, label:'Profile avatar lookup' },
  );
  const profile = Array.isArray(data) ? data[0] : null;
  if (!profile || clean(profile.id, 80) !== authUid) {
    throw new ProfileAvatarError(404, 'Profili nuk u gjet.', 'PROFILE_MISSING');
  }
  return profile;
}

async function storageFetch(url, options = {}) {
  try { return await fetch(url, options); }
  catch { throw new ProfileAvatarError(503, 'Ruajtja e fotografisë nuk është në dispozicion.', 'STORAGE_UNAVAILABLE'); }
}

async function uploadAvatar(storagePath, buffer) {
  const response = await storageFetch(storageObjectUrl(storagePath), {
    method:'POST',
    headers:serverHeaders({
      'Content-Type':'image/jpeg',
      'Cache-Control':'private, max-age=3600',
      'x-upsert':'true',
    }),
    body:buffer,
  });
  if (!response.ok) throw new ProfileAvatarError(503, 'Fotografia nuk u ruajt.', 'STORAGE_UPLOAD_FAILED');
}

async function deleteAvatar(storagePath) {
  try {
    const response = await storageFetch(storageObjectUrl(storagePath), {
      method:'DELETE',
      headers:serverHeaders(),
    });
    if (!response.ok && response.status !== 404) throw new Error('delete failed');
  } catch (error) {
    console.error('Profile avatar cleanup failed:', error?.message || error);
  }
}

async function updateProfileAvatar(authUid, value) {
  await neonRequest(`profiles?id=eq.${encodeURIComponent(authUid)}`, {
    method:'PATCH',
    body:{ avatar_url:value || null, updated_at:new Date().toISOString() },
    prefer:'return=minimal',
    timeoutMs:5000,
    label:'Profile avatar update',
  });
}

async function imageResponseFor(profile, authUid) {
  const value = clean(profile.avatar_url, 1500);
  if (!value) throw new ProfileAvatarError(404, 'Profili nuk ka fotografi.', 'AVATAR_MISSING');

  let response;
  if (isStoragePath(value, authUid)) {
    response = await storageFetch(storageObjectUrl(value), { headers:serverHeaders() });
  } else if (trustedRemoteAvatar(value)) {
    response = await storageFetch(value, { redirect:'follow' });
    if (response.url && !trustedRemoteAvatar(response.url)) {
      throw new ProfileAvatarError(502, 'Burimi i fotografisë nuk lejohet.', 'AVATAR_SOURCE_INVALID');
    }
  } else {
    throw new ProfileAvatarError(404, 'Fotografia e profilit nuk është e disponueshme.', 'AVATAR_SOURCE_MISSING');
  }

  if (!response.ok) {
    throw new ProfileAvatarError(response.status === 404 ? 404 : 502, 'Fotografia nuk mund të lexohej.', 'AVATAR_READ_FAILED');
  }
  const type = clean(response.headers.get('content-type'), 100).toLowerCase();
  if (!type.startsWith('image/')) throw new ProfileAvatarError(502, 'Burimi nuk ktheu fotografi.', 'AVATAR_RESPONSE_INVALID');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new ProfileAvatarError(502, 'Fotografia e ruajtur është e pavlefshme.', 'AVATAR_RESPONSE_SIZE');
  }
  return { buffer, type };
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie, Origin');
  if (!sameOrigin(req)) throw new ProfileAvatarError(403, 'Origjina e kërkesës nuk lejohet.', 'ORIGIN_FORBIDDEN');

  const identity = await authIdentity(req);
  const profile = await profileRow(identity.authUid);

  if (req.method === 'GET' && queryValue(req, 'meta') === '1') {
    const exists = Boolean(clean(profile.avatar_url, 1500))
      && (isStoragePath(profile.avatar_url, identity.authUid) || trustedRemoteAvatar(profile.avatar_url));
    return res.status(200).json({
      ok:true,
      exists,
      url:exists ? `/api/profile-photo?v=${encodeURIComponent(clean(profile.updated_at, 100) || '1')}` : '',
      source:isStoragePath(profile.avatar_url, identity.authUid) ? 'custom' : (exists ? 'account' : 'none'),
    });
  }

  if (req.method === 'GET') {
    const image = await imageResponseFor(profile, identity.authUid);
    res.setHeader('Content-Type', image.type);
    res.setHeader('Content-Length', String(image.buffer.length));
    return res.status(200).end(image.buffer);
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const buffer = decodeAvatar(body.dataUrl);
    const storagePath = avatarPath(identity.authUid);
    await uploadAvatar(storagePath, buffer);
    try {
      await updateProfileAvatar(identity.authUid, storagePath);
    } catch (error) {
      await deleteAvatar(storagePath);
      throw error;
    }
    return res.status(200).json({
      ok:true,
      url:`/api/profile-photo?v=${Date.now()}`,
      source:'custom',
    });
  }

  if (req.method === 'DELETE') {
    const oldPath = isStoragePath(profile.avatar_url, identity.authUid) ? clean(profile.avatar_url, 500) : '';
    await updateProfileAvatar(identity.authUid, null);
    if (oldPath) await deleteAvatar(oldPath);
    return res.status(200).json({ ok:true, exists:false, url:'' });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
}

async function route(req, res) {
  try { return await handle(req, res); }
  catch (error) {
    const status = Number(error?.status) || 500;
    console.error('Profile avatar error:', error?.code || error?.message || error);
    return res.status(status).json({
      ok:false,
      code:error?.code || '',
      error:status >= 500 ? 'Fotografia e profilit nuk mund të ruhet për momentin.' : clean(error?.message, 500),
    });
  }
}

module.exports = {
  handle:route,
  _test:{ sameOrigin, avatarPath, isStoragePath, trustedRemoteAvatar, decodeAvatar, storageObjectUrl, MAX_IMAGE_BYTES, BUCKET },
};
