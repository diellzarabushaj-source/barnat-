'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827141454_p1_official_long_tail_batch_four.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827141454' &&
    item.name === 'p1_official_long_tail_batch_four'
  ),
  'P1.11 migration must be present in the production migration manifest.'
);

for (const concept of [
  'benserazidehydrochloride',
  'linagliptin',
  'dextran70',
  'ferrousfumarate',
  'calciumpantothenate',
]) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}

assert.match(
  MIGRATION,
  /select public\.medindex_refresh_product_ingredients_v1\(\)/i,
  'P1.11 must rebuild ingredient identities after verified promotions.'
);
assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.11 official long-tail batch four contract passed.');
