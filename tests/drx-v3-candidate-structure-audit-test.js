'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'drx-dose-v3-additive-candidate.sql'),
  'utf8'
);

const tables = [
  'dose_source_snapshots_v3',
  'dose_source_sections_v3',
  'dose_indication_concepts_v3',
  'dose_indication_terms_v3',
  'dose_products_v3',
  'dose_rules_v3',
  'dose_renal_adjustments_v3',
  'dose_hepatic_adjustments_v3',
  'dose_rule_products_v3',
  'dose_legacy_comparisons_v3',
  'dose_review_queue_v3',
  'dose_publication_events_v3',
];

const occurrences = needle => sql.split(needle).length - 1;

assert.equal(
  occurrences('create table if not exists public.'),
  tables.length,
  'V3 candidate must contain exactly the expected table count.'
);

for (const table of tables) {
  assert.equal(
    occurrences('create table if not exists public.' + table),
    1,
    table + ' must be declared exactly once.'
  );
  assert.equal(
    occurrences('alter table public.' + table + ' enable row level security'),
    1,
    table + ' must enable RLS exactly once.'
  );
}

assert.equal(
  occurrences('create or replace function private.drx_enforce_product_publication_v3()'),
  1,
  'Product publication guard must exist exactly once.'
);
assert.equal(
  occurrences('create or replace function private.drx_enforce_rule_publication_v3()'),
  1,
  'Rule publication guard must exist exactly once.'
);
assert.equal(
  occurrences('create or replace function public.medindex_dose_product_fast_path_v3('),
  1,
  'Public one-RPC fast path must exist exactly once.'
);

assert.doesNotMatch(sql, /\bsecurity\s+definer\b/i);
assert.doesNotMatch(sql, /\b(?:from|join)\s+public\.dose_products_v2\b/i);
assert.doesNotMatch(sql, /\balter\s+table\s+public\.dose_rules_v2\b/i);
assert.doesNotMatch(sql, /\balter\s+table\s+public\.dosage_regimens\b/i);
assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
assert.doesNotMatch(sql, /\btruncate\b/i);
assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
assert.match(sql, /DRX_V3_PREEXISTING_SHADOW_SCHEMA/);
assert.match(sql, /dose_source_snapshots_v3_https_check/);
assert.match(sql, /create trigger dose_products_v3_publication_guard[\s\S]*before insert or update/);
assert.match(sql, /create trigger dose_rules_v3_publication_guard[\s\S]*before insert or update/);

assert.match(sql, /constraint dose_products_v3_source_identity_check[\s\S]*source_snapshot_id = source_evidence_hash/);
assert.match(sql, /constraint dose_rules_v3_source_identity_check[\s\S]*source_snapshot_id = source_evidence_hash/);
assert.match(sql, /dose_source_snapshots_v3_version_check/);
assert.match(sql, /dose_rules_v3_published_safety_check/);
assert.match(sql, /dose_rule_products_v3_unique_binding unique \(rule_id, product_id\)/);

assert.match(sql, /security invoker[\s\S]*public\.medindex_dose_product_fast_path_v3|public\.medindex_dose_product_fast_path_v3[\s\S]*security invoker/);
assert.match(sql, /revoke all on function public\.medindex_dose_product_fast_path_v3\(text, uuid\)[\s\S]*from public/);
assert.match(sql, /grant execute on function public\.medindex_dose_product_fast_path_v3\(text, uuid\)[\s\S]*to anon, authenticated/);

console.log('DRx V3 candidate structure is clean, unique, additive and V2-independent.');
