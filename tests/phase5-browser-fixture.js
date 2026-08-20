'use strict';

const TEST_USER = Object.freeze({
  email:'test@medindex.local',
  role:'editor',
  name:'MedIndex Browser Test',
});

function phase5AuthenticatedSession(overrides = {}) {
  return {
    authenticated:true,
    user:{ ...TEST_USER, ...(overrides.user || {}) },
    sessionVersion:3,
    identityContract:'legacy-password-rollback',
    supabaseAuthenticated:false,
    rollbackSession:true,
    authUser:null,
    sessionHours:8,
    hardened:true,
    accessConfigured:true,
    passwordFallbackConfigured:true,
    googleConfigured:false,
    googleClientId:'',
    sessionConfigured:true,
    csrfToken:'phase5-browser-test-csrf',
    ...overrides,
    user:{ ...TEST_USER, ...(overrides.user || {}) },
  };
}

function emptyUserLibrarySnapshot(overrides = {}) {
  return {
    user:{ ...TEST_USER },
    prescriptions:[],
    favorites:[],
    drugs:[],
    tombstones:{ prescriptions:[], favorites:[], drugs:[] },
    generatedAt:'2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

module.exports = {
  TEST_USER,
  phase5AuthenticatedSession,
  emptyUserLibrarySnapshot,
};
