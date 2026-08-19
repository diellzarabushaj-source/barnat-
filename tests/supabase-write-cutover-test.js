'use strict';

const assert = require('node:assert/strict');

function freshDataApi(provider) {
  const modulePath = require.resolve('../lib/neon-data-api.js');
  delete require.cache[modulePath];
  if (provider === undefined) delete process.env.MEDINDEX_WRITE_PROVIDER;
  else process.env.MEDINDEX_WRITE_PROVIDER = provider;
  return require(modulePath);
}

const originalProvider = process.env.MEDINDEX_WRITE_PROVIDER;

try {
  for (const provider of [undefined, 'auto', 'neon', 'supabase']) {
    const api = freshDataApi(provider);
    assert.equal(api.readProvider(), 'supabase');
    assert.equal(api.writeProvider(), 'supabase');
    assert.match(api.DATA_API_BASE, /\.supabase\.co\/rest\/v1$/);
    assert.equal(api.DATA_API_BASE, api.SUPABASE_DATA_API_BASE);
    assert.equal(api.configuredToken(), '');
    assert.equal(api._test.shouldUseSupabaseServer('user_favorites?select=id', { method:'GET' }), true);
    assert.equal(api._test.shouldUseSupabaseServer('drugs?id=eq.1', { method:'PATCH' }), true);
    assert.equal(api._test.shouldUseSupabaseRead('drugs?select=id&limit=1', { method:'GET' }), true);
  }

  console.log('Supabase-only runtime test passed: Neon provider flags cannot re-enable database traffic.');
} finally {
  if (originalProvider === undefined) delete process.env.MEDINDEX_WRITE_PROVIDER;
  else process.env.MEDINDEX_WRITE_PROVIDER = originalProvider;
  delete require.cache[require.resolve('../lib/neon-data-api.js')];
}
