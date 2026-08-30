'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const normalize = source => source
  .replace(/\n\/\/ Canonical Supabase maintenance script\. Legacy Neon-named file is retained for compatibility\.\n\n/, '\n')
  .trim();

const registryLegacy = read('scripts/sync-neon-from-sheets.js');
const registryCanonical = read('scripts/sync-supabase-from-sheets.js');

assert.match(registryLegacy, /require\(['"]\.\/sync-supabase-from-sheets\.js['"]\)/);
assert.doesNotMatch(registryLegacy, /neon-data-api/);
assert.match(registryCanonical, /medindex-data-api/);
assert.match(registryCanonical, /archiveRegistrySource/);
assert.match(registryCanonical, /drx_registry_begin_import_v1/);
assert.match(registryCanonical, /drx_registry_apply_corrections_v1/);

const pairs = [
  ['scripts/sync-neon-structured-dosage.js', 'scripts/sync-supabase-structured-dosage.js'],
  ['scripts/publish-neon-registry.js', 'scripts/publish-supabase-registry.js'],
  ['scripts/sync-icd-hierarchy-to-neon.js', 'scripts/sync-icd-hierarchy-to-supabase.js'],
];

for (const [legacy, canonical] of pairs) {
  assert.equal(
    normalize(read(canonical)),
    normalize(read(legacy)),
    canonical + ' must stay behaviorally identical to its compatibility source until legacy retirement.'
  );
  assert.doesNotMatch(read(canonical), /neon-data-api/);
  assert.match(read(canonical), /medindex-data-api/);
}

const pkg = JSON.parse(read('package.json'));
assert.equal(
  pkg.scripts['sync:supabase'],
  'node scripts/sync-supabase-from-sheets.js && node scripts/sync-supabase-structured-dosage.js && node scripts/publish-supabase-registry.js'
);
assert.doesNotMatch(pkg.scripts['sync:supabase'], /neon/i);

console.log('Phase 7 Supabase maintenance script parity contract passed.');
