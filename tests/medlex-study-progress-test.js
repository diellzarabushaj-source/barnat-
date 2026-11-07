'use strict';

const assert = require('node:assert/strict');
process.env.SESSION_SECRET = 'medlex-progress-fixture-secret-at-least-32-characters';
process.env.MEDINDEX_SUPABASE_SECRET_KEY = 'sb_secret_test_fixture';
const handler = require('../api/auth.js');
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const writes = new Map();
const originalFetch = global.fetch;
global.fetch = async (target, options) => {
  const url = new URL(target);
  assert.equal(url.pathname, '/rest/v1/medlex_study_progress');
  assert.equal(options.headers.apikey, 'sb_secret_test_fixture');
  const body = options.body && JSON.parse(options.body);
  const owner = url.searchParams.get('user_id')?.replace(/^eq\./,'') || body.user_id;
  assert.ok([first, second].includes(owner));
  let result = writes.get(owner);
  if (options.method === 'POST') {
    assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
    if (!result) { writes.set(owner, body); result = body; } else result = null;
  }
  if (options.method === 'PATCH') {
    assert.equal(body.user_id, undefined);
    if (url.searchParams.get('revision') === 'eq.' + result?.revision) {
      writes.set(owner, body); result = body;
    } else result = null;
  }
  return Response.json(result ? [result] : []);
};

function request(method, cookie, account, body, origin = 'https://barnat.test') {
  const response = {headers:{},
    setHeader(name, value) {this.headers[name] = value;},
    status(value) {this.statusCode = value; return this;},
    json(value) {this.body = value; return this;},
  };
  const headers = {cookie, host:'barnat.test', origin, 'x-medlex-account':account};
  return handler({method, url:'/api/auth?scope=medlex-progress', headers, body}, response).then(() => response);
}

(async () => {
  try {
    const auth = await import('../lib/auth.mjs');
    const cookie = id => `${auth.COOKIE_NAME}=${auth.createSessionToken({
      uid:id, authUid:id, email:'doctor@example.test', name:'Test', role:'user',
      authRole:'doctor', authStatus:'active', provider:'supabase-password',
    })}`;
    const snapshot = {ratings:{'c05-001':'known'},session:{chapter:'05',topic:'ritmi',deck:['c05-001','c05-002'],answers:['known']}};
    const mutation = '33333333-3333-4333-8333-333333333333';
    const payload = {revision:0,mutation,snapshot};
    assert.equal((await request('GET','',first)).statusCode, 401);
    assert.equal((await request('PUT',cookie(second),first,payload)).statusCode, 403);
    assert.equal((await request('PUT',cookie(first),first,payload,'https://another.test')).statusCode, 403);
    assert.equal((await request('POST',cookie(first),first,payload)).statusCode, 405);
    assert.equal((await request('PUT',cookie(first),first,{...payload,snapshot:{...snapshot,session:{...snapshot.session,deck:['1','1']}}})).statusCode, 400);
    assert.equal(writes.size, 0);
    const saved = await request('PUT',cookie(first),first,{...payload,user_id:second});
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.deepEqual(saved.body.snapshot,snapshot);
    assert.deepEqual((await request('GET',cookie(first),first)).body.snapshot,snapshot);
    assert.deepEqual((await request('GET',cookie(second),second)).body.snapshot,{ratings:{},session:null});
    assert.equal((await request('PUT',cookie(first),first,payload)).body.revision, 1, 'Retry is idempotent');
    const [newer, stale] = await Promise.all([
      request('PUT',cookie(first),first,{...payload,revision:1,mutation:'44444444-4444-4444-8444-444444444444'}),
      request('PUT',cookie(first),first,{...payload,revision:1,mutation:'55555555-5555-4555-8555-555555555555'}),
    ]);
    assert.deepEqual([newer.statusCode,stale.statusCode].sort(),[200,409]);
    assert.equal((await request('GET',cookie(first),first)).body.revision, 2);
    console.log('MedLex progress: authenticated isolation, cross-origin rejection, payload validation, idempotent retry and concurrent revision checks passed.');
  } finally { global.fetch = originalFetch; }
})().catch(error => {console.error(error); process.exitCode = 1;});
