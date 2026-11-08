'use strict';
const assert = require('node:assert/strict');
process.env.SESSION_SECRET = 'medlex-sanity-api-test-only-secret-with-at-least-32-characters';
const handler = require('../api/medical-hub.js');
const originalFetch = global.fetch;
let queries = 0;
global.fetch = async target => {
  const url = new URL(target);
  assert.equal(url.hostname, '4wdtp8cz.api.sanity.io');
  assert.equal(url.searchParams.get('perspective'), 'published');
  assert.ok(url.searchParams.get('query').includes('_type == "medlexCard"'));
  queries++;
  return new Response(JSON.stringify({result:{chapters:[], subchapters:[], cards:[]}}), {headers:{'Content-Type':'application/json'}});
};
function request(method, cookie = '') {
  const response = {headers:{}, statusCode:200,
    setHeader(name, value) {this.headers[name] = value;},
    status(value) {this.statusCode = value; return this;},
    json(value) {this.body = value; return this;}};
  return handler({method, url:'/api/medical-hub?_route=medlex', headers:{cookie}}, response).then(() => response);
}
(async () => {
  try {
    assert.equal((await request('GET')).statusCode, 401);
    assert.equal((await request('POST')).statusCode, 405);
    assert.equal(queries, 0, 'unauthorized calls must not query Sanity');
    const auth = await import('../lib/auth.mjs');
    const token = auth.createSessionToken({uid:'test-storage-id', authUid:'test-auth-id', email:'doctor@example.test',
      name:'Doctor', role:'user', authRole:'doctor', authStatus:'active', provider:'supabase-email'});
    const result = await request('GET', `${auth.COOKIE_NAME}=${token}`);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.source, 'sanity-medlex-published');
    assert.equal(result.body.catalog.categories.length, 19);
    assert.equal(result.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.equal(queries, 1);
    console.log('MedLex API passed: authenticated published Sanity reads, protected methods, cache policy and complete local fallback.');
  } finally {global.fetch = originalFetch;}
})().catch(error => {console.error(error); process.exitCode = 1;});
