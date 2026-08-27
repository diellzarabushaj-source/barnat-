'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827140113_p1_long_tail_verified_components.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827140113' &&
    item.name === 'p1_long_tail_verified_components'
  ),
  'P1.8 migration must be present in the production migration manifest.'
);

for (const concept of [
  'imipenem',
  'cilastatinsodium',
  'avibactamsodium',
  'polymyxinbsulfate',
  'pyridoxinehydrochloride',
  'piroxicam',
  '24dichlorobenzylalcohol',
  'amylmetacresol',
  'enoxolone',
  'salmeterolxinafoate',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}

for (const alias of [
  ['pyridoxinehcl','pyridoxinehydrochloride'],
  ['salmeterolxinafoatemicronized','salmeterolxinafoate'],
  ['riboflavine','riboflavin'],
  ['salycilicacid','salicylicacid'],
  ['isoleucin','isoleucine'],
  ['piperacillinassodiumsalt','piperacillinsodium'],
]) {
  assert.ok(MIGRATION.includes(`('${alias[0]}','${alias[1]}'`), `Verified alias missing: ${alias[0]} -> ${alias[1]}`);
}

assert.match(
  MIGRATION,
  /select public\.medindex_refresh_product_ingredients_v1\(\)/i,
  'P1.8 must rebuild ingredient identities after verified promotions.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.8 long-tail verified component contract passed.');
