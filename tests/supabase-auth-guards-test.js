'use strict';

const assert = require('node:assert/strict');

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const originalMedindexUrl = process.env.MEDINDEX_SUPABASE_URL;
const originalMedindexKey = process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY;

process.env.SUPABASE_URL = 'https://phase4-test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_phase4_test';
delete process.env.MEDINDEX_SUPABASE_URL;
delete process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY;

const auth = require('../lib/supabase-auth.js');

function response(status, payload) {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() { return payload === undefined ? '' : JSON.stringify(payload); },
  };
}

function request(token = 'test.jwt.token') {
  return { headers:{ authorization:`Bearer ${token}` } };
}

function queuedFetch(items, calls) {
  return async (url, options = {}) => {
    calls.push({ url:String(url), options });
    assert.ok(items.length, `Unexpected fetch: ${url}`);
    return items.shift();
  };
}

async function expectCode(promise, code, status) {
  await assert.rejects(promise, error => {
    assert.equal(error?.code, code);
    if (status !== undefined) assert.equal(error?.status, status);
    return true;
  });
}

(async () => {
  try {
    assert.equal(auth.bearerToken({ headers:{} }), '');
    assert.equal(auth.bearerToken(request('abc.def.ghi')), 'abc.def.ghi');
    assert.throws(
      () => auth.requireBearerToken({ headers:{} }),
      error => error?.code === 'AUTH_REQUIRED' && error?.status === 401
    );
    assert.throws(
      () => auth.bearerToken({ headers:{ authorization:'Basic abc' } }),
      error => error?.code === 'AUTH_HEADER_INVALID'
    );

    {
      const calls = [];
      const fetchImpl = queuedFetch([
        response(200, {
          id:'11111111-1111-1111-1111-111111111111',
          email:'Doctor@Example.com',
          user_metadata:{ role:'admin' },
        }),
        response(200, [{
          id:'11111111-1111-1111-1111-111111111111',
          full_name:'Doctor Test',
          role:'doctor',
          status:'active',
        }]),
      ], calls);
      const identity = await auth.requireDoctor(request(), { fetchImpl });
      assert.equal(identity.email, 'doctor@example.com');
      assert.equal(identity.role, 'doctor', 'Authorization must come from profiles, not user_metadata.');
      assert.equal(identity.status, 'active');
      assert.equal(calls.length, 2);
      assert.match(calls[0].url, /\/auth\/v1\/user$/);
      assert.match(calls[1].url, /\/rest\/v1\/profiles\?/);
      assert.equal(calls[0].options.headers.apikey, 'sb_publishable_phase4_test');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer test.jwt.token');
      assert.equal(calls[1].options.headers.Authorization, 'Bearer test.jwt.token');
    }

    {
      const fetchImpl = queuedFetch([
        response(200, { id:'22222222-2222-2222-2222-222222222222', email:'doctor@example.com' }),
        response(200, [{ id:'22222222-2222-2222-2222-222222222222', role:'doctor', status:'active' }]),
      ], []);
      await expectCode(auth.requireAdmin(request(), { fetchImpl }), 'ADMIN_REQUIRED', 403);
    }

    {
      const fetchImpl = queuedFetch([
        response(200, { id:'33333333-3333-3333-3333-333333333333', email:'admin@example.com' }),
        response(200, [{ id:'33333333-3333-3333-3333-333333333333', role:'admin', status:'active' }]),
      ], []);
      const identity = await auth.requireAdmin(request(), { fetchImpl });
      assert.equal(identity.role, 'admin');
    }

    {
      const fetchImpl = queuedFetch([
        response(200, { id:'44444444-4444-4444-4444-444444444444', email:'suspended@example.com' }),
        response(200, [{ id:'44444444-4444-4444-4444-444444444444', role:'doctor', status:'suspended' }]),
      ], []);
      await expectCode(auth.requireDoctor(request(), { fetchImpl }), 'ACCOUNT_INACTIVE', 403);
    }

    {
      const fetchImpl = queuedFetch([
        response(200, { id:'55555555-5555-5555-5555-555555555555', email:'missing@example.com' }),
        response(200, []),
      ], []);
      await expectCode(auth.requireDoctor(request(), { fetchImpl }), 'PROFILE_MISSING', 403);
    }

    {
      const fetchImpl = queuedFetch([response(401, { message:'invalid token' })], []);
      await expectCode(auth.requireDoctor(request(), { fetchImpl }), 'AUTH_TOKEN_INVALID', 401);
    }

    console.log('Phase 4 Supabase Auth guard tests passed.');
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
    if (originalMedindexUrl === undefined) delete process.env.MEDINDEX_SUPABASE_URL;
    else process.env.MEDINDEX_SUPABASE_URL = originalMedindexUrl;
    if (originalMedindexKey === undefined) delete process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY;
    else process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY = originalMedindexKey;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
