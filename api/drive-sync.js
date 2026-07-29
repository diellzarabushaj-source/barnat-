'use strict';

const crypto = require('node:crypto');
const DriveNeonSync = require('../lib/drive-neon-sync.js');
const { neonRequest } = require('../lib/neon-data-api.js');

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return {};
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function verifiedSecret(req) {
  const received = clean(req.headers?.['x-medindex-sync-secret']);
  if (received.length < 24) return '';
  const payload = parseBody(req);
  const spreadsheetId = clean(payload.spreadsheetId);
  const sheetName = clean(payload.sheetName);
  if (!spreadsheetId || !sheetName) return '';
  const path = `drive_sync_sources?select=auth_secret_hash,enabled`
    + `&spreadsheet_id=eq.${encodeURIComponent(spreadsheetId)}`
    + `&sheet_name=eq.${encodeURIComponent(sheetName)}&limit=1`;
  const { data } = await neonRequest(path);
  const source = Array.isArray(data) ? data[0] : null;
  if (!source || source.enabled !== true || !source.auth_secret_hash) return '';
  const suppliedHash = crypto.createHash('sha256').update(received, 'utf8').digest('hex');
  return safeEqual(suppliedHash, source.auth_secret_hash) ? received : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return DriveNeonSync.handle(req, res);
  try {
    const secret = await verifiedSecret(req);
    if (!secret) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(401).json({ ok:false, error:'Çelësi i sinkronizimit nuk është valid.' });
    }
    const previous = process.env.MEDINDEX_DRIVE_SYNC_SECRET;
    process.env.MEDINDEX_DRIVE_SYNC_SECRET = secret;
    try { return await DriveNeonSync.handle(req, res); }
    finally {
      if (previous === undefined) delete process.env.MEDINDEX_DRIVE_SYNC_SECRET;
      else process.env.MEDINDEX_DRIVE_SYNC_SECRET = previous;
    }
  } catch (error) {
    console.error('Drive sync authorization failed:', error);
    return res.status(500).json({ ok:false, error:'Autorizimi i sinkronizimit dështoi.' });
  }
};

module.exports._test = { parseBody, safeEqual, verifiedSecret };
