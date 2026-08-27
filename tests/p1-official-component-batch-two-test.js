'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827133920_p1_official_component_batch_two.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827133920' &&
    item.name === 'p1_official_component_batch_two'
  ),
  'P1.5 migration must be present in the production migration manifest.'
);

for (const concept of [
  'caffeine',
  'calciumchloridedihydrate',
  'carbidopa',
  'levodopa',
  'phenylephrinehydrochloride',
  'sacubitril',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Official concept missing: ${concept}`);
}

assert.ok(
  MIGRATION.includes("('phenylephrinehcl','phenylephrinehydrochloride'"),
  'Phenylephrine HCl must resolve to phenylephrine hydrochloride.'
);

assert.match(
  MIGRATION,
  /select public\.medindex_refresh_product_ingredients_v1\(\)/i,
  'P1.5 must rebuild ingredient identity after inserting concepts.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.5 official component batch two contract passed.');
