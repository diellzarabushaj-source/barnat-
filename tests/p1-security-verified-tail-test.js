'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', '20260827143750_p1_security_and_verified_tail.sql'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8'));

assert.ok(
  manifest.migrations.some(item =>
    String(item.version) === '20260827143750' &&
    item.name === 'p1_security_and_verified_tail'
  ),
  'P1.16 migration must be present in production migration history.'
);

assert.match(MIGRATION, /create policy substance_merge_candidates_deny_client/i);
assert.match(MIGRATION, /to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/i);
assert.match(MIGRATION, /revoke all on public\.substance_merge_candidates from anon, authenticated/i);

for (const concept of ['velpatasvir','tobramycinsulfate','zincacetatedihydrate']) {
  assert.ok(MIGRATION.includes(`'${concept}'`), `Verified concept missing: ${concept}`);
}
assert.ok(MIGRATION.includes("('articainehcl','articainehydrochloride'"));
assert.ok(MIGRATION.includes("('vitaminc','ascorbicacid'"));

assert.ok(
  MIGRATION.includes("('tobramycin','tobramycinsulfate'") ||
  MIGRATION.includes("('tobramycinsulfate','tobramycin'"),
  'Tobramycin base vs sulfate must remain precise.'
);
assert.ok(
  MIGRATION.includes("('zincacetate','zincacetatedihydrate'") ||
  MIGRATION.includes("('zincacetatedihydrate','zincacetate'"),
  'Zinc acetate hydration state must not auto-merge.'
);

assert.doesNotMatch(MIGRATION, /update\s+public\.drugs\b/i);
assert.doesNotMatch(MIGRATION, /pharmaceutical_form\s*=/i);
assert.doesNotMatch(MIGRATION, /update\s+public\.medindex_drug_core_map_v1\b/i);

console.log('P1.16 security + verified tail contract passed.');
