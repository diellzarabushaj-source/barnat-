'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827144718_p1_deterministic_alias_cleanup.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827144718' &&
    item.name === 'p1_deterministic_alias_cleanup'
  ),
  'P1.18 migration must be present in the production migration manifest.'
);

for (const alias of [
  ['tazobactamassodiumsalt','tazobactamsodium'],
  ['24dichlorbenzylumalcoholum','24dichlorobenzylalcohol'],
  ['amilmetacresolum','amylmetacresol'],
  ['amoxicillinasamoxicillintrihydrate','amoxicillintrihydrate'],
  ['amoxycillinetrihydrate','amoxicillintrihydrate'],
  ['ascorbicacidvitaminc','ascorbicacid'],
]) {
  assert.ok(MIGRATION.includes(`('${alias[0]}','${alias[1]}'`), `Deterministic alias missing: ${alias[0]} -> ${alias[1]}`);
}

assert.match(MIGRATION, /select public\.medindex_refresh_product_ingredients_v1\(\)/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.18 deterministic alias cleanup contract passed.');
