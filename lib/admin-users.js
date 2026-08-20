'use strict';

// Admin user management: list the accounts that signed up, approve or suspend them,
// and grant or withdraw admin rights.
//
// Authorization model:
//   - `public.profiles` is the source of truth (role + status).
//   - A new Supabase Auth user is created with status `pending` and can read nothing
//     until an admin approves it.
//   - `medindex_users.enabled` mirrors the approval so an already-signed-in session
//     loses access immediately instead of at the end of its 8h TTL.

const { neonRequest } = require('./neon-data-api.js');
const AdminAccess = require('./admin-access.js');

const STATUSES = Object.freeze(['pending', 'active', 'suspended', 'disabled']);
const ROLES = Object.freeze(['doctor', 'admin']);
const AUTH_ADMIN_TIMEOUT_MS = 8000;
const AUTH_ADMIN_PAGE_SIZE = 200;

const clean = value => String(value ?? '').trim();
const lowerEmail = value => clean(value).toLowerCase();

class AdminUsersError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'AdminUsersError';
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

// Emails live in `auth.users`, which PostgREST does not expose, so the Auth Admin
// API is the only way to show an admin who is waiting for approval — a pending
// account has never completed a login and therefore has no `medindex_users` row.
async function authUsers(fetchImpl = globalThis.fetch) {
  const key = secretKey();
  if (!key) throw new AdminUsersError(503, 'Çelësi privat i Supabase mungon në server.', 'SUPABASE_SECRET_MISSING');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_ADMIN_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `${supabaseUrl()}/auth/v1/admin/users?per_page=${AUTH_ADMIN_PAGE_SIZE}`,
      {
        method:'GET',
        headers:{ apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json' },
        signal:controller.signal,
      },
    );
    if (!response.ok) throw new AdminUsersError(503, 'Lista e llogarive nuk u lexua nga Supabase Auth.', 'AUTH_ADMIN_UNAVAILABLE');
    const data = await response.json().catch(() => null);
    const users = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
    return users.map(user => ({
      id:clean(user?.id),
      email:lowerEmail(user?.email),
      createdAt:clean(user?.created_at),
      lastSignInAt:clean(user?.last_sign_in_at),
    })).filter(user => user.id);
  } catch (error) {
    if (error instanceof AdminUsersError) throw error;
    throw new AdminUsersError(503, 'Supabase Auth nuk u përgjigj për listën e llogarive.', 'AUTH_ADMIN_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

async function profileRows() {
  const { data } = await neonRequest(
    'profiles?select=id,full_name,specialty,license_number,professional_title,role,status,legacy_user_id,verification_status,verification_submitted_at,verification_reviewed_at,created_at,updated_at'
    + '&order=created_at.desc&limit=500',
  );
  return Array.isArray(data) ? data : [];
}

async function profileById(id) {
  const { data } = await neonRequest(
    `profiles?select=id,full_name,role,status,legacy_user_id,verification_status&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const row = Array.isArray(data) ? data[0] || null : null;
  if (!row) throw new AdminUsersError(404, 'Ky përdorues nuk ekziston.', 'USER_NOT_FOUND');
  return row;
}

function mergeUser(profile, authUser, verificationDocument = null) {
  return {
    id:clean(profile.id),
    email:authUser ? authUser.email : '',
    fullName:clean(profile.full_name),
    professionalTitle:clean(profile.professional_title),
    specialty:clean(profile.specialty),
    licenseNumber:clean(profile.license_number),
    role:clean(profile.role),
    status:clean(profile.status),
    verificationStatus:clean(profile.verification_status) || 'missing',
    verificationSubmittedAt:clean(profile.verification_submitted_at),
    verificationReviewedAt:clean(profile.verification_reviewed_at),
    verificationDocument:verificationDocument ? {
      id:clean(verificationDocument.id),
      filename:clean(verificationDocument.original_filename),
      mimeType:clean(verificationDocument.mime_type),
      byteSize:Number(verificationDocument.byte_size) || 0,
      documentKind:clean(verificationDocument.document_kind),
      status:clean(verificationDocument.status),
      createdAt:clean(verificationDocument.created_at),
      reviewedAt:clean(verificationDocument.reviewed_at),
      rejectionReason:clean(verificationDocument.rejection_reason),
    } : null,
    // Whether this address may hold the admin role at all. The dashboard uses it
    // to decide whether to offer the promotion, so an admin is never shown a
    // button the server and the database would both refuse.
    canBeAdmin:AdminAccess.isAdminEmail(authUser ? authUser.email : ''),
    hasLegacyData:Boolean(clean(profile.legacy_user_id)),
    createdAt:clean(profile.created_at) || (authUser ? authUser.createdAt : ''),
    lastSignInAt:authUser ? authUser.lastSignInAt : '',
  };
}

async function listUsers(options = {}) {
  const [profiles, accounts, documentsResult] = await Promise.all([
    profileRows(),
    authUsers(options.fetchImpl || globalThis.fetch),
    neonRequest(
      'verification_documents?select=id,user_id,original_filename,mime_type,byte_size,document_kind,status,rejection_reason,reviewed_at,created_at'
      + '&order=created_at.desc&limit=500',
    ),
  ]);
  const accountById = new Map(accounts.map(account => [account.id, account]));
  const latestDocumentByUser = new Map();
  const documents = Array.isArray(documentsResult?.data) ? documentsResult.data : [];
  documents.forEach(document => {
    const userId = clean(document.user_id);
    if (userId && !latestDocumentByUser.has(userId)) latestDocumentByUser.set(userId, document);
  });
  const users = profiles.map(profile => mergeUser(
    profile,
    accountById.get(clean(profile.id)) || null,
    latestDocumentByUser.get(clean(profile.id)) || null,
  ));
  return {
    users,
    counts:STATUSES.reduce((totals, status) => {
      totals[status] = users.filter(user => user.status === status).length;
      return totals;
    }, {}),
  };
}

// The storage UUID owns the private library. It equals the Auth UUID for every
// account created after Phase 5; the original owner keeps a bridged legacy UUID.
function storageUidOf(profile) {
  return clean(profile.legacy_user_id) || clean(profile.id);
}

async function activeAdminCount() {
  const { data } = await neonRequest('profiles?select=id&role=eq.admin&status=eq.active&limit=100');
  return Array.isArray(data) ? data.length : 0;
}

// Refuses any change that would leave MedIndex without a usable administrator, and
// any attempt by an admin to strip their own access (which would lock them out of
// the very screen that could undo it).
async function assertSafeChange(actor, profile, nextRole, nextStatus) {
  const losesAdmin = clean(profile.role) === 'admin' && (nextRole !== 'admin' || nextStatus !== 'active');
  if (!losesAdmin) return;
  if (clean(profile.id) === clean(actor.authUid)) {
    throw new AdminUsersError(409, 'Nuk mund t\'i heqësh vetes qasjen e administratorit.', 'SELF_DEMOTION_BLOCKED');
  }
  if (await activeAdminCount() <= 1) {
    throw new AdminUsersError(409, 'MedIndex duhet të ketë së paku një administrator aktiv.', 'LAST_ADMIN_BLOCKED');
  }
}

function mappedReviewError(error) {
  const code = [
    'PROFESSIONAL_DOCUMENT_REQUIRED', 'ACTIVE_ADMIN_REQUIRED', 'SELF_DEMOTION_BLOCKED',
    'LAST_ADMIN_BLOCKED', 'USER_NOT_FOUND', 'ROLE_INVALID', 'STATUS_INVALID',
    'REJECTION_REASON_TOO_LONG',
  ].find(value => String(error?.message || '').includes(value));
  if (!code) return error;
  const messages = {
    PROFESSIONAL_DOCUMENT_REQUIRED:'Regjistrimi nuk mund të aprovohet pa dokument profesional.',
    ACTIVE_ADMIN_REQUIRED:'Administratori nuk është më aktiv.',
    SELF_DEMOTION_BLOCKED:'Nuk mund t\'i heqësh vetes qasjen e administratorit.',
    LAST_ADMIN_BLOCKED:'MedIndex duhet të ketë së paku një administrator aktiv.',
    USER_NOT_FOUND:'Ky përdorues nuk ekziston.',
    ROLE_INVALID:'Roli i kërkuar nuk është i vlefshëm.',
    STATUS_INVALID:'Statusi i kërkuar nuk është i vlefshëm.',
    REJECTION_REASON_TOO_LONG:'Arsyeja e refuzimit është tepër e gjatë.',
  };
  return new AdminUsersError(code === 'USER_NOT_FOUND' ? 404 : 409, messages[code], code);
}

// Administration is limited to named addresses, so promoting anyone else is
// refused here rather than being written and then rejected at the door — an
// account marked admin that no admin surface accepts is worse than no promotion
// at all.
async function assertAdminEmailAllowed(targetId, nextRole, accounts) {
  if (nextRole !== 'admin') return;
  const account = accounts.find(item => item.id === targetId);
  const email = clean(account?.email).toLowerCase();
  if (!email || !AdminAccess.isAdminEmail(email)) {
    throw new AdminUsersError(
      403,
      'Vetëm adresat e lejuara mund të jenë administratore.',
      'ADMIN_EMAIL_NOT_ALLOWED',
    );
  }
}

async function updateUser(actor, input = {}, options = {}) {
  const targetId = clean(input.userId);
  if (!targetId) throw new AdminUsersError(400, 'Mungon përdoruesi që duhet ndryshuar.', 'USER_ID_MISSING');

  const profile = await profileById(targetId);
  const nextRole = input.role === undefined ? clean(profile.role) : clean(input.role);
  const nextStatus = input.status === undefined ? clean(profile.status) : clean(input.status);
  if (!ROLES.includes(nextRole)) throw new AdminUsersError(400, 'Roli i kërkuar nuk është i vlefshëm.', 'ROLE_INVALID');
  if (!STATUSES.includes(nextStatus)) throw new AdminUsersError(400, 'Statusi i kërkuar nuk është i vlefshëm.', 'STATUS_INVALID');

  await assertSafeChange(actor, profile, nextRole, nextStatus);
  if (nextRole === 'admin' && clean(profile.role) !== 'admin') {
    await assertAdminEmailAllowed(targetId, nextRole, await authUsers(options.fetchImpl || globalThis.fetch));
  }

  const previous = { role:clean(profile.role), status:clean(profile.status) };
  if (previous.role === nextRole && previous.status === nextStatus) {
    return { ok:true, changed:false, user:{ id:targetId, role:nextRole, status:nextStatus } };
  }

  try {
    const { data } = await neonRequest('rpc/review_medindex_registration', {
      method:'POST',
      body:{
        p_actor_id:clean(actor.authUid),
        p_target_id:targetId,
        p_role:nextRole,
        p_status:nextStatus,
        p_rejection_reason:clean(input.rejectionReason, 1000) || null,
      },
      prefer:'return=representation',
    });
    return {
      ok:true,
      changed:true,
      user:data && typeof data === 'object' ? data : {
        id:targetId, role:nextRole, status:nextStatus,
      },
    };
  } catch (error) {
    throw mappedReviewError(error);
  }
}

// State-changing admin calls carry the same CSRF proof as every other MedIndex
// write path; the origin check alone is not the convention here.
async function verifyCsrf(req) {
  const auth = await import('./auth.mjs');
  const token = String(req.headers?.['x-csrf-token'] || '').trim().slice(0, 500);
  if (!auth.verifyCsrfToken(req, token)) {
    throw new AdminUsersError(403, 'Kontrolli i sigurisë skadoi. Rifresko faqen.', 'CSRF_INVALID');
  }
}

function requested(req, queryValue) {
  return queryValue(req, 'scope') === 'users';
}

async function handle(req, res, helpers = {}) {
  const parseBody = helpers.parseBody || (request => (request.body && typeof request.body === 'object' ? request.body : {}));
  let actor;
  try {
    actor = await AdminAccess.requireAdminSession(req);
  } catch (error) {
    return res.status(Number(error?.status) || 403).json({
      ok:false,
      code:error?.code || 'ADMIN_REQUIRED',
      error:clean(error?.message) || 'Ky veprim është vetëm për administratorin.',
    });
  }

  try {
    if (req.method === 'GET') return res.status(200).json({ ok:true, ...(await listUsers()) });
    if (req.method === 'PATCH' || req.method === 'POST') {
      if (!/^application\/json\b/i.test(clean(req.headers?.['content-type']))) {
        return res.status(415).json({ ok:false, error:'Kërkohet Content-Type application/json.' });
      }
      await verifyCsrf(req);
      return res.status(200).json(await updateUser(actor, await parseBody(req), helpers));
    }
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ ok:false, error:'Metoda nuk lejohet.' });
  } catch (error) {
    console.error('Admin users error:', error?.code || error?.message || error);
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      ok:false,
      code:error?.code || '',
      error:status >= 500 ? 'Menaxhimi i përdoruesve dështoi.' : clean(error?.message),
    });
  }
}

module.exports = {
  AdminUsersError,
  STATUSES,
  ROLES,
  requested,
  handle,
  listUsers,
  updateUser,
  _test:{ supabaseUrl, secretKey, authUsers, mergeUser, storageUidOf, assertSafeChange, assertAdminEmailAllowed, activeAdminCount, verifyCsrf, mappedReviewError },
};
