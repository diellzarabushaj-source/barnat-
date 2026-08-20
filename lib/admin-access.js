'use strict';

// Server-side admin authorization for everything that writes shared data.
//
// A signed MedIndex session proves *who* the caller is; it does not prove they are
// still an admin, because a session stays valid for its whole TTL after a profile is
// demoted or suspended. Every shared write therefore re-reads `public.profiles`
// through the server-only key at request time, so a revoked admin loses shared write
// access immediately instead of at the next sign-in.

const { neonRequest } = require('./neon-data-api.js');

const clean = value => String(value ?? '').trim();
const lowerEmail = value => clean(value).toLowerCase();

// Administration belongs to named people, not to whoever happens to carry the
// role. `profiles.role` still has to say `admin` — this is an additional gate on
// top of it, so a row edited directly in the database, or a promotion that
// slipped past the review function, still cannot reach an admin surface.
//
// The list is configurable for a future co-administrator; it defaults to the
// owner alone.
function adminEmails() {
  const configured = String(process.env.MEDINDEX_ADMIN_EMAILS || '')
    .split(',')
    .map(lowerEmail)
    .filter(value => value.includes('@'));
  return new Set(configured.length ? configured : ['diellzarabushaj@gmail.com']);
}

function isAdminEmail(value) {
  return adminEmails().has(lowerEmail(value));
}

class AdminAccessError extends Error {
  constructor(status, message, code = '') {
    super(message);
    this.name = 'AdminAccessError';
    this.status = status;
    this.code = code;
  }
}

async function sessionOf(req) {
  const auth = await import('./auth.mjs');
  return auth.sessionData(auth.sessionFromRequest(req));
}

async function profileById(authUid) {
  const { data } = await neonRequest(
    `profiles?select=id,role,status,legacy_user_id&id=eq.${encodeURIComponent(authUid)}&limit=1`,
  );
  return Array.isArray(data) ? data[0] || null : null;
}

// Resolves the caller's live Supabase profile, or throws with a precise reason.
// The emergency `legacy-password` rollback session deliberately does not qualify:
// it exists to keep the owner reading MedIndex when Supabase Auth is unreachable,
// and must never carry write authority over shared clinical data.
async function requireAdminSession(req, deps = {}) {
  const readSession = deps.readSession || sessionOf;
  const readProfile = deps.readProfile || profileById;
  const session = await readSession(req);
  if (!session) throw new AdminAccessError(401, 'Sesioni nuk është aktiv.', 'SESSION_REQUIRED');
  if (!['supabase-google', 'supabase-password'].includes(session.provider) || !clean(session.authUid)) {
    throw new AdminAccessError(403, 'Ky veprim kërkon hyrje me Google të verifikuar nga Supabase.', 'SUPABASE_SESSION_REQUIRED');
  }

  const profile = await readProfile(clean(session.authUid));
  if (!profile) throw new AdminAccessError(403, 'Profili i MedIndex-it nuk u gjet.', 'PROFILE_MISSING');
  const role = clean(profile.role);
  const status = clean(profile.status);
  if (status !== 'active') throw new AdminAccessError(403, 'Llogaria nuk është aktive.', 'ACCOUNT_INACTIVE');
  if (role !== 'admin') throw new AdminAccessError(403, 'Ky veprim është vetëm për administratorin.', 'ADMIN_REQUIRED');
  // The session's email is signed by the server and cannot be rewritten by the
  // browser, so it is safe to gate on here.
  if (!isAdminEmail(session.email)) {
    throw new AdminAccessError(403, 'Ky veprim është vetëm për administratorin.', 'ADMIN_EMAIL_NOT_ALLOWED');
  }

  return {
    authUid:clean(profile.id),
    storageUid:clean(session.uid),
    email:clean(session.email).toLowerCase(),
    name:clean(session.name),
    role,
    status,
    legacyUserId:clean(profile.legacy_user_id),
  };
}

// Same live check, but reports rather than throws. Useful for read endpoints that
// only need to know whether to expose admin surfaces.
async function adminSessionOrNull(req, deps = {}) {
  try {
    return await requireAdminSession(req, deps);
  } catch {
    return null;
  }
}

module.exports = {
  AdminAccessError,
  adminEmails,
  isAdminEmail,
  requireAdminSession,
  adminSessionOrNull,
  _test:{ clean, profileById, sessionOf },
};
