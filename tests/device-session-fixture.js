'use strict';

// All remote services are replaced here. The auth handler, encryption, profile
// checks, cookie headers and edge middleware remain the production modules.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
process.env.SESSION_SECRET = 'remember-device-test-only-session-secret-32-characters';
process.env.MEDINDEX_SUPABASE_URL = 'https://device-test.supabase.co';
process.env.MEDINDEX_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_device_test';
process.env.GOOGLE_CLIENT_ID = 'device-test.apps.googleusercontent.com';
process.env.ACCESS_CODE = 'device-test-fallback';
const state = { status:'active', role:'doctor', refreshes:0, logouts:0, transient:false, revoked:new Set(), mismatch:false, storeDisabled:false };
const id = '11111111-2222-4333-8444-555555555555';
const email = 'doctor@example.com';
let sequence = 0;
const accessTokens = new Map();
function fresh() {
  const refresh_token = `refresh-test-${++sequence}`;
  const access_token = `access-test-${sequence}`;
  accessTokens.set(access_token, refresh_token);
  return { access_token, refresh_token, user:{ id:state.mismatch ? 'different-id' : id, email } };
}
globalThis.fetch = async (value, options = {}) => {
  const url = new URL(value);
  if (url.origin !== process.env.MEDINDEX_SUPABASE_URL) throw new Error('Unexpected remote request in auth fixture.');
  let status = 200;
  let body;
  if (url.pathname === '/auth/v1/token') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'refresh_token') {
      state.refreshes++;
      if (state.refreshGate) await state.refreshGate;
      const token = JSON.parse(options.body).refresh_token;
      if (state.transient) { status = 503; body = {}; }
      else if (state.revoked.has(token)) { status = 400; body = { error_code:'refresh_token_not_found' }; }
      else body = fresh();
    } else body = fresh();
  } else if (url.pathname === '/auth/v1/user') body = { id, email };
  else if (url.pathname === '/rest/v1/profiles') body = [{ id, role:state.role, status:state.status, full_name:'Test Doctor' }];
  else if (url.pathname === '/auth/v1/logout') {
    if (url.searchParams.get('scope') !== 'local') throw new Error('Logout must preserve other devices.');
    state.logouts++;
    state.revoked.add(accessTokens.get(String(options.headers.Authorization).replace('Bearer ', '')));
    body = {};
  } else throw new Error(`Unexpected Supabase path: ${url.pathname}`);
  return { ok:status < 400, status, text:async () => JSON.stringify(body) };
};
const Store = require('../lib/user-store.js');
Store.ensureUser = async identity => {
  if (state.storeDisabled) throw Object.assign(new Error('Disabled test account.'), { code:'USER_DISABLED' });
  return { id:identity.id || id, email:identity.email,
    name:identity.name || 'Test Doctor', role:identity.authorizedRole === 'doctor' ? 'user' : 'editor', sub:identity.sub || '' };
};
require('../lib/google-id-token.js').verifyGoogleIdToken = async () => ({ sub:'google-test', email, name:'Test Doctor' });
const handler = require('../api/auth.js');

async function modules() {
  return { auth:await import(pathToFileURL(path.join(ROOT, 'lib/auth.mjs')).href),
    Device:await import(pathToFileURL(path.join(ROOT, 'lib/device-session.mjs')).href) };
}

async function call(method = 'GET', body, cookie = '', query = '') {
  const { auth } = await modules();
  const headers = { host:'drx.test', origin:'https://drx.test', cookie,
    'content-type':'application/json', 'x-csrf-token':auth.csrfFromRequest({ headers:{ cookie } }) };
  const req = { method, headers, body, url:`/api/auth${query}` };
  const res = { headers:{}, statusCode:200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value = '') { this.body = value; return this; } };
  await handler(req, res);
  return res;
}

function applyCookies(cookie, response) {
  const map = new Map(String(cookie || '').split(';').filter(Boolean).map(part => {
    const i = part.trim().indexOf('='); return [part.trim().slice(0, i), part.trim().slice(i + 1)];
  }));
  const entries = response.headers['set-cookie'];
  for (const entry of Array.isArray(entries) ? entries : entries ? [entries] : []) {
    const pair = entry.split(';')[0]; const i = pair.indexOf('=');
    if (entry.includes('Max-Age=0;')) map.delete(pair.slice(0, i));
    else map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...map].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function middleware() {
  let source = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf8');
  source = source.replace("import { next } from '@vercel/functions';", "const next = () => new Response('', { headers:{ 'x-test-next':'1' } });");
  source = source.replace("'./lib/auth-edge.mjs'", JSON.stringify(pathToFileURL(path.join(ROOT, 'lib/auth-edge.mjs')).href));
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
}

module.exports = { ROOT, state, id, email, handler, modules, call, applyCookies, middleware };
