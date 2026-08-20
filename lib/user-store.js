'use strict';

const { neonRequest } = require('./neon-data-api.js');

const OWNER_EMAIL = 'diellzarabushaj@gmail.com';
const clean = value => String(value ?? '').trim();
const lowerEmail = value => clean(value).toLowerCase();

function allowedEmails() {
  // Only the explicit emergency owner fallback uses an allowlist. Normal Google
  // accounts are authorized exclusively by their live Supabase profile.
  return new Set([OWNER_EMAIL]);
}

function isAllowedEmail(email) {
  return allowedEmails().has(lowerEmail(email));
}

function roleForEmail(email) {
  return lowerEmail(email) === OWNER_EMAIL ? 'editor' : 'user';
}

// Supabase `profiles` is the authorization source of truth for Google sessions.
// Only an admin profile keeps write access to the shared clinical registry; every
// approved doctor is a normal user with a private library of their own.
function roleForProfileRole(profileRole) {
  return clean(profileRole) === 'admin' ? 'editor' : 'user';
}

async function fetchUserByEmail(email) {
  const normalized = lowerEmail(email);
  if (!normalized) return null;
  const { data } = await neonRequest(
    `medindex_users?select=id,google_sub,email,display_name,picture_url,role,enabled,last_login_at,created_at,updated_at&email=eq.${encodeURIComponent(normalized)}&limit=1`
  );
  return Array.isArray(data) ? data[0] || null : null;
}

async function fetchUserById(id) {
  const value = clean(id);
  if (!value) return null;
  const { data } = await neonRequest(
    `medindex_users?select=id,google_sub,email,display_name,picture_url,role,enabled,last_login_at,created_at,updated_at&id=eq.${encodeURIComponent(value)}&limit=1`
  );
  return Array.isArray(data) ? data[0] || null : null;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id:clean(row.id),
    sub:clean(row.google_sub),
    email:lowerEmail(row.email),
    name:clean(row.display_name),
    picture:clean(row.picture_url),
    role:row.role === 'user' ? 'user' : 'editor',
    enabled:row.enabled === true,
    lastLoginAt:row.last_login_at || '',
  };
}

async function ensureUser(identity = {}) {
  const email = lowerEmail(identity.email);
  // `authorizedRole` is set only after Supabase Auth verified an approved, active
  // profile. Without it we fall back to the static allowlist, which still guards the
  // emergency password rollback path.
  const profileRole = clean(identity.authorizedRole);
  if (!profileRole && !isAllowedEmail(email)) {
    const error = new Error('Kjo llogari Google nuk ka qasje në MedIndex.');
    error.status = 403;
    error.code = 'EMAIL_NOT_ALLOWED';
    throw error;
  }
  const existing = await fetchUserByEmail(email);
  if (existing && existing.enabled === false) {
    const error = new Error('Llogaria e MedIndex-it nuk është aktive.');
    error.status = 403;
    error.code = 'USER_DISABLED';
    throw error;
  }
  const role = profileRole ? roleForProfileRole(profileRole) : roleForEmail(email);
  const now = new Date().toISOString();
  const requestedId = clean(identity.id || identity.uid);
  const record = {
    ...(requestedId && !existing ? { id:requestedId } : {}),
    email,
    google_sub:clean(identity.sub) || clean(existing?.google_sub) || null,
    display_name:clean(identity.name) || clean(existing?.display_name) || (email === OWNER_EMAIL ? 'Diellza Rabushaj' : null),
    picture_url:clean(identity.picture) || clean(existing?.picture_url) || null,
    role,
    enabled:true,
    last_login_at:now,
    updated_at:now,
  };
  const { data } = await neonRequest(
    'medindex_users?on_conflict=email&select=id,google_sub,email,display_name,picture_url,role,enabled,last_login_at,created_at,updated_at',
    {
      method:'POST',
      body:[record],
      prefer:'resolution=merge-duplicates,return=representation',
    }
  );
  const user = mapUser(Array.isArray(data) ? data[0] : null);
  if (!user?.id || !user.enabled) {
    const error = new Error('Llogaria e MedIndex-it nuk është aktive.');
    error.status = 403;
    error.code = 'USER_DISABLED';
    throw error;
  }
  return user;
}

async function userFromSession(request) {
  const auth = await import('./auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(request));
  if (!session) return null;
  let row = session.uid ? await fetchUserById(session.uid) : null;
  if (!row && session.email) row = await fetchUserByEmail(session.email);

  // A `supabase-google` session only decodes when Supabase Auth already verified an
  // approved (doctor|admin + active) profile, so the profile role authorizes the
  // request. The static allowlist stays in charge of the password rollback path.
  const sessionRole = session.provider === 'supabase-google' ? clean(session.authRole) : '';
  const sessionAuthorized = Boolean(sessionRole) || isAllowedEmail(session.email);

  // The private user table starts empty for every newly approved account, and did so
  // for the owner during the Neon → Supabase cutover. Recreate the authorized user
  // from the already-signed MedIndex session, preserving the UUID so the personal
  // library stays attached.
  if (!row && session.email && sessionAuthorized) {
    try {
      return await ensureUser({
        id:session.uid,
        sub:session.sub,
        email:session.email,
        name:session.name,
        picture:session.picture,
        authorizedRole:sessionRole,
      });
    } catch {
      return null;
    }
  }

  const user = mapUser(row);
  // `enabled` is the immediate revocation switch for an account that is already
  // signed in; suspending the profile in Supabase blocks the next sign-in.
  if (!user?.enabled || !sessionAuthorized) return null;
  return user;
}

module.exports = {
  OWNER_EMAIL,
  allowedEmails,
  isAllowedEmail,
  roleForEmail,
  roleForProfileRole,
  fetchUserByEmail,
  fetchUserById,
  ensureUser,
  userFromSession,
  mapUser,
};
