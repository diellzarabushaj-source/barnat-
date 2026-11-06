'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://drx.test';
const buckets = new Map();
const calls = [];
let delayAuth = false;
let releaseAuth;
let authGate = null;
let active = 0;
let peak = 0;
const caches = {
  async open(name) {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const cache = buckets.get(name);
    const key = input => typeof input === 'string' ? new URL(input, origin).href : input.url;
    return {
      async match(input) { return cache.get(key(input))?.clone(); },
      async put(input, response) { cache.set(key(input), response.clone()); },
      async delete(input) { return cache.delete(key(input)); },
      async keys() { return [...cache.keys()].map(url => new Request(url)); },
    };
  },
  async keys() { return [...buckets.keys()]; },
  async delete(name) { return buckets.delete(name); },
};
const sandbox = {
  Request, Response, Headers, URL, AbortController, setTimeout, clearTimeout, caches, console,
  self:{ location:{ origin }, addEventListener() {}, clients:{ async matchAll() { return []; } } },
  async fetch(request, options = {}) {
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.pathname !== '/api/auth') return new Response('fresh ' + url.pathname, {
      headers:{ 'Content-Type':url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html' },
    });
    active++; peak = Math.max(peak, active);
    try {
      if (authGate) await authGate;
      if (delayAuth) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1500);
        (options.signal || request.signal)?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once:true });
      });
      return new Response(JSON.stringify({ authenticated:request.method !== 'DELETE', hardened:true,
        sessionVersion:3, supabaseAuthenticated:true, sessionHours:8,
        authUser:{ id:'doctor' }, user:{ email:'doctor@example.com' } }), { headers:{ 'Content-Type':'application/json' } });
    } finally { active--; }
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../sw.js'), 'utf8'), sandbox);
const req = (path, options) => new Request(origin + path, options);

(async () => {
  // A saved eight-hour lease is exactly what used to select the 1.2s deadline.
  await sandbox.authResponse(req('/api/auth'));
  delayAuth = true;
  const slow = await sandbox.authResponse(req('/api/auth'));
  assert.equal(slow.headers.get('X-MedIndex-Cache'), null, 'Slow renewal must finish rather than return an offline snapshot.');
  assert.equal((await slow.json()).authenticated, true);
  delayAuth = false;

  calls.length = 0; peak = 0;
  authGate = new Promise(resolve => { releaseAuth = resolve; });
  const firstTab = sandbox.queuedAuthResponse(req('/api/auth?session_probe=1'));
  const secondTab = sandbox.queuedAuthResponse(req('/api/auth?entry=1'));
  const logout = sandbox.queuedAuthResponse(req('/api/auth', { method:'DELETE' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['GET /api/auth'], 'Only one tab may rotate the shared cookie at a time.');
  releaseAuth(); authGate = null;
  await Promise.all([firstTab, secondTab, logout]);
  assert.equal(peak, 1);
  assert.deepEqual(calls, ['GET /api/auth', 'GET /api/auth', 'DELETE /api/auth']);
  assert.equal(await sandbox.authSnapshot(), null, 'Explicit logout must clear the saved account after preceding checks.');

  for (const path of ['/landing.html', '/login.html', '/session-resume.html']) {
    const cache = await caches.open('medindex-pages-device-v1');
    await cache.put(req(path), new Response('stale sign-in'));
    const response = await sandbox.navigationResponse({ request:req(path), waitUntil() {} });
    assert.equal(await response.text(), 'fresh ' + path, 'A saved sign-in page must not hide the live remembered login.');
  }
  for (const path of ['/entry-resume.js', '/login.js', '/sidebar-taxonomy-v3.js', '/sidebar-taxonomy-core-v3.js']) {
    const cache = await caches.open('medindex-static-device-v1');
    await cache.put(req(path), new Response('stale auth code'));
    const response = await sandbox.staticResponse({ request:req(path), waitUntil() {} });
    assert.equal(await response.text(), 'fresh ' + path, 'Cached HTML must be able to load the corrected session runtime.');
  }
  console.log('Canonical worker recovery passed: renewal beyond 1.2s, shared-tab ordering, explicit logout, fresh entry pages and auth runtimes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
