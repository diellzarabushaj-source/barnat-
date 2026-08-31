'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const source=fs.readFileSync('scripts/drx-phase10-legacy-retirement-preflight.js','utf8');
const migration=fs.readFileSync(
  'supabase/migrations/20260831061925_drx_phase10l_legacy_retirement_preflight_rpc.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10l-legacy-retirement-preflight-rpc-rollback.sql','utf8'
);
const workflow=fs.readFileSync('.github/workflows/drx-phase10-cutover-gate.yml','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

for(const relation of [
  'dose_products_v2','dose_rules_v2','dose_rule_products_v2','dose_safety_v2',
  'dose_products_v3','dose_rules_v3','dose_rule_products_v3'
]) assert.ok(migration.includes(relation),relation+' missing from retirement preflight RPC');

for(const consumer of [
  'lib/dose-calculator-handler.js',
  'lib/dose-product-fast-path-handler.js',
  'lib/dose-safety-handler.js'
]) assert.ok(source.includes(consumer),consumer+' missing from known consumer gate');

assert.match(migration,/security definer/i);
assert.match(migration,/set search_path = pg_catalog, public, drx_runtime/i);
assert.match(migration,/exactBoundProductParity/);
assert.match(migration,/ruleCountParity/);
assert.match(migration,/bindingCountParity/);
assert.match(migration,/safetyContentLossRisk/);
assert.match(migration,/revoke all on function public\.drx_phase10_legacy_retirement_preflight_v1\(\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration,/grant execute on function public\.drx_phase10_legacy_retirement_preflight_v1\(\)[\s\S]*to service_role/i);
assert.doesNotMatch(migration,/grant select on public\.dose_/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.match(source,/rpc\('drx_phase10_legacy_retirement_preflight_v1'\)/);
assert.doesNotMatch(source,/rows\('dose_rules_v3'/);
assert.match(source,/coverage\.v2PublishedSafetyRows,0/);
assert.match(source,/status\.restoreTestEvidencePass===true/);
assert.match(source,/status\.effectiveParityCurrent===true/);
assert.match(source,/status\.legacyWritesZeroEvidencePass===true/);
assert.match(source,/status\.soak14DaysPass===true/);
assert.doesNotMatch(source,/status\.finalGatePass===true/,
  'retirement cannot depend on finalGatePass because finalGatePass requires LEGACY_CONSUMERS_ZERO');
assert.match(source,/status\.mode==='STRICT'/);
assert.match(source,/status\.strictArmed===true/);
assert.match(source,/retirementAllowedNow/);

assert.match(workflow,/Phase 10L legacy retirement preflight contract/);
assert.match(workflow,/Live Phase 10 legacy retirement preflight/);
assert.match(workflow,/20260831061925_drx_phase10l_legacy_retirement_preflight_rpc\.sql/);
assert.match(workflow,/drx-phase10-legacy-retirement-preflight\.json/);
assert.ok(history.migrations.some(
  item=>item.version==='20260831061925'
    && item.name==='drx_phase10l_legacy_retirement_preflight_rpc'
));

console.log('DRx Phase 10L least-privilege legacy retirement preflight contract: PASS');
