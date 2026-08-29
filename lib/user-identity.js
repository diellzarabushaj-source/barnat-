'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_SESSION_PROVIDERS = new Set(['supabase-google', 'supabase-password']);

const clean = value => String(value ?? '').trim();

function uuidOrEmpty(value) {
  const id = clean(value);
  return UUID_RE.test(id) ? id.toLowerCase() : '';
}

function authUidFromProfile(profile = {}) {
  return uuidOrEmpty(profile.id);
}

function legacyStorageUidFromProfile(profile = {}) {
  return uuidOrEmpty(profile.legacy_user_id || profile.legacyUserId);
}

function profileIdentity(profile = {}) {
  const authUid = authUidFromProfile(profile);
  if (!authUid) throw new Error('PROFILE_AUTH_UUID_INVALID');
  const legacyStorageUid = legacyStorageUidFromProfile(profile);
  const storageUid = legacyStorageUid || authUid;
  return {
    authUid,
    storageUid,
    legacyStorageUid,
    bridged: Boolean(legacyStorageUid && legacyStorageUid !== authUid),
  };
}

function authUidFromSession(session = {}) {
  // Never fall back to session.uid: uid is the compatibility storage owner.
  return uuidOrEmpty(session.authUid);
}

function storageUidFromSession(session = {}) {
  return uuidOrEmpty(session.uid) || authUidFromSession(session);
}

function sessionIdentity(session = {}) {
  const provider = clean(session.provider);
  const authUid = authUidFromSession(session);
  const storageUid = storageUidFromSession(session);
  const isSupabase = SUPABASE_SESSION_PROVIDERS.has(provider);
  return {
    provider,
    isSupabase,
    authUid,
    storageUid,
    bridged: Boolean(authUid && storageUid && authUid !== storageUid),
  };
}

function requireSupabaseSessionIdentity(session = {}) {
  const identity = sessionIdentity(session);
  if (!identity.isSupabase) throw new Error('SUPABASE_SESSION_REQUIRED');
  if (!identity.authUid) throw new Error('SUPABASE_AUTH_UUID_REQUIRED');
  if (!identity.storageUid) throw new Error('STORAGE_UUID_REQUIRED');
  return identity;
}

function canonicalIdentity(identity = {}) {
  const profile = identity.profile && typeof identity.profile === 'object'
    ? identity.profile : {};
  return profileIdentity({
    id:identity.id,
    legacyUserId:profile.legacyUserId,
    legacy_user_id:profile.legacy_user_id,
  });
}

function attachSessionIdentity(user, session = {}) {
  if (!user || typeof user !== 'object') return user;
  const identity = sessionIdentity(session);
  const storageUid = uuidOrEmpty(user.id) || identity.storageUid;
  return {
    ...user,
    // Compatibility alias. New code should use storageUid explicitly.
    id:storageUid || clean(user.id),
    authUid:identity.authUid,
    storageUid,
    identityBridged:Boolean(identity.authUid && storageUid && identity.authUid !== storageUid),
  };
}

function storageUidFromUser(user = {}) {
  return uuidOrEmpty(user.storageUid || user.id);
}

module.exports = {
  UUID_RE,
  SUPABASE_SESSION_PROVIDERS,
  uuidOrEmpty,
  authUidFromProfile,
  legacyStorageUidFromProfile,
  profileIdentity,
  authUidFromSession,
  storageUidFromSession,
  sessionIdentity,
  requireSupabaseSessionIdentity,
  canonicalIdentity,
  attachSessionIdentity,
  storageUidFromUser,
};
