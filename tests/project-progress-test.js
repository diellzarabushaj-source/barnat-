'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Progress = require('../lib/project-progress.js');
const Admin = require('../lib/admin-access.js');
const handler = require('../api/project-progress.js');

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const repository = 'diellzarabushaj-source/barnat-';

function fakeFetch(url) {
  const parsed = new URL(url);
  const ok = body => ({ok:true, json:async () => body});
  if (parsed.pathname === `/repos/${repository}/commits/main`) return Promise.resolve(ok({
    sha:SHA, html_url:`https://github.com/${repository}/commit/${SHA}`,
    commit:{message:'Feature released\nDetails', committer:{date:'2026-11-11T10:00:00Z'}},
  }));
  if (parsed.pathname === `/repos/${repository}/commits/${SHA}/check-runs`) return Promise.resolve(ok({
    total_count:2, check_runs:[{status:'completed', conclusion:'success', name:'unit'}, {status:'in_progress', name:'e2e'}],
  }));
  if (parsed.pathname === '/search/issues') return Promise.resolve(ok({total_count:2, items:[
    {number:1, title:'Complete auth', state:'closed', html_url:`https://github.com/${repository}/issues/1`},
    {number:2, title:'Audit doses', state:'open', html_url:`https://github.com/${repository}/issues/2`, labels:[{name:'clinical'}]},
  ]}));
  if (parsed.pathname === `/repos/${repository}/commits`) return Promise.resolve(ok([{
    sha:SHA, commit:{message:'Feature released', committer:{date:'2026-11-11T10:00:00Z'}},
    html_url:`https://github.com/${repository}/commit/${SHA}`,
  }]));
  throw new Error(`Unexpected call ${url}`);
}

test('snapshot reports live GitHub facts without claiming clinical completion', async () => {
  const state = await Progress.buildProjectSnapshot({fetchImpl:fakeFetch, env:{VERCEL_GIT_COMMIT_SHA:SHA}, now:Date.parse('2026-11-11T10:02:00Z')});
  assert.equal(state.main.sha, SHA);
  assert.equal(state.deployment.state, 'synced');
  assert.equal(state.checks.state, 'running');
  assert.equal(state.checks.passed, 1);
  assert.equal(state.issues.percent, 50);
  assert.equal(state.issues.items.length, 1);
  assert.equal(state.refreshAfterMs, 300_000);
  assert.equal(state.sources.issues, 'live');
  assert.match(state.limitations.join(' '), /klinik/);
});

test('unknown deployment and partial issues remain explicitly unknown', async () => {
  const state = await Progress.buildProjectSnapshot({fetchImpl:async url => {
    if (new URL(url).pathname === '/search/issues') return {ok:true, json:async () => ({total_count:150, items:[]})};
    return fakeFetch(url);
  }, env:{VERCEL_GIT_COMMIT_SHA:''}});
  assert.equal(state.deployment.state, 'unknown');
  assert.equal(state.issues.exact, false);
  assert.equal(state.issues.percent, null);
  assert.equal(state.issues.closed, null);
});

test('failed GitHub endpoint does not create invented green checks', async () => {
  const state = await Progress.buildProjectSnapshot({fetchImpl:async url => {
    if (String(url).includes('/check-runs?')) return {ok:false, status:403};
    return fakeFetch(url);
  }, env:{VERCEL_GIT_COMMIT_SHA:OTHER}});
  assert.equal(state.deployment.state, 'different');
  assert.equal(state.checks, null);
  assert.match(state.sources.checks, /403/);
});

function responseStub() {
  return {
    statusCode:200, headers:{}, payload:null,
    setHeader(key,value){this.headers[key] = value;},
    status(code){this.statusCode = code; return this;},
    json(payload){this.payload = payload; return this;},
  };
}

test('project progress API is fail-closed for non-admin users', async () => {
  const original = Admin.requireAdminSession;
  Admin.requireAdminSession = async () => {throw Object.assign(new Error('Unauthorized'), {status:403});};
  try {
    const response = responseStub();
    await handler({method:'GET'}, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.ok, false);
    assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
  } finally {Admin.requireAdminSession = original;}
});

test('admin page links to the protected progress view and its client script', () => {
  const root = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'project-progress.html'), 'utf8');
  assert.match(admin, /href="\/project-progress\.html"/);
  assert.match(page, /project-progress\.js/);
  assert.match(page, /noindex,nofollow/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'project-progress.js'),'utf8'), /GITHUB_TOKEN|Authorization:Bearer/);
});
