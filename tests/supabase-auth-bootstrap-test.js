'use strict';

const assert = require('node:assert/strict');

const oldUrl = process.env.SUPABASE_URL;
const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const oldMedindexUrl = process.env.MEDINDEX_SUPABASE_URL;
const oldMedindexKey = process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY;

process.env.SUPABASE_URL = 'https://phase4-bootstrap.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_phase4_bootstrap_test';
delete process.env.MEDINDEX_SUPABASE_URL;
delete process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY;

const Bootstrap = require('../lib/supabase-auth-bootstrap.js');
const Endpoint = require('../api/phase4-auth-bootstrap.js')._test;

function response(status, payload) {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload || {}); },
  };
}

(async () => {
  try {
    const calls = [];
    const result = await Bootstrap.exchangeGoogleIdToken({
      credential:'google.id.token',
      nonce:'raw-nonce-value',
      fetchImpl:async (url, options) => {
        calls.push({ url:String(url), options });
        return response(200, {
          access_token:'supabase-access-token',
          user:{ id:'11111111-1111-1111-1111-111111111111', email:'Doctor@Example.com' },
        });
      },
    });

    assert.equal(result.user.email, 'doctor@example.com');
    assert.equal(result.accessToken, 'supabase-access-token');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=id_token$/);
    assert.equal(calls[0].options.headers.apikey, 'sb_publishable_phase4_bootstrap_test');
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, { provider:'google', id_token:'google.id.token', nonce:'raw-nonce-value' });

    await assert.rejects(
      Bootstrap.exchangeGoogleIdToken({ credential:'', nonce:'nonce', fetchImpl:async () => response(200, {}) }),
      error => error?.code === 'GOOGLE_CREDENTIAL_MISSING'
    );
    await assert.rejects(
      Bootstrap.exchangeGoogleIdToken({ credential:'token', nonce:'', fetchImpl:async () => response(200, {}) }),
      error => error?.code === 'AUTH_NONCE_MISSING'
    );
    await assert.rejects(
      Bootstrap.exchangeGoogleIdToken({ credential:'token', nonce:'nonce', fetchImpl:async () => response(401, { message:'bad token' }) }),
      error => error?.code === 'SUPABASE_GOOGLE_EXCHANGE_FAILED' && error?.status === 401
    );

    assert.equal(Endpoint.sameOrigin({ headers:{ origin:'https://preview.example', host:'preview.example' } }), true);
    assert.equal(Endpoint.sameOrigin({ headers:{ origin:'https://evil.example', host:'preview.example' } }), false);
    assert.equal(
      Endpoint.sha256Hex('nonce'),
      '78377b525757b494427f89014f97d79928f3938d14eb51e20fb5dec9834eb304'
    );

    console.log('Phase 4 Google → Supabase Auth bootstrap tests passed.');
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    if (oldMedindexUrl === undefined) delete process.env.MEDINDEX_SUPABASE_URL; else process.env.MEDINDEX_SUPABASE_URL = oldMedindexUrl;
    if (oldMedindexKey === undefined) delete process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY; else process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY = oldMedindexKey;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
