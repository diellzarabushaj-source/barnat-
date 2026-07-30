'use strict';

const crypto = require('node:crypto');

const hash = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

function decodePayload(token) {
  const segment = String(token || '').split('.')[1] || '';
  if (!segment) return {};
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok:false });
  }
  try {
    const oidc = await import('@vercel/oidc');
    const token = process.env.VERCEL_OIDC_TOKEN || await oidc.getVercelOidcToken();
    const payload = decodePayload(token);
    return res.status(200).json({
      ok:Boolean(token),
      subjectHash:hash(payload.sub),
      ownerHash:hash(payload.owner),
      projectHash:hash(payload.project),
      environment:String(payload.environment || ''),
      issuerHash:hash(payload.iss),
    });
  } catch {
    return res.status(500).json({ ok:false });
  }
};
