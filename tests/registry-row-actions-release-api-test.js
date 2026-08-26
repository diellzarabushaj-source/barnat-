'use strict';

const assert = require('node:assert/strict');

const handler = require('../api/clinical-editor.js');

function responseHarness() {
  const headers = {};
  let body = '';
  return {
    statusCode:200,
    headers,
    get body() { return body; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    end(value = '') { body += value ? String(value) : ''; return this; },
    json(value) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      body += JSON.stringify(value);
      return this;
    },
  };
}

async function call({ method='GET', kind='manifest' } = {}) {
  const req = {
    method,
    query:{ rowActionsRelease:kind },
    url:`/api/clinical-editor?rowActionsRelease=${encodeURIComponent(kind)}`,
  };
  const res = responseHarness();
  await handler(req, res);
  return res;
}

(async () => {
  const manifest = await call({ kind:'manifest' });
  assert.equal(manifest.statusCode, 200);
  assert.equal(manifest.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(manifest.headers['cache-control'], 'public, max-age=0, must-revalidate');
  assert.equal(manifest.headers['x-content-type-options'], 'nosniff');
  const manifestJson = JSON.parse(manifest.body);
  assert.equal(manifestJson.schema, 'medindex.registry.row-actions.release.v1');
  assert.equal(manifestJson.release, 'registry-row-actions-menu-phase7-v1');
  assert.equal(manifestJson.runtime?.personalizationVersion, 'registry-user-personalization-v3.3.0');

  const evidence = await call({ kind:'evidence' });
  assert.equal(evidence.statusCode, 200);
  const evidenceJson = JSON.parse(evidence.body);
  assert.equal(evidenceJson.schema, 'medindex.registry.row-actions.build-evidence.v1');
  assert.equal(evidenceJson.phase, 'registry-row-actions-menu-phase9-v1');
  assert.equal(evidenceJson.sourceRevision, manifestJson.sourceRevision);

  const head = await call({ method:'HEAD', kind:'manifest' });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);

  const missing = await call({ kind:'unknown' });
  assert.equal(missing.statusCode, 404);

  const method = await call({ method:'POST', kind:'manifest' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET, HEAD');

  console.log('✓ Row-actions release API passed: existing clinical-editor function serves only validated manifest/evidence JSON through GET/HEAD, preserves no-cache attestation semantics, and consumes no additional Hobby function slot.');
})().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
