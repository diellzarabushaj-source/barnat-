'use strict';

const { Readable } = require('node:stream');
const { get } = require('@vercel/blob');
const ClinicalEditor = require('../lib/clinical-editor.js');
const PopulationVerification = require('../lib/population-verification.js');
const MediaLibrary = require('../lib/media-library.js');

const OFFICIAL_BRAND = Object.freeze({
  markOnLight:{ pathname:'medindex/brand/v1/medindex-mark-on-light.webp', contentType:'image/webp' },
  fullOnDark:{ pathname:'medindex/brand/v1/medindex-full-on-dark.png', contentType:'image/png' },
  markOnDark:{ pathname:'medindex/brand/v1/medindex-mark-on-dark.png', contentType:'image/png' },
  fullOnLight:{ pathname:'medindex/brand/v1/medindex-full-on-light.png', contentType:'image/png' },
  horizontalOnLight:{ pathname:'medindex/brand/v1/medindex-horizontal-on-light.webp', contentType:'image/webp' },
  horizontalOnDark:{ pathname:'medindex/brand/v1/medindex-horizontal-on-dark.webp', contentType:'image/webp' },
});

function queryValue(req, name) {
  if (req.query?.[name] !== undefined) {
    const value = Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
    return String(value || '');
  }
  try { return new URL(String(req.url || ''), 'https://medindex.local').searchParams.get(name) || ''; }
  catch { return ''; }
}

function queryFlag(req, name) {
  if (req.query?.[name] !== undefined) return true;
  try {
    return new URL(String(req.url || ''), 'https://medindex.local').searchParams.has(name);
  } catch {
    return false;
  }
}

async function officialBrand(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const asset = OFFICIAL_BRAND[queryValue(req, 'officialBrand')];
  if (!asset) return res.status(404).end();
  try {
    const result = await get(asset.pathname, { access:'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return res.status(404).end();
    res.setHeader('Content-Type', result.blob?.contentType || asset.contentType);
    res.setHeader('Content-Length', String(result.blob?.size || ''));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    if (req.method === 'HEAD') return res.status(200).end();
    res.statusCode = 200;
    const stream = typeof result.stream.getReader === 'function'
      ? Readable.fromWeb(result.stream)
      : Readable.from(result.stream);
    stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
    return stream.pipe(res);
  } catch (error) {
    console.error('Official brand asset error:', error?.message || error);
    return res.status(404).end();
  }
}

module.exports = async function handler(req, res) {
  if (queryFlag(req, 'officialBrand')) return officialBrand(req, res);
  if (queryFlag(req, 'populationVerification')) return PopulationVerification.handle(req, res);
  if (queryFlag(req, 'mediaLibrary')) return MediaLibrary.handle(req, res);
  return ClinicalEditor.handle(req, res);
};

module.exports._test = { OFFICIAL_BRAND, queryValue, queryFlag };
