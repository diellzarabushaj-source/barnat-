'use strict';

const { neonRequest } = require('./medindex-data-api.js');
const AdminAccess = require('./admin-access.js');

const clean = value => String(value ?? '').trim();

function sameOrigin(req) {
  const origin = clean(req.headers?.origin);
  if (!origin) return true;
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  try { return !host || new URL(origin).host === host; }
  catch { return false; }
}

function queryValue(req, key) {
  if (req.query?.[key] !== undefined) {
    const value = Array.isArray(req.query[key]) ? req.query[key][0] : req.query[key];
    return clean(value);
  }
  try {
    return clean(new URL(String(req.url || ''), 'https://drx.local').searchParams.get(key));
  } catch {
    return '';
  }
}

function rpcData(result) {
  const data = result?.data;
  if (Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === 'object') {
    const values = Object.values(data[0]);
    if (values.length === 1) return values[0];
  }
  return data;
}

async function rpc(name, body = {}) {
  return rpcData(await neonRequest(`rpc/${name}`, {
    method:'POST',
    body,
    prefer:'return=representation',
  }));
}

async function workbench() {
  return rpc('drx_phase11_review_workbench_v2');
}

async function regimenPacket(regimenKey) {
  if (!regimenKey) {
    const error = new Error('regimenKey është i detyrueshëm.');
    error.status = 400;
    throw error;
  }
  return rpc('drx_phase11_regimen_review_packet_v1', { p_regimen_key:regimenKey });
}

async function identityPacket(signature) {
  if (!signature || !/^[a-f0-9]{32}$/i.test(signature)) {
    const error = new Error('Composition signature nuk është valide.');
    error.status = 400;
    throw error;
  }
  return rpc('drx_phase11_identity_batch_packet_v2', { p_composition_signature:signature });
}

async function clinicalBatchPacket(doseMoietyKey) {
  if (!doseMoietyKey || !/^[a-f0-9]{32}$/i.test(doseMoietyKey)) {
    const error = new Error('Dose-moiety key nuk është valid.');
    error.status = 400;
    throw error;
  }
  return rpc('drx_phase11_clinical_batch_packet_v1', { p_dose_moiety_key:doseMoietyKey });
}

async function indicationPacket() {
  return rpc('drx_phase11_indication_review_packet_v2');
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!sameOrigin(req)) {
    return res.status(403).json({ ok:false, error:'Origjina e kërkesës nuk lejohet.' });
  }

  let admin;
  try {
    admin = await AdminAccess.requireAdminSession(req);
  } catch (error) {
    return res.status(Number(error?.status) || 403).json({
      ok:false,
      code:error?.code || 'ADMIN_REQUIRED',
      error:clean(error?.message) || 'Kjo faqe është vetëm për administratorin.',
    });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok:false,
      code:'READ_ONLY_REVIEW_WORKBENCH',
      error:'Review workbench është read-only. Vendimet klinike kërkojnë veprim eksplicit të reviewer-it.',
    });
  }

  try {
    const regimenKey = queryValue(req, 'regimenKey');
    const identitySignature = queryValue(req, 'identitySignature');
    const clinicalBatchKey = queryValue(req, 'clinicalBatchKey');
    const indications = queryValue(req, 'indications');
    let payload;
    let mode='workbench';

    if (regimenKey) {
      mode='regimen';
      payload=await regimenPacket(regimenKey);
    } else if (identitySignature) {
      mode='identity';
      payload=await identityPacket(identitySignature);
    } else if (clinicalBatchKey) {
      mode='clinical-batch';
      payload=await clinicalBatchPacket(clinicalBatchKey);
    } else if (indications === '1') {
      mode='indications';
      payload=await indicationPacket();
    } else {
      payload=await workbench();
    }

    return res.status(200).json({
      ok:true,
      mode,
      admin:{ email:admin.email, name:admin.name || '' },
      payload,
    });
  } catch (error) {
    console.error('[phase11-review]', error?.message || error);
    return res.status(Number(error?.status) || 500).json({
      ok:false,
      code:'PHASE11_REVIEW_READ_FAILED',
      error:clean(error?.message) || 'Review workbench nuk mund të ngarkohet.',
    });
  }
}

module.exports = {
  handle,
  _test:{ sameOrigin, queryValue, rpcData, workbench, regimenPacket, identityPacket, clinicalBatchPacket, indicationPacket },
};
