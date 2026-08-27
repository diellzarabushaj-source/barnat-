'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827133439_p1_official_component_promotions.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827133439' &&
    item.name === 'p1_official_component_promotions'
  ),
  'P1.4 production migration must be in the migration manifest.'
);

assert.match(
  MIGRATION,
  /select canonical_key from public\.substance_concepts_v1/i,
  'substance_canonical must include official/synthetic concept roots.'
);
assert.match(
  MIGRATION,
  /with \(security_invoker = true\)/i,
  'substance_canonical must remain security-invoker.'
);

for (const concept of [
  'clavulanicacid',
  'neomycinsulfate',
  'thiaminehydrochloride',
  'benzocaine',
  'pseudoephedrinehydrochloride',
  'sulfamethoxazole',
  'trimethoprim',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Official concept missing: ${concept}`);
}

for (const alias of [
  ['neomycinsulphate','neomycinsulfate'],
  ['pseudoephedrinehcl','pseudoephedrinehydrochloride'],
  ['potassiumclavulanate','clavulanatepotassium'],
]) {
  assert.ok(
    MIGRATION.includes(`('${alias[0]}','${alias[1]}'`),
    `Expected safe alias missing: ${alias[0]} -> ${alias[1]}`
  );
}

assert.ok(
  MIGRATION.includes("('clavulanicacid','clavulanatepotassium'") ||
  MIGRATION.includes("('clavulanatepotassium','clavulanicacid'"),
  'Base acid vs potassium salt must stay in rejection memory.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.4 official component promotion contract passed.');
