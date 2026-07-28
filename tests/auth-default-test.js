const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_SCRYPT;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY1;
  process.env.SESSION_SECRET = 'medindex-default-auth-test-secret-that-is-private';

  const baseUrl = pathToFileURL(path.resolve(__dirname, '../lib/auth.mjs')).href;
  const unconfigured = await import(`${baseUrl}?unconfigured=${Date.now()}`);
  assert.equal(unconfigured.accessConfigurationEnabled(), false, 'Missing access configuration must fail closed');
  assert.equal(unconfigured.sessionConfigurationEnabled(), true, 'Dedicated session secret was not detected');
  assert.equal(unconfigured.secureConfigurationEnabled(), false, 'Auth must not be hardened without an access verifier');
  assert.equal(unconfigured.verifyAccessCode(['diellza', '123'].join('')), false, 'Legacy default password must not be accepted');

  process.env.ACCESS_CODE = 'medindex-test-password-2026';
  const configured = await import(`${baseUrl}?configured=${Date.now()}`);
  assert.equal(configured.accessConfigurationEnabled(), true, 'Configured access code was not detected');
  assert.equal(configured.secureConfigurationEnabled(), true, 'Dedicated auth configuration was not recognized');
  assert.equal(configured.verifyAccessCode('medindex-test-password-2026'), true, 'Configured password verifier failed');
  assert.equal(configured.verifyAccessCode('wrong-password'), false, 'Configured verifier accepted an incorrect value');
  const token = configured.createSessionToken();
  assert.equal(configured.verifySessionToken(token), true, 'Configured auth session token failed');

  process.env.ACCESS_CODE_SCRYPT = `scrypt:16384:8:1:${'ab'.repeat(16)}:${'cd'.repeat(32)}`;
  const conflicting = await import(`${baseUrl}?conflicting=${Date.now()}`);
  assert.equal(conflicting.accessConfigurationEnabled(), false, 'Conflicting access verifiers must fail closed');
  assert.equal(conflicting.secureConfigurationEnabled(), false, 'Conflicting access verifiers must never report hardened auth');
  assert.equal(conflicting.verifyAccessCode('medindex-test-password-2026'), false, 'Plain access code remained active during a verifier conflict');

  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_SCRYPT;
  delete process.env.SESSION_SECRET;
  process.env.GEMINI_API_KEY = 'g'.repeat(40);
  const noSecretReuse = await import(`${baseUrl}?no-secret-reuse=${Date.now()}`);
  assert.equal(noSecretReuse.sessionConfigurationEnabled(), false, 'Gemini API keys must never be reused as session secrets');

  const authSource = fs.readFileSync(path.resolve(__dirname, '../api/auth.js'), 'utf8');
  assert.match(authSource, /AUTH_NOT_CONFIGURED/, 'auth endpoint must expose a configuration failure code');
  assert.match(authSource, /status\(415\)/, 'auth endpoint must reject non-JSON bodies');
  assert.match(authSource, /status\(413\)/, 'auth endpoint must reject oversized bodies');
  assert.match(authSource, /RateLimit-Limit/, 'auth endpoint must publish rate-limit metadata');
  assert.match(authSource, /accessConfigurationEnabled\(\)/, 'auth endpoint must verify the access configuration before passwords');
  assert.match(fs.readFileSync(path.resolve(__dirname, '../.env.example'), 'utf8'), /SESSION_SECRET[\s\S]*ACCESS_CODE/, 'required auth environment variables must be documented');

  console.log('Fail-closed authentication configuration passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
