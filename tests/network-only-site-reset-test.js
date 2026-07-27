const assert = require('node:assert/strict');
const path = require('node:path');

const handler = require(path.resolve(__dirname, '../api/auth.js'));

function responseMock() {
  const headers = new Map();
  return {
    statusCode:200,
    body:'',
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    end(value = '') { this.body = String(value); return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
  };
}

(async () => {
  assert.equal(handler._test.resetRequested({ method:'GET', url:'/api/auth?reset=1' }), true);
  assert.equal(handler._test.resetRequested({ method:'POST', url:'/api/auth?reset=1' }), false);
  assert.equal(handler._test.resetRequested({ method:'GET', url:'/api/auth' }), false);

  const req = { method:'GET', url:'/api/auth?reset=1', headers:{}, socket:{} };
  const res = responseMock();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.getHeader('clear-site-data') || '', /"cache"/);
  assert.match(res.getHeader('clear-site-data') || '', /"cookies"/);
  assert.match(res.getHeader('clear-site-data') || '', /"storage"/);
  assert.match(res.getHeader('cache-control') || '', /no-store/);
  assert.match(res.getHeader('content-type') || '', /text\/html/);
  assert.match(res.getHeader('content-security-policy') || '', /default-src 'none'/);
  assert.match(res.getHeader('refresh') || '', /login\.html\?reset-complete=1/);
  assert.match(res.body, /Po pastrohet cache-i i dëmtuar/);
  assert.match(res.body, /http-equiv="refresh"/);
  assert.doesNotMatch(res.body, /<script\b/i, 'reset page must not depend on JavaScript');
  assert.doesNotMatch(res.body, /<link\b/i, 'reset page must not depend on cached stylesheets');

  console.log('Network-only site reset audit passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});