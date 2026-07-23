const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  delete process.env.ACCESS_CODE;
  delete process.env.ACCESS_CODE_SCRYPT;
  process.env.SESSION_SECRET = 'medindex-default-auth-test-secret-that-is-private';
  const auth = await import(`${pathToFileURL(path.resolve(__dirname, '../lib/auth.mjs')).href}?default=${Date.now()}`);
  assert.equal(auth.verifyAccessCode(['diellza', '123'].join('')), true, 'Default password verifier failed');
  assert.equal(auth.verifyAccessCode('diellza124'), false, 'Default password accepted an incorrect value');
  assert.equal(auth.secureConfigurationEnabled(), true, 'Private session secret was not detected');
  const token = auth.createSessionToken();
  assert.equal(auth.verifySessionToken(token), true, 'Default auth session token failed');
  console.log('Default scrypt authentication passed.');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
