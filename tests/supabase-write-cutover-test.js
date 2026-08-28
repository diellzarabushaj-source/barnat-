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

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const clinicalReaderSource = fs.readFileSync(path.join(ROOT, 'lib/neon-clinical-reader.js'), 'utf8');
const registrySource = fs.readFileSync(path.join(ROOT, 'api/registry.js'), 'utf8');

assert.equal(vercel.env?.MEDINDEX_DATA_SOURCE, 'supabase', 'Vercel production must select Supabase explicitly.');
assert.equal(vercel.env?.PRESCRIPTION_SHEET_ID, undefined, 'Production must not pin the legacy prescription Sheet.');
assert.equal(vercel.env?.PRESCRIPTION_SHEET_GID, undefined, 'Production must not pin the legacy prescription Sheet gid.');
assert.equal(vercel.env?.DOSAGE_SHEET_ID, undefined, 'Production must not pin the legacy dosage Sheet.');
assert.match(clinicalReaderSource, /MEDINDEX_DATA_SOURCE \|\| 'supabase'/, 'Supabase must be the default runtime source.');
assert.match(clinicalReaderSource, /value === 'supabase' \|\| value === 'neon'\) return 'supabase'/, 'Legacy Neon mode must alias to Supabase.');
assert.match(registrySource, /finishDataset\(sourceRows, enriched, startedAt, 'supabase'/, 'Registry metadata must report the real database provider.');


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
