'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827144343_p1_explicit_expression_normalization.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827144343' &&
    item.name === 'p1_explicit_expression_normalization'
  ),
  'P1.17 migration must be present in production migration history.'
);

for (const alias of [
  ['atorvastatinasatorvastatincalciumtrihydrate','atorvastatincalciumtrihydrate'],
  ['potassiumclavulanatediluted','clavulanatepotassium'],
  ['amlodipineinformofamlodipinebesilate','amlodipinebesilate'],
  ['atorvastatininformofatorvastatincalciumtrihydrate','atorvastatincalciumtrihydrate'],
  ['mixtureofpotassiumclavulanate','clavulanatepotassium'],
  ['potassiumclavulanatewithsyloid11','clavulanatepotassium'],
  ['clavulanicacidaspotassiumclavulanate','clavulanatepotassium'],
]) {
  assert.ok(
    MIGRATION.includes(`('${alias[0]}','${alias[1]}'`),
    `Explicit normalization missing: ${alias[0]} -> ${alias[1]}`
  );
}

assert.match(MIGRATION, /basis_of_strength_expression/i);
assert.match(MIGRATION, /formulation_descriptor_normalization/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.17 explicit expression normalization contract passed.');
