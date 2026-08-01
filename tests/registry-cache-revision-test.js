const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const dataApiPath = require.resolve(path.join(ROOT, 'lib/neon-data-api.js'));
const revisionPath = require.resolve(path.join(ROOT, 'lib/registry-revision.js'));

let calls = 0;
let revisionValue = '2026-08-01T20:00:00.000Z';
require.cache[dataApiPath] = {
  id:dataApiPath,
  filename:dataApiPath,
  loaded:true,
  exports:{
    neonRequest:async requestPath => {
      calls += 1;
      assert.match(requestPath, /^drugs\?select=updated_at/);
      assert.match(requestPath, /is_published=eq\.true/);
      assert.match(requestPath, /editorial_status=eq\.published/);
      assert.match(requestPath, /updated_at\.desc/);
      assert.match(requestPath, /limit=1/);
      return { data:[{ updated_at:revisionValue }] };
    },
  },
};
delete require.cache[revisionPath];
const RegistryRevision = require(revisionPath);

(async () => {
  const first = await RegistryRevision.getRegistryRevision();
  const cached = await RegistryRevision.getRegistryRevision();
  assert.equal(first, revisionValue);
  assert.equal(cached, revisionValue);
  assert.equal(calls, 1, 'Revision checks must be cached briefly instead of querying Neon on every request');

  revisionValue = '2026-08-01T20:05:00.000Z';
  const forced = await RegistryRevision.getRegistryRevision({ force:true });
  assert.equal(forced, revisionValue);
  assert.equal(calls, 2, 'A forced revision check must detect the latest Neon update');

  RegistryRevision.resetRegistryRevisionCache();
  await RegistryRevision.getRegistryRevision();
  assert.equal(calls, 3, 'Resetting the revision cache must permit a fresh Neon check');

  const revisionSource = read('lib/registry-revision.js');
  const registrySource = read('api/registry.js');
  assert.match(revisionSource, /REVISION_CACHE_MS = 15 \* 1000/, 'The revision check needs a short bounded cache');
  assert.match(revisionSource, /QUERY_TIMEOUT_MS = 4000/, 'The revision query needs a strict timeout');
  assert.match(revisionSource, /return cachedRevision \|\| 'unversioned'/, 'A temporary revision failure must retain a stable fallback key');
  assert.doesNotMatch(revisionSource, /CREATE TABLE|data_versions|registry_revision/i, 'Revision tracking must not require a new database migration');

  assert.match(registrySource, /MEMORY_CACHE_MS = 6 \* 60 \* 60 \* 1000/, 'The existing long-lived dataset cache must remain for performance');
  assert.match(registrySource, /RegistryRevision\.getRegistryRevision\(\)/, 'The registry cache key must consult the latest Neon drug revision');
  assert.match(registrySource, /key:`\$\{mode\}:\$\{revision\}`/, 'The data-source mode and revision must form the cache identity');
  assert.match(registrySource, /datasetCacheKey === key/, 'A cached dataset may be reused only for the same revision');
  assert.match(registrySource, /dataset\.meta\.registryRevision = identity\.revision/, 'Registry metadata must expose the revision used to build the dataset');
  assert.match(registrySource, /payloadCacheKey === key/, 'The compressed payload cache must also be revision-aware');
  assert.match(registrySource, /X-MedIndex-Registry-Revision/, 'Responses must expose the active revision for diagnostics');
  assert.match(registrySource, /if \(datasetCache\)/, 'A failed rebuild must retain the last safe stale dataset');

  execFileSync(process.execPath, ['--check', path.join(ROOT, 'lib/registry-revision.js')], { stdio:'pipe' });
  execFileSync(process.execPath, ['--check', path.join(ROOT, 'api/registry.js')], { stdio:'pipe' });

  console.log('Neon-backed registry cache revision tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});