'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const m1 = read('supabase/migrations/20260829011139_phase4_incremental_ingredient_refresh.sql');
const m2 = read('supabase/migrations/20260829011529_phase4_targeted_incremental_resolver.sql');
const manifest = JSON.parse(read('supabase/migration-history.json'));

for (const [version, name] of [
  ['20260829011139','phase4_incremental_ingredient_refresh'],
  ['20260829011529','phase4_targeted_incremental_resolver'],
]) {
  assert.ok(
    manifest.migrations.some(item => String(item.version) === version && item.name === name),
    `Missing Phase 4 migration in manifest: ${version}_${name}`
  );
}

assert.match(m1, /create or replace function public\.medindex_refresh_product_ingredients_for_drugs_v1\s*\(\s*p_drug_ids uuid\[\]/i);
assert.match(m1, /requested_count\s*>\s*250/i);
assert.match(m1, /revoke all on function public\.medindex_refresh_product_ingredients_for_drugs_v1\(uuid\[\]\)[\s\S]*from public, anon, authenticated/i);
assert.match(m1, /grant execute on function public\.medindex_refresh_product_ingredients_for_drugs_v1\(uuid\[\]\)[\s\S]*to service_role/i);
assert.match(m1, /create trigger drugs_refresh_ingredients_after_editorial_substance_change/i);
assert.match(m1, /after update of active_substance on public\.drugs/i);
assert.match(m1, /new\.editorial_override\s*=\s*true/i);
assert.match(m1, /old\.active_substance is distinct from new\.active_substance/i);
assert.match(m1, /private\.medindex_refresh_edited_drug_ingredients_v1/i);

assert.match(m2, /create or replace function private\.medindex_resolve_substance_key_v1\(value text\)/i);
assert.match(m2, /language sql[\s\S]*stable[\s\S]*strict/i);
assert.match(m2, /join public\.substance_aliases a[\s\S]*a\.variant_key\s*=\s*r\.canonical_key/i);
assert.match(m2, /r\.depth\s*<\s*32/i);
assert.match(m2, /not a\.canonical_key\s*=\s*any\(r\.path\)/i);
assert.match(m2, /revoke all on function private\.medindex_resolve_substance_key_v1\(text\)[\s\S]*from public, anon, authenticated/i);

const finalStart = m2.indexOf('create or replace function public.medindex_refresh_product_ingredients_for_drugs_v1');
assert(finalStart >= 0, 'Final Phase 4 incremental function is missing');
const finalSql = m2.slice(finalStart);

for (const legacyView of [
  'public.substance_canonical',
  'public.medindex_p1_safe_single_v1',
  'public.medindex_p1_combo_parts_v1',
  'public.medindex_p1_resolved_delimiter_parts_v2',
  'public.medindex_p1_safe_delimiter_v2',
  'public.medindex_p1_safe_and_v1',
  'public.medindex_p1_and_parts_v1',
]) {
  assert.ok(!finalSql.includes(legacyView), `Final incremental path must not use global view ${legacyView}`);
}
assert.match(finalSql, /regexp_split_to_table/i);
assert.match(finalSql, /else 'NEEDS_REVIEW'/i);
assert.match(finalSql, /private\.medindex_resolve_substance_key_v1/i);
assert.match(finalSql, /security definer/i);
assert.match(finalSql, /set search_path = pg_catalog, public, private/i);
assert.match(finalSql, /grant execute on function public\.medindex_refresh_product_ingredients_for_drugs_v1\(uuid\[\]\)[\s\S]*to service_role/i);

for (const sql of [m1, m2]) {
  assert.doesNotMatch(sql, /drop function\s+public\.medindex_refresh_product_ingredients_v1\s*\(/i);
  assert.doesNotMatch(sql, /create or replace function\s+public\.medindex_refresh_product_ingredients_v1\s*\(\s*\)/i);
  assert.doesNotMatch(sql, /update\s+public\.drugs\b/i);
  assert.doesNotMatch(sql, /pharmaceutical_form\s*=/i);
}

console.log('Phase 4 incremental ingredient refresh contract passed.');
