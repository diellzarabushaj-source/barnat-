'use strict';

const assert = require('node:assert/strict');

function freshDataApi(writeProvider, secret = '') {
  const modulePath = require.resolve('../lib/neon-data-api.js');
  delete require.cache[modulePath];
  if (writeProvider === undefined) delete process.env.MEDINDEX_WRITE_PROVIDER;
  else process.env.MEDINDEX_WRITE_PROVIDER = writeProvider;
  if (secret) process.env.SUPABASE_SECRET_KEY = secret;
  else delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.MEDINDEX_SUPABASE_SECRET_KEY;
  delete process.env.MEDINDEX_SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return require(modulePath);
}

const originalProvider = process.env.MEDINDEX_WRITE_PROVIDER;
const originalSecret = process.env.SUPABASE_SECRET_KEY;

try {
  let api = freshDataApi(undefined, 'sb_secret_test_only');
  assert.equal(api.writeProvider(), 'neon', 'A secret alone must never cut writes over to Supabase.');
  assert.equal(api._test.shouldUseSupabaseServer('user_favorites?select=id', { method:'GET' }), false);
  assert.equal(api._test.shouldUseSupabaseServer('drugs?id=eq.1', { method:'PATCH' }), false);

  api = freshDataApi('auto', 'sb_secret_test_only');
  assert.equal(api.writeProvider(), 'neon', 'Legacy auto must remain fail-safe and resolve to Neon.');

  api = freshDataApi('supabase', 'sb_secret_test_only');
  assert.equal(api.writeProvider(), 'supabase');
  assert.equal(api._test.shouldUseSupabaseServer('user_favorites?select=id', { method:'GET' }), true);
  assert.equal(api._test.shouldUseSupabaseServer('drugs?id=eq.1', { method:'PATCH' }), true);

  api = freshDataApi('neon', 'sb_secret_test_only');
  assert.equal(api.writeProvider(), 'neon');
  assert.equal(api._test.shouldUseSupabaseServer('user_favorites?select=id', { method:'GET' }), false);

  console.log('Supabase write cutover safety test passed: explicit opt-in required.');
} finally {
  if (originalProvider === undefined) delete process.env.MEDINDEX_WRITE_PROVIDER;
  else process.env.MEDINDEX_WRITE_PROVIDER = originalProvider;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
  delete require.cache[require.resolve('../lib/neon-data-api.js')];
}
