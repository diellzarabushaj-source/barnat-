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
  return rpc('drx_phase11_review_workbench_v3');
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
  return rpc('drx_phase11_clinical_batch_packet_v3', { p_dose_moiety_key:doseMoietyKey });
}

async function indicationPacket() {
  return rpc('drx_phase11_indication_review_packet_v2');
}

function bodyObject(req) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}

function requireAttestation(value, expected) {
  if (clean(value) !== expected) {
    const error = new Error('Kërkohet attestimi eksplicit i reviewer-it.');
    error.status = 400;
    error.code = 'REVIEW_ATTESTATION_REQUIRED';
    throw error;
  }
}

function integer(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    const error = new Error(label + ' nuk është valid.');
    error.status = 400;
    throw error;
  }
  return number;
}

function uuid(value, label) {
  const text = clean(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    const error = new Error(label + ' nuk është valid.');
    error.status = 400;
    throw error;
  }
  return text;
}

async function applyReviewAction(action, body, admin) {
  const reviewer = clean(admin?.email);
  const note = clean(body.reviewNote) || null;

  switch (action) {
    case 'identity-batch-apply': {
      requireAttestation(body.attestation, 'IDENTITY_REVIEW_ATTESTED');
      const signature = clean(body.compositionSignature);
      if (!/^[a-f0-9]{32}$/i.test(signature)) {
        const error = new Error('Composition signature nuk është valide.');
        error.status = 400;
        throw error;
      }
      const conceptIds = [...new Set(
        (Array.isArray(body.conceptIds) ? body.conceptIds : []).map(value => uuid(value, 'conceptId'))
      )];
      if (!conceptIds.length) {
        const error = new Error('Zgjidh së paku një canonical concept.');
        error.status = 400;
        throw error;
      }
      return rpc('drx_phase11_apply_ingredient_identity_batch_v1', {
        p_composition_signature:signature,
        p_concept_ids:conceptIds,
        p_reviewer:reviewer,
        p_review_note:note,
      });
    }

    case 'evidence-review':
      requireAttestation(body.attestation, 'SOURCE_REVIEW_ATTESTED');
      return rpc('drx_phase11_review_regimen_evidence_v1', {
        p_regimen_key:clean(body.regimenKey),
        p_source_snapshot_id:clean(body.sourceSnapshotId),
        p_source_section_sha256:clean(body.sourceSectionSha256),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_review_note:note,
      });

    case 'presentation-review':
      requireAttestation(body.attestation, 'SOURCE_REVIEW_ATTESTED');
      return rpc('drx_phase11_review_regimen_presentation_v1', {
        p_regimen_key:clean(body.regimenKey),
        p_branch_no:integer(body.branchNo, 'branchNo'),
        p_step_no:integer(body.stepNo, 'stepNo'),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_review_note:note,
      });

    case 'administration-review':
      requireAttestation(body.attestation, 'SOURCE_REVIEW_ATTESTED');
      return rpc('drx_phase11_review_regimen_administration_v1', {
        p_regimen_key:clean(body.regimenKey),
        p_branch_no:integer(body.branchNo, 'branchNo'),
        p_step_no:integer(body.stepNo, 'stepNo'),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_review_note:note,
      });

    case 'safety-review':
      requireAttestation(body.attestation, 'SAFETY_REVIEW_ATTESTED');
      return rpc('drx_phase11_review_safety_candidate_v1', {
        p_candidate_type:clean(body.candidateType).toUpperCase(),
        p_candidate_key:clean(body.candidateKey),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_review_note:note,
      });

    case 'indication-link-review':
      requireAttestation(body.attestation, 'INDICATION_LINK_REVIEW_ATTESTED');
      return rpc('drx_phase11_review_indication_link_v1', {
        p_regimen_key:clean(body.regimenKey),
        p_indication_key_candidate:clean(body.indicationKeyCandidate),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_review_note:note,
      });

    case 'indication-publish': {
      requireAttestation(body.attestation, 'ICD_AND_INDICATION_REVIEW_ATTESTED');
      const codes = [...new Set((Array.isArray(body.icd10Codes) ? body.icd10Codes : [])
        .map(clean).filter(Boolean))];
      return rpc('drx_phase11_publish_indication_v1', {
        p_indication_id:uuid(body.indicationId, 'indicationId'),
        p_icd10_codes:codes,
        p_reviewer:reviewer,
        p_attestation:'ICD_AND_INDICATION_REVIEW_ATTESTED',
        p_review_note:note,
      });
    }

    case 'regimen-review':
      if (clean(body.decision).toUpperCase() === 'APPROVED') {
        requireAttestation(body.attestation, 'CLINICAL_REGIMEN_REVIEW_ATTESTED');
      }
      return rpc('drx_phase11_review_regimen_v1', {
        p_regimen_key:clean(body.regimenKey),
        p_decision:clean(body.decision).toUpperCase(),
        p_reviewer:reviewer,
        p_attestation:clean(body.attestation),
        p_review_note:note,
      });

    default: {
      const error = new Error('Review action nuk njihet.');
      error.status = 400;
      error.code = 'UNKNOWN_REVIEW_ACTION';
      throw error;
    }
  }
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

  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      ok:false,
      code:'METHOD_NOT_ALLOWED',
      error:'Lejohen vetëm GET dhe POST.',
    });
  }

  try {
    if (req.method === 'POST') {
      const body = bodyObject(req);
      const action = clean(body.action);
      const payload = await applyReviewAction(action, body, admin);
      return res.status(200).json({
        ok:true,
        mode:'review-action',
        action,
        admin:{ email:admin.email, name:admin.name || '' },
        payload,
      });
    }

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
      code:error?.code || 'PHASE11_REVIEW_FAILED',
      error:clean(error?.message) || 'Phase 11 review action nuk mund të përfundojë.',
    });
  }
}

module.exports = {
  handle,
  _test:{ sameOrigin, queryValue, rpcData, bodyObject, requireAttestation, integer, uuid, applyReviewAction, workbench, regimenPacket, identityPacket, clinicalBatchPacket, indicationPacket },
};
