'use strict';

/* P1.24 — runtime hardening after the live exit audit.

   The static P1.23 contract checked the original blocker it discovered, but a
   live audit found two runtime-only gaps: delimiter diagnostics could survive
   on a row resolved by a single-expression override, and the trigger guard was
   still callable by client roles because functions default to PUBLIC EXECUTE. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_VERSION = '20260828000815';
const MIGRATION_NAME = 'p1_exit_runtime_hardening';
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'supabase', 'migrations', `${MIGRATION_VERSION}_${MIGRATION_NAME}.sql`),
  'utf8'
);
const MIGRATION_HISTORY = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'supabase', 'migration-history.json'), 'utf8')
);

assert.ok(
  MIGRATION_HISTORY.migrations.some(
    ({ version, name }) => version === MIGRATION_VERSION && name === MIGRATION_NAME
  ),
  'The applied P1.24 migration must be recorded with its exact live version and name.'
);

const CURATED_TABLES = [
  'substance_concepts_v1',
  'substance_terms_v1',
  'substance_aliases',
  'substance_merge_rejections',
  'substance_equivalence_reviewed_v1',
  'substance_equivalence_cleared_v1',
  'substance_single_expression_override_v1',
  'product_ingredients_v1',
  'product_ingredient_resolution_v1',
];

assert.match(
  MIGRATION,
  /revoke all on function public\.medindex_reject_alias_rejection_conflict\(\)\s*\n\s*from public, anon, authenticated;/,
  'The SECURITY DEFINER trigger function must not be exposed as a client RPC.'
);
assert.match(
  MIGRATION,
  /grant execute on function public\.medindex_reject_alias_rejection_conflict\(\)\s*\n\s*to service_role;/,
  'The server role keeps the explicit maintenance privilege.'
);
assert.match(
  MIGRATION,
  /grant select on\s*\n[\s\S]*public\.substance_single_expression_override_v1,[\s\S]*\n\s*to anon, authenticated;/,
  'A clean rebuild must grant the curated surface explicit read access.'
);
const grantBlock = MIGRATION.match(/grant select on([\s\S]*?)to anon, authenticated;/)?.[1] || '';
for (const table of CURATED_TABLES) {
  assert.ok(grantBlock.includes(`public.${table}`), `Explicit read grant is missing ${table}.`);
}
assert.match(
  MIGRATION,
  /revoke all on function public\.medindex_refresh_product_ingredients_v1\(\)\s*\n\s*from public, anon, authenticated;/,
  'Replacing the refresh function must not reopen its maintenance RPC.'
);

for (const blocker of [
  'EQUIVALENCE_EXPRESSION',
  'UNRESOLVED_COMPONENT',
  'SLASH_CONNECTOR',
  'WORD_AND_CONNECTOR',
]) {
  assert.ok(MIGRATION.includes(`'${blocker}'`), `Resolved-row invariant is missing ${blocker}.`);
}
assert.match(
  MIGRATION,
  /resolution_status in \('RESOLVED_SINGLE','RESOLVED_MULTI'\)\s*\n\s*and reason_codes && array\[/,
  'The migration must reject every blocker code on resolved products.'
);

/* Every parse-path blocker is emitted only when none of the three safe paths
   resolved the product. This prevents the next refresh from recreating the
   contradiction that the one-time cleanup removed. */
const safePathGuard = /sd\.source_drug_id is null\s*\n\s*and sa\.source_drug_id is null\s*\n\s*and ss\.source_drug_id is null/g;
assert.equal(
  (MIGRATION.match(safePathGuard) || []).length,
  3,
  'AND, slash and unresolved-component diagnostics need the same safe-path guard.'
);

assert.match(MIGRATION, /has_function_privilege\(\s*\n\s*'anon'/);
assert.match(MIGRATION, /has_function_privilege\(\s*\n\s*'authenticated'/);
assert.match(MIGRATION, /ingredient refresh function remains callable through a client role/);
assert.match(MIGRATION, /has_table_privilege\(\s*\n\s*'anon'/);
assert.match(MIGRATION, /has_table_privilege\(\s*\n\s*'authenticated'/);
assert.match(MIGRATION, /'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'/);
assert.match(MIGRATION, /single-expression overrides disagree with the alias graph/);
assert.match(MIGRATION, /curated tables have RLS disabled/);
assert.match(MIGRATION, /curated tables lack a public read policy/);
assert.ok(MIGRATION.includes("'medindex_product_ingredient_review_queue_v1'"));
assert.match(MIGRATION, /P1 views are not security_invoker/);

console.log('P1.24 exit runtime hardening contract passed.');
