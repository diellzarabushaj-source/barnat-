'use strict';

const crypto = require('node:crypto');
const { neonRequest } = require('./medindex-data-api.js');
const AdminAccess = require('./admin-access.js');

const BUCKET = 'professional-verifications';
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024 + 128 * 1024;
const SIGNED_URL_SECONDS = 60;
const DOCUMENT_TYPES = Object.freeze({
  'application/pdf':{ extension:'pdf', matches:buffer => buffer.subarray(0, 5).toString('ascii') === '%PDF-' },
  'image/jpeg':{ extension:'jpg', matches:buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png':{ extension:'png', matches:buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
});

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

// Who the person says they are, and the single proof that backs each claim. The
// database enforces the same pairing; this copy exists so the request is refused
// before a file is ever written to private storage.
const PROFESSIONAL_TITLES = Object.freeze({
  student:{ documentKind:'id', label:'Student i Mjekësisë', proof:'ID e studentit' },
  mjek:{ documentKind:'diplome', label:'Mjek/e', proof:'Diploma' },
  specialist:{ documentKind:'licence', label:'Specialist/e', proof:'Licenca e specialistit', specialtyRequired:true },
  specializant:{ documentKind:'licence', label:'Specializant/e', proof:'Licenca' },
});

class ProfessionalVerificationError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'ProfessionalVerificationError';
    this.status = status;
    this.code = code;
  }
}

function supabaseUrl() {
  return String(
    process.env.MEDINDEX_SUPABASE_URL || process.env.SUPABASE_URL || 'https://ftuchtmolddhhsdcwnqe.supabase.co',
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
  if (!key) throw new ProfessionalVerificationError(503, 'Çelësi privat i Supabase mungon.', 'SUPABASE_SECRET_MISSING');
  return {
    apikey:key,
    // Storage bypasses the database gateway and requires the service key in the
    // Authorization header. Supabase also accepts opaque sb_secret_* keys here.
    Authorization:`Bearer ${key}`,
    ...extra,
  };
}

function safeFilename(value) {
  const name = clean(value, 255).split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return name || 'verifikim-profesional';
}

function decodeDocument(input = {}) {
  const mimeType = clean(input.mimeType, 100).toLowerCase();
  const contract = DOCUMENT_TYPES[mimeType];
  if (!contract) {
    throw new ProfessionalVerificationError(415, 'Lejohen vetëm PDF, JPEG ose PNG.', 'DOCUMENT_TYPE_INVALID');
  }

  let base64 = clean(input.base64, MAX_JSON_BYTES);
  const dataUrl = /^data:([^;,]+);base64,(.*)$/s.exec(base64);
  if (dataUrl) {
    if (clean(dataUrl[1], 100).toLowerCase() !== mimeType) {
      throw new ProfessionalVerificationError(415, 'Lloji i dokumentit nuk përputhet.', 'DOCUMENT_TYPE_MISMATCH');
    }
    base64 = dataUrl[2];
  }
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new ProfessionalVerificationError(400, 'Dokumenti nuk është koduar siç duhet.', 'DOCUMENT_BASE64_INVALID');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new ProfessionalVerificationError(400, 'Dokumenti është bosh.', 'DOCUMENT_EMPTY');
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new ProfessionalVerificationError(413, 'Dokumenti duhet të jetë më i vogël se 3 MB.', 'DOCUMENT_TOO_LARGE');
  }
  if (!contract.matches(buffer)) {
    throw new ProfessionalVerificationError(415, 'Përmbajtja nuk përputhet me llojin e deklaruar të dokumentit.', 'DOCUMENT_SIGNATURE_INVALID');
  }

  return {
    buffer,
    mimeType,
    extension:contract.extension,
    originalFilename:safeFilename(input.filename),
    sha256Hex:crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

// The identity half of the registration, validated to the same rules the
// database will re-check. Names are the only free text that reaches a profile,
// so they are bounded here rather than trusted at their declared length.
function decodeRegistration(input = {}) {
  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const fullName = clean(`${firstName} ${lastName}`, 160);
  if (firstName.length < 2 || lastName.length < 2) {
    throw new ProfessionalVerificationError(400, 'Shkruaj emrin dhe mbiemrin.', 'FULL_NAME_REQUIRED');
  }

  const title = clean(input.professionalTitle, 40).toLowerCase();
  const contract = Object.hasOwn(PROFESSIONAL_TITLES, title) ? PROFESSIONAL_TITLES[title] : null;
  if (!contract) {
    throw new ProfessionalVerificationError(400, 'Zgjidh titullin tënd profesional.', 'PROFESSIONAL_TITLE_INVALID');
  }

  const specialty = clean(input.specialty, 120);
  if (contract.specialtyRequired && !specialty) {
    throw new ProfessionalVerificationError(400, 'Shkruaj specialitetin tënd.', 'SPECIALTY_REQUIRED');
  }

  return { fullName, professionalTitle:title, specialty, documentKind:contract.documentKind, proof:contract.proof };
}

async function readJsonBody(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw new ProfessionalVerificationError(413, 'Dokumenti është tepër i madh.', 'BODY_TOO_LARGE');
  }
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_JSON_BYTES) {
      throw new ProfessionalVerificationError(413, 'Dokumenti është tepër i madh.', 'BODY_TOO_LARGE');
    }
    return req.body;
  }
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) {
        throw new ProfessionalVerificationError(413, 'Dokumenti është tepër i madh.', 'BODY_TOO_LARGE');
      }
    }
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new ProfessionalVerificationError(400, 'Kërkesa JSON nuk është e vlefshme.', 'BODY_INVALID'); }
}

function storageObjectUrl(storagePath, suffix = '') {
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl()}/storage/v1/object/${suffix}${encodeURIComponent(BUCKET)}/${encodedPath}`;
}

async function storageResponse(url, options = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    throw new ProfessionalVerificationError(503, 'Ruajtja private e dokumentit dështoi.', 'STORAGE_UNAVAILABLE');
  }
  return data;
}

async function uploadObject(storagePath, document, fetchImpl = globalThis.fetch) {
  await storageResponse(storageObjectUrl(storagePath), {
    method:'POST',
    headers:serverHeaders({
      'Content-Type':document.mimeType,
      'Cache-Control':'no-store',
      'x-upsert':'false',
    }),
    body:document.buffer,
  }, fetchImpl);
}

async function deleteObject(storagePath, fetchImpl = globalThis.fetch) {
  try {
    await storageResponse(storageObjectUrl(storagePath), {
      method:'DELETE',
      headers:serverHeaders(),
    }, fetchImpl);
  } catch (error) {
    console.error('Verification storage compensation failed:', error?.code || error?.message || error);
  }
}

async function enrollmentIdentity(req) {
  const auth = await import('./auth.mjs');
  const identity = auth.enrollmentData(auth.enrollmentFromRequest(req));
  if (!identity) {
    throw new ProfessionalVerificationError(401, 'Rihyr me Google para dërgimit të dokumentit.', 'ENROLLMENT_REQUIRED');
  }
  return { auth, identity };
}

async function pendingProfile(userId) {
  const { data } = await neonRequest(
    `profiles?select=id,status,verification_status,verification_submitted_at,full_name,professional_title,specialty&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  const profile = Array.isArray(data) ? data[0] : null;
  if (!profile || clean(profile.status) !== 'pending') {
    throw new ProfessionalVerificationError(409, 'Ky regjistrim nuk është më në pritje.', 'PENDING_PROFILE_REQUIRED');
  }
  return profile;
}

async function uploadVerification(req, options = {}) {
  const { auth, identity } = await enrollmentIdentity(req);
  const suppliedCsrf = clean(req.headers?.['x-csrf-token'], 500);
  if (!auth.verifyCsrfToken(req, suppliedCsrf)) {
    throw new ProfessionalVerificationError(403, 'Kontrolli i sigurisë skadoi. Rifresko faqen.', 'CSRF_INVALID');
  }
  await pendingProfile(identity.authUid);
  const body = await readJsonBody(req);
  // Identity first: a rejected registration must never leave a file behind in
  // private storage.
  const registration = decodeRegistration(body);
  const document = decodeDocument(body);
  const storagePath = `${identity.authUid}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${document.extension}`;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  await uploadObject(storagePath, document, fetchImpl);
  try {
    const { data } = await neonRequest('rpc/record_professional_verification', {
      method:'POST',
      body:{
        p_user_id:identity.authUid,
        p_storage_path:storagePath,
        p_original_filename:document.originalFilename,
        p_mime_type:document.mimeType,
        p_byte_size:document.buffer.length,
        p_sha256_hex:document.sha256Hex,
        p_full_name:registration.fullName,
        p_professional_title:registration.professionalTitle,
        p_specialty:registration.specialty,
        p_document_kind:registration.documentKind,
      },
      prefer:'return=representation',
    });
    return {
      ok:true,
      documentId:clean(data, 80),
      status:'submitted',
      professionalTitle:registration.professionalTitle,
      message:`${registration.proof} u ruajt privatisht. Regjistrimi pret shqyrtimin e administratorit.`,
    };
  } catch (error) {
    await deleteObject(storagePath, fetchImpl);
    const detail = String(error?.message || '');
    if (/verification_documents_one_uploaded|duplicate key/i.test(detail)) {
      throw new ProfessionalVerificationError(409, 'Një dokument është tashmë në pritje për shqyrtim.', 'DOCUMENT_ALREADY_SUBMITTED');
    }
    // The database re-checks every rule this module checked. Reaching one of
    // them means the two disagreed, so the refusal is reported rather than
    // flattened into a generic failure.
    for (const [code, message] of Object.entries({
      DOCUMENT_KIND_MISMATCH:'Dokumenti nuk i përgjigjet titullit që zgjodhe.',
      PROFESSIONAL_TITLE_INVALID:'Zgjidh titullin tënd profesional.',
      SPECIALTY_REQUIRED:'Shkruaj specialitetin tënd.',
      SPECIALTY_TOO_LONG:'Specialiteti është tepër i gjatë.',
      FULL_NAME_REQUIRED:'Shkruaj emrin dhe mbiemrin.',
      PENDING_PROFILE_REQUIRED:'Ky regjistrim nuk është më në pritje.',
      VERIFICATION_PATH_INVALID:'Rruga e dokumentit nuk është e vlefshme.',
    })) {
      if (detail.includes(code)) throw new ProfessionalVerificationError(400, message, code);
    }
    throw error;
  }
}

async function enrollmentStatus(req) {
  const { identity } = await enrollmentIdentity(req);
  const profile = await pendingProfile(identity.authUid);
  const { data } = await neonRequest(
    `verification_documents?select=id,status,original_filename,mime_type,byte_size,document_kind,created_at&user_id=eq.${encodeURIComponent(identity.authUid)}&order=created_at.desc&limit=1`,
  );
  const document = Array.isArray(data) ? data[0] || null : null;
  return {
    ok:true,
    status:clean(profile.verification_status) || 'missing',
    submittedAt:clean(profile.verification_submitted_at),
    email:clean(identity.email, 320).toLowerCase(),
    // The form renders its title options and proof labels from this, so the
    // catalogue the server validates against is the one the user sees.
    titles:Object.entries(PROFESSIONAL_TITLES).map(([value, contract]) => ({
      value,
      label:contract.label,
      proof:contract.proof,
      documentKind:contract.documentKind,
      specialtyRequired:Boolean(contract.specialtyRequired),
    })),
    maxDocumentBytes:MAX_DOCUMENT_BYTES,
    profile:{
      fullName:clean(profile.full_name, 160),
      professionalTitle:clean(profile.professional_title, 40),
      specialty:clean(profile.specialty, 120),
    },
    document:document ? {
      id:clean(document.id),
      filename:clean(document.original_filename, 255),
      mimeType:clean(document.mime_type, 100),
      byteSize:Number(document.byte_size) || 0,
      documentKind:clean(document.document_kind, 40),
      status:clean(document.status),
      createdAt:clean(document.created_at),
    } : null,
  };
}

async function documentById(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new ProfessionalVerificationError(400, 'Dokumenti nuk është i vlefshëm.', 'DOCUMENT_ID_INVALID');
  }
  const { data } = await neonRequest(
    `verification_documents?select=id,user_id,storage_path,original_filename,mime_type&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const document = Array.isArray(data) ? data[0] || null : null;
  if (!document) throw new ProfessionalVerificationError(404, 'Dokumenti nuk u gjet.', 'DOCUMENT_NOT_FOUND');
  return document;
}

async function auditDocumentAccess(actor, document) {
  await neonRequest('audit_logs', {
    method:'POST',
    body:[{
      entity_type:'verification_document',
      entity_id:clean(document.id),
      action:'verification_document_signed_url_created',
      old_data:null,
      new_data:{ userId:clean(document.user_id), expiresIn:SIGNED_URL_SECONDS },
      changed_by:`${clean(actor.name, 160) || 'admin'} <${clean(actor.email, 320).toLowerCase()}>`,
      source:'professional_verification',
      changed_at:new Date().toISOString(),
    }],
    prefer:'return=minimal',
  });
}

async function signedDocument(req, documentId, options = {}) {
  const actor = await AdminAccess.requireAdminSession(req);
  const document = await documentById(documentId);
  const data = await storageResponse(storageObjectUrl(clean(document.storage_path), 'sign/'), {
    method:'POST',
    headers:serverHeaders({ 'Content-Type':'application/json' }),
    body:JSON.stringify({ expiresIn:SIGNED_URL_SECONDS, download:safeFilename(document.original_filename) }),
  }, options.fetchImpl || globalThis.fetch);
  const signedPath = clean(data?.signedURL || data?.signedUrl, 4000);
  if (!signedPath) throw new ProfessionalVerificationError(503, 'URL-ja private nuk u krijua.', 'SIGNED_URL_MISSING');
  await auditDocumentAccess(actor, document);
  const url = /^https:\/\//i.test(signedPath) ? signedPath : `${supabaseUrl()}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
  return { ok:true, url, expiresIn:SIGNED_URL_SECONDS, filename:safeFilename(document.original_filename) };
}

function requested(req, queryValue) {
  return queryValue(req, 'scope') === 'verification';
}

async function handle(req, res, helpers = {}) {
  try {
    if (req.method === 'GET') {
      const documentId = clean(helpers.queryValue?.(req, 'document'), 80);
      return res.status(200).json(documentId
        ? await signedDocument(req, documentId, helpers)
        : await enrollmentStatus(req));
    }
    if (req.method === 'POST') {
      if (!/^application\/json\b/i.test(clean(req.headers?.['content-type'], 200))) {
        return res.status(415).json({ ok:false, code:'CONTENT_TYPE_INVALID', error:'Kërkohet Content-Type application/json.' });
      }
      return res.status(201).json(await uploadVerification(req, helpers));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  } catch (error) {
    console.error('Professional verification error:', error?.code || error?.message || error);
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok:false,
      code:error?.code || '',
      error:status >= 500 ? 'Verifikimi profesional dështoi.' : clean(error?.message),
    });
  }
}

module.exports = {
  BUCKET,
  MAX_DOCUMENT_BYTES,
  SIGNED_URL_SECONDS,
  ProfessionalVerificationError,
  requested,
  handle,
  uploadVerification,
  enrollmentStatus,
  signedDocument,
  _test:{ safeFilename, decodeDocument, storageObjectUrl, serverHeaders, pendingProfile, documentById },
};
