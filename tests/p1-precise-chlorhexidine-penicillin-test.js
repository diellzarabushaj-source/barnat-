'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827142650_p1_precise_chlorhexidine_and_penicillin.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827142650' &&
    item.name === 'p1_precise_chlorhexidine_and_penicillin'
  ),
  'P1.15 migration must be present in the production migration manifest.'
);

for (const concept of [
  'chlorhexidinedihydrochloride',
  'penicillingprocaine',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}

assert.ok(
  MIGRATION.includes("('chlorhexidinedihydrochloride','chlorhexidinegluconate'") ||
  MIGRATION.includes("('chlorhexidinegluconate','chlorhexidinedihydrochloride'"),
  'Different chlorhexidine salts must remain distinct.'
);
assert.ok(
  MIGRATION.includes("('penicillingprocaine','penicillingbenzathine'") ||
  MIGRATION.includes("('penicillingbenzathine','penicillingprocaine'"),
  'Different depot penicillin salts must remain distinct.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.15 precise chlorhexidine + penicillin contract passed.');
