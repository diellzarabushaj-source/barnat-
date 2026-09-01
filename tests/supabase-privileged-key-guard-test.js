'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MedIndex = require('../lib/medindex-data-api.js');
const Supabase = require('../lib/supabase-data-api.js');

const publishable = 'sb_publishable_example';
const secret = 'sb_secret_example';
const legacyServiceRoleJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature_123';

for (const [name, api] of [['medindex-data-api', MedIndex], ['supabase-data-api', Supabase]]) {
  const guard = api._test?.isPrivilegedSupabaseKey;
  assert.equal(typeof guard, 'function', `${name}: privileged-key guard is missing`);
  assert.equal(guard(''), false);
  assert.equal(guard(publishable), false, `${name}: publishable keys must never authorize privileged requests`);
  assert.equal(guard(secret), true, `${name}: sb_secret_ keys must be accepted`);
  assert.equal(guard(legacyServiceRoleJwt), true, `${name}: legacy service_role JWTs must remain supported`);
  assert.equal(guard('not-a-secret'), false, `${name}: arbitrary strings must not be treated as server secrets`);
}

for (const file of ['lib/medindex-data-api.js','lib/supabase-data-api.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(source, /SUPABASE_PRIVILEGED_KEY_INVALID/);
  assert.match(source, /never the publishable key/);
}

console.log('Supabase privileged-key guard passed: publishable credentials fail closed before server-only RPCs.');
