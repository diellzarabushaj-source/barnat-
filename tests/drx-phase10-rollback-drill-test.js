'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260831051258_drx_phase10f_controlled_rollback_drill.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10f-controlled-rollback-drill-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/CONTROLLED 1%% at control version 2/i);
assert.match(migration,/targetMode','SHADOW/);
assert.match(migration,/expectedVersion',2/);
assert.match(migration,/toControlVersion',3/);
assert.match(migration,/phase10_rollback_drills_v1/);
assert.match(migration,/ROLLBACK_DRILL_PASS/);
assert.match(migration,/v3_data_preserved/);
assert.match(migration,/provenance_preserved/);
assert.match(migration,/v2_service_restored/);
assert.match(migration,/v_products_before<>v_products_after/);
assert.match(migration,/v_rules_before<>v_rules_after/);
assert.match(migration,/v_provenance_before<>v_provenance_after/);
assert.match(migration,/legacy writes appeared during rollback drill/i);
assert.match(migration,/33359445295/);
assert.match(migration,/runtimeContractConclusion','success/);
assert.match(migration,/dose_source_snapshots_v3/);
assert.match(migration,/dose_source_sections_v3/);

assert.match(rollback,/Rollback blocked/);
assert.match(rollback,/immutable/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);
assert.doesNotMatch(rollback,/\bdelete\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260831051258'
    && m.name==='drx_phase10f_controlled_rollback_drill'
));

console.log('DRx Phase 10F controlled rollback drill contract: PASS');
