'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827131825_p1_component_aliases_and_refresh.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827131825' &&
    item.name === 'p1_component_aliases_and_refresh'
  ),
  'P1.2 production migration must be in the migration manifest.'
);

assert.match(MIGRATION, /create or replace function public\.medindex_refresh_product_ingredients_v1\(\)/i);
assert.match(
  MIGRATION,
  /security definer[\s\S]*?set search_path = pg_catalog, public/i,
  'Ingredient refresh must be security-definer with pinned search_path.'
);
assert.match(
  MIGRATION,
  /revoke all on function public\.medindex_refresh_product_ingredients_v1\(\) from public, anon, authenticated/i,
  'Client roles must not execute the refresh function.'
);
assert.match(
  MIGRATION,
  /grant execute on function public\.medindex_refresh_product_ingredients_v1\(\) to service_role/i,
  'Only service_role should receive refresh execution.'
);

for (const unsafe of [
  ['pseudoephedrinehydrochloride','ephedrinehydrochloride'],
  ['formoterolfumaratedehydrous','formoterolfumaratedihydrate'],
  ['isoconazolenitrate','econazolenitrate'],
  ['betamethasonesodiumphosphate','dexamethasonesodiumphosphate'],
  ['amoxicillinsodium','ampicillinsodium'],
  ['fludrocortisoneacetate','hydrocortisoneacetate'],
  ['sitagliptinhcl','sitagliptin'],
  ['lercanidipine','lercanidipinehcl'],
]) {
  assert.ok(
    MIGRATION.includes(`('${unsafe[0]}','${unsafe[1]}'`) ||
    MIGRATION.includes(`('${unsafe[1]}','${unsafe[0]}'`),
    `Safety rejection must persist for ${unsafe[0]} vs ${unsafe[1]}`
  );
}

assert.match(MIGRATION, /'chlorpheniraminemaleate','chlorphenaminemaleate'/i);
assert.match(MIGRATION, /'simethicone','simeticone'/i);
assert.match(MIGRATION, /'paracentamol','paracetamol'/i);
assert.match(MIGRATION, /'empaglifozin','empagliflozin'/i);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.2 component alias + refresh contract passed.');
