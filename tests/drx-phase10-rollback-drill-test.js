'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('supabase/migrations/20260831051258_drx_phase10f_controlled_rollback_drill.sql','utf8');
const rollback=fs.readFileSync('supabase/drx-phase10f-controlled-rollback-drill-rollback.sql','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

for(const expected of [
  'CONTROLLED 1%% at control version 2',
  "targetMode','SHADOW",
  "expectedVersion',2",
  "toControlVersion',3",
  'phase10_rollback_drills_v1',
  'ROLLBACK_DRILL_PASS',
  'v3_data_preserved',
  'provenance_preserved',
  'v2_service_restored',
  '33359445295'
]) assert.ok(migration.includes(expected),expected+' missing');

assert.match(migration,/v_products_before<>v_products_after/);
assert.match(migration,/v_rules_before<>v_rules_after/);
assert.match(migration,/v_provenance_before<>v_provenance_after/);
assert.match(migration,/Legacy writes appeared during rollback drill/);
assert.match(migration,/dose_source_snapshots_v3/);
assert.match(migration,/dose_source_sections_v3/);
assert.match(rollback,/Rollback blocked/);
assert.match(rollback,/append-only/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);
assert.doesNotMatch(rollback,/\bdelete\b/i);
assert.ok(history.migrations.some(m=>m.version==='20260831051258'&&m.name==='drx_phase10f_controlled_rollback_drill'));

console.log('DRx Phase 10F controlled rollback drill contract: PASS');
