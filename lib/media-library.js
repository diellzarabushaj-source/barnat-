'use strict';

const crypto = require('node:crypto');
const { put, list, del } = require('@vercel/blob');
const UserStore = require('./user-store.js');

const PREFIX = 'medindex/media/';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DELETE_BODY_BYTES = 8 * 1024;
const PAGE_LIMIT = 100;
const ALLOWED_TYPES = new Map([
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
]);
const ALLOWED_KINDS = new Set(['brand', 'interface', 'clinical', 'other']);

class HttpError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sameOrigin(req) {
  const origin = clean(req.headers?.origin, 1000);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host, 1000);
  try { return Boolean(host) && new URL(origin).host === host; }
  catch { return false; }
}

function configured() {
  return Boolean(clean(process.env.BLOB_READ_WRITE_TOKEN, 5000));
}

function requireConfigured() {
  if (!configured()) {
    throw new HttpError(503, 'Vercel Blob nuk është lidhur ende me projektin. Krijo ose lidhe një Blob store dhe aktivizo BLOB_READ_WRITE_TOKEN.', 'BLOB_NOT_CONFIGURED');
  }
}

function requireEditor(user) {
  if (!user || user.role !== 'editor') throw new HttpError(403, 'Vetëm administratori mund të menaxhojë mediat.', 'MEDIA_FORBIDDEN');
}

function headerValue(req, name, maximum = 300) {
  return clean(req.headers?.[name.toLowerCase()], maximum);
}

function normalizeKind(value) {
  const kind = clean(value, 40).toLowerCase();
  return ALLOWED_KINDS.has(kind) ? kind : 'other';
}

function slug(value) {
  return clean(value, 140)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.+/g, '.')
    .slice(0, 90) || 'media';
}

function safeFilename(filename, extension) {
  const raw = slug(filename).replace(/\.[a-z0-9]{1,8}$/i, '');
  return `${raw || 'media'}.${extension}`;
}

function uploadPath({ filename, contentType, kind, now = new Date(), nonce = crypto.randomUUID() }) {
  const extension = ALLOWED_TYPES.get(contentType);
  if (!extension) throw new HttpError(415, 'Lejohen vetëm PNG, WebP dhe JPEG.', 'MEDIA_TYPE_NOT_ALLOWED');
  const date = now.toISOString().slice(0, 10);
  const base = safeFilename(filename, extension).replace(`.${extension}`, '');
  return `${PREFIX}${normalizeKind(kind)}/${date}/${base}-${nonce}.${extension}`;
}

function declaredSize(req) {
  const value = Number(req.headers?.['content-length']);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function readBinaryBody(req) {
  const declared = declaredSize(req);
  if (declared !== null && declared > MAX_FILE_BYTES) throw new HttpError(413, 'Imazhi është më i madh se 8 MB.', 'MEDIA_TOO_LARGE');
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_FILE_BYTES) throw new HttpError(413, 'Imazhi është më i madh se 8 MB.', 'MEDIA_TOO_LARGE');
    return req.body;
  }
  if (req.body instanceof Uint8Array) {
    const value = Buffer.from(req.body);
    if (value.length > MAX_FILE_BYTES) throw new HttpError(413, 'Imazhi është më i madh se 8 MB.', 'MEDIA_TOO_LARGE');
    return value;
  }
  if (typeof req.body === 'string') {
    const value = Buffer.from(req.body, 'binary');
    if (value.length > MAX_FILE_BYTES) throw new HttpError(413, 'Imazhi është më i madh se 8 MB.', 'MEDIA_TOO_LARGE');
    return value;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > MAX_FILE_BYTES) throw new HttpError(413, 'Imazhi është më i madh se 8 MB.', 'MEDIA_TOO_LARGE');
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) && !(req.body instanceof Uint8Array)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > MAX_DELETE_BODY_BYTES) throw new HttpError(413, 'Kërkesa është tepër e madhe.');
    }
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_DELETE_BODY_BYTES) throw new HttpError(413, 'Kërkesa është tepër e madhe.');
  try { return JSON.parse(raw || '{}'); }
  catch { throw new HttpError(400, 'Kërkesa nuk është JSON valid.'); }
}

async function verifyCsrf(req) {
  const auth = await import('./auth.mjs');
  const token = headerValue(req, 'x-csrf-token', 500);
  if (!auth.verifyCsrfToken(req, token)) throw new HttpError(403, 'Kontrolli CSRF skadoi. Rifresko faqen.', 'CSRF_INVALID');
}

function publicBlob(blob) {
  return {
    url:blob.url,
    downloadUrl:blob.downloadUrl || blob.url,
    pathname:blob.pathname,
    contentType:blob.contentType || '',
    size:Number(blob.size) || 0,
    uploadedAt:blob.uploadedAt || '',
  };
}

async function listMedia(req) {
  requireConfigured();
  const kind = normalizeKind(headerValue(req, 'x-medindex-kind', 40) || 'other');
  const allKinds = headerValue(req, 'x-medindex-all-kinds', 10) === '1';
  const cursor = headerValue(req, 'x-medindex-cursor', 1200) || undefined;
  const result = await list({
    prefix:allKinds ? PREFIX : `${PREFIX}${kind}/`,
    limit:PAGE_LIMIT,
    cursor,
  });
  return {
    ok:true,
    configured:true,
    blobs:(result.blobs || []).map(publicBlob),
    cursor:result.cursor || '',
    hasMore:result.hasMore === true,
  };
}

async function uploadMedia(req, user) {
  requireConfigured();
  await verifyCsrf(req);
  const contentType = clean(req.headers?.['content-type'], 120).split(';')[0].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) throw new HttpError(415, 'Lejohen vetëm PNG, WebP dhe JPEG.', 'MEDIA_TYPE_NOT_ALLOWED');
  const filename = headerValue(req, 'x-medindex-filename', 180);
  const kind = normalizeKind(headerValue(req, 'x-medindex-kind', 40));
  if (!filename) throw new HttpError(400, 'Emri i skedarit mungon.', 'MEDIA_FILENAME_REQUIRED');
  const body = await readBinaryBody(req);
  if (!body.length) throw new HttpError(400, 'Skedari është bosh.', 'MEDIA_EMPTY');
  const pathname = uploadPath({ filename, contentType, kind });
  const blob = await put(pathname, body, {
    access:'public',
    contentType,
    addRandomSuffix:false,
    allowOverwrite:false,
    cacheControlMaxAge:31536000,
  });
  return {
    ok:true,
    blob:publicBlob(blob),
    uploadedBy:{ email:user.email, name:user.name || '' },
  };
}

function managedPath(value) {
  const pathname = clean(value, 1600);
  if (!pathname.startsWith(PREFIX) || pathname.includes('..')) throw new HttpError(400, 'Ky skedar nuk i përket Media Library.', 'MEDIA_PATH_INVALID');
  return pathname;
}

async function deleteMedia(req) {
  requireConfigured();
  await verifyCsrf(req);
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Kërkohet Content-Type application/json.');
  }
  const body = await parseJsonBody(req);
  const pathname = managedPath(body.pathname);
  await del(pathname);
  return { ok:true, pathname };
}

async function handle(req, res) {
  securityHeaders(res);
  if (!sameOrigin(req)) return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });
  const user = await UserStore.userFromSession(req);
  if (!user) return res.status(401).json({ ok:false, error:'Kërkohet autentikim.' });
  requireEditor(user);

  if (req.method === 'GET') {
    if (!configured()) return res.status(200).json({ ok:true, configured:false, blobs:[], cursor:'', hasMore:false });
    return res.status(200).json(await listMedia(req));
  }
  if (req.method === 'POST') return res.status(201).json(await uploadMedia(req, user));
  if (req.method === 'DELETE') return res.status(200).json(await deleteMedia(req));
  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
}

async function route(req, res) {
  try { return await handle(req, res); }
  catch (error) {
    console.error('Media library error:', error?.code || error?.message || error);
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok:false,
      code:error?.code || '',
      error:status >= 500 && error?.code !== 'BLOB_NOT_CONFIGURED'
        ? 'Media Library nuk e përfundoi kërkesën.'
        : error.message,
    });
  }
}

module.exports = {
  handle:route,
  _test:{
    sameOrigin,
    normalizeKind,
    slug,
    safeFilename,
    uploadPath,
    managedPath,
    declaredSize,
    ALLOWED_TYPES,
    MAX_FILE_BYTES,
    PREFIX,
  },
};
