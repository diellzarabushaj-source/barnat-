'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827140805_p1_verified_synonyms_and_precise_forms.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827140805' &&
    item.name === 'p1_verified_synonyms_and_precise_forms'
  ),
  'P1.9 migration must be present in the production migration manifest.'
);

for (const concept of [
  'nicotinamide',
  'sodiumlactate',
  'lysinehydrochloride',
  'betamethasonesodiumphosphate',
  'codeinephosphatehemihydrate',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}

assert.ok(
  MIGRATION.includes("('niacinamide','nicotinamide'"),
  'Niacinamide must resolve to nicotinamide.'
);
assert.ok(
  MIGRATION.includes("('codeinphosphatehemihydrate','codeinephosphatehemihydrate'"),
  'Codein spelling variant must resolve to codeine phosphate hemihydrate.'
);
assert.ok(
  MIGRATION.includes("('betamethasonesodiumphosphate','dexamethasonesodiumphosphate'") ||
  MIGRATION.includes("('dexamethasonesodiumphosphate','betamethasonesodiumphosphate'"),
  'Different corticosteroids must remain in rejection memory.'
);
assert.ok(
  MIGRATION.includes("('codeinephosphatehemihydrate','codeinephosphate'") ||
  MIGRATION.includes("('codeinephosphate','codeinephosphatehemihydrate'"),
  'Explicit hemihydrate must not auto-collapse to unspecified phosphate.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.9 verified synonyms + precise forms contract passed.');
