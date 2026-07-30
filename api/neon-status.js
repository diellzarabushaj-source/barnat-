'use strict';

const crypto = require('node:crypto');
const { neonRequest, exactCount } = require('../lib/neon-data-api');

const hash = value => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

function decodePayload(token) {
  const segment = String(token || '').split('.')[1] || '';
  if (!segment) return {};
  try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); }
  catch { return {}; }
}

async function oidcDiagnostic() {
  const oidc = await import('@vercel/oidc');
  const token = process.env.VERCEL_OIDC_TOKEN || await oidc.getVercelOidcToken();
  const payload = decodePayload(token);
  return {
    available:Boolean(token),
    subjectHash:hash(payload.sub),
    ownerHash:hash(payload.owner),
    projectHash:hash(payload.project),
    environment:String(payload.environment || ''),
    issuerHash:hash(payload.iss),
  };
}

async function tableCount(table) {
  const { response } = await neonRequest(`${table}?select=id&limit=1`, {
    headers: { Range:'0-0', 'Range-Unit':'items' },
    prefer:'count=exact',
  });
  return exactCount(response);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Lejohet vetëm GET.' });
  }

  try {
    const diagnostic = String(req.query?.diagnostic || '') === 'oidc'
      ? await oidcDiagnostic()
      : undefined;
    const [drugs, dosageRegimens, icdCodes, labTests] = await Promise.all([
      tableCount('drugs'),
      tableCount('dosage_regimens'),
      tableCount('icd_codes'),
      tableCount('lab_tests'),
    ]);
    return res.status(200).json({
      connected:true,
      provider:'neon',
      project:'MedIndex',
      counts:{ drugs, dosageRegimens, icdCodes, labTests },
      ...(diagnostic ? { diagnostic } : {}),
      checkedAt:new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      connected:false,
      provider:'neon',
      error:error.message,
      checkedAt:new Date().toISOString(),
    });
  }
};

module.exports._test = { decodePayload, oidcDiagnostic };
