'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827141828_p1_verified_typo_and_precise_salt_batch.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827141828' &&
    item.name === 'p1_verified_typo_and_precise_salt_batch'
  ),
  'P1.12 migration must be present in the production migration manifest.'
);

for (const concept of [
  'ibuprofenlysine',
  'oxytetracyclinehydrochloride',
  'riboflavinsodiumphosphate',
  'chlorthalidone',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}

assert.ok(
  MIGRATION.includes("('chlorthalidon','chlorthalidone'"),
  'Chlorthalidon typo must resolve to chlorthalidone.'
);
assert.ok(
  MIGRATION.includes("('buprofen','ibuprofen'"),
  'Buprofen typo must resolve to ibuprofen.'
);
assert.ok(
  MIGRATION.includes("('ibuprofen','ibuprofenlysine'") ||
  MIGRATION.includes("('ibuprofenlysine','ibuprofen'"),
  'Ibuprofen free acid and lysine salt must remain distinct.'
);
assert.ok(
  MIGRATION.includes("('oxytetracyclinehydrochloride','tetracyclinehydrochloride'") ||
  MIGRATION.includes("('tetracyclinehydrochloride','oxytetracyclinehydrochloride'"),
  'Oxytetracycline and tetracycline must never auto-merge.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.12 verified typo + precise salt contract passed.');
