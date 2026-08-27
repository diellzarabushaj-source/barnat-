'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827135130_p1_official_components_and_amino_acids.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827135130' &&
    item.name === 'p1_official_components_and_amino_acids'
  ),
  'P1.6 migration must be present in the production migration manifest.'
);

for (const concept of [
  'calciumcarbonate',
  'chlorhexidinegluconate',
  'articainehydrochloride',
  'dorzolamidehydrochloride',
  'drospirenone',
  'riboflavin',
  'salicylicacid',
  'valine',
  'histidine',
  'isoleucine',
  'leucine',
  'phenylalanine',
  'threonine',
  'methionine',
  'tryptophan',
  'alanine',
  'glycine',
  'arginine',
  'proline',
  'glutamicacid',
  'serine',
  'asparticacid',
  'tyrosine',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Official concept missing: ${concept}`);
}

assert.ok(
  MIGRATION.includes("('chlorhexidinegluconate','chlorhexidinedihydrochloride'") ||
  MIGRATION.includes("('chlorhexidinedihydrochloride','chlorhexidinegluconate'"),
  'Different chlorhexidine salts must remain in rejection memory.'
);

assert.ok(
  MIGRATION.includes("('salmeterol','salmeterolxinafoate'") ||
  MIGRATION.includes("('salmeterolxinafoate','salmeterol'"),
  'Salmeterol base and xinafoate must not auto-merge.'
);

assert.match(
  MIGRATION,
  /select public\.medindex_refresh_product_ingredients_v1\(\)/i,
  'P1.6 must refresh ingredient identities after concept promotion.'
);
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.6 official components + amino acids contract passed.');
