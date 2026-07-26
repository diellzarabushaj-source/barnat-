const assert = require('node:assert/strict');
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

  delete process.env.ACCESS_CODE;
  delete process.env.SESSION_SECRET;
  process.env.GEMINI_API_KEY = 'g'.repeat(40);
  const noSecretReuse = await import(`${baseUrl}?no-secret-reuse=${Date.now()}`);
  assert.equal(noSecretReuse.sessionConfigurationEnabled(), false, 'Gemini API keys must never be reused as session secrets');

  console.log('Fail-closed authentication configuration passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
