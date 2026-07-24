const path = require('node:path');
const { Readable } = require('node:stream');
const manifest = require(path.join('..', 'data', 'protocols.json'));

const DOCUMENTS = new Map(manifest.documents.map(document => [document.id, document]));

function safeDocument(id) {
  return DOCUMENTS.get(String(id || '').trim()) || null;
}

function requestId(req) {
  if (req.query?.id) return Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  try { return new URL(req.url, 'https://medindex.local').searchParams.get('id'); }
  catch { return ''; }
}

async function authorized(req) {
  const auth = await import('../lib/auth.mjs');
  return auth.verifySessionToken(auth.sessionFromRequest(req));
}

function setPrivateHeaders(res, document, upstreamHeaders = null) {
  const etag = document.contentSha256 ? `"${document.contentSha256}"` : upstreamHeaders?.get?.('etag');
  res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', document.type === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `${document.type === 'pdf' ? 'inline' : 'attachment'}; filename="${document.id}.${document.type}"`);
  if (etag) res.setHeader('ETag', etag);
  for (const header of ['content-length', 'content-range', 'last-modified']) {
    const value = upstreamHeaders?.get?.(header);
    if (value) res.setHeader(header.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-'), value);
  }
  return etag;
}

async function handle(req, res, dependencies = {}) {
  const authorizeRequest = dependencies.authorized || authorized;
  const resolveDocument = dependencies.safeDocument || safeDocument;
  const readBlob = dependencies.getBlob || (async (...args) => {
    const { get } = require('@vercel/blob');
    return get(...args);
  });
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error:'Lejohet vetëm GET/HEAD.' });
  }
  if (!(await authorizeRequest(req))) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    return res.status(401).json({ error:'Sesioni nuk është aktiv.' });
  }

  const document = resolveDocument(requestId(req));
  if (!document) return res.status(404).json({ error:'Dokumenti nuk u gjet në manifest.' });
  if (!document.blobUrl || !document.contentSha256) {
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(503).json({
      error:'Pasqyra private e dokumentit nuk është sinkronizuar ende.',
      officialUrl:document.officialUrl,
    });
  }

  const etag = `"${document.contentSha256}"`;
  if (req.headers['if-none-match'] === etag) {
    setPrivateHeaders(res, document);
    return res.status(304).end();
  }

  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const result = await readBlob(document.blobUrl, {
    access:'private',
    token:process.env.BLOB_READ_WRITE_TOKEN,
    headers,
    ifNoneMatch:req.headers['if-none-match'],
  });
  if (!result) return res.status(404).json({ error:'Dokumenti privat nuk u gjet.' });
  setPrivateHeaders(res, document, result.headers);
  if (result.statusCode === 304) return res.status(304).end();
  const status = result.statusCode === 206 ? 206 : 200;
  if (req.method === 'HEAD') return res.status(status).end();
  res.status(status);
  if (!result.stream) return res.end();
  return Readable.fromWeb(result.stream).pipe(res);
}

async function handler(req, res) {
  return handle(req, res);
}

module.exports = handler;
module.exports.handle = handle;
module.exports.safeDocument = safeDocument;
module.exports.requestId = requestId;
module.exports.setPrivateHeaders = setPrivateHeaders;
