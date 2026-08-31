'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const parallel=fs.readFileSync(
  'supabase/migrations/20260831045759_drx_phase10a_cutover_control_plane.sql','utf8'
);
const reconcile=fs.readFileSync(
  'supabase/migrations/20260831050214_drx_phase10d_reconcile_parallel_control_plane.sql','utf8'
);
const rollbackParallel=fs.readFileSync(
  'supabase/drx-phase10a-parallel-cutover-control-plane-rollback.sql','utf8'
);
const rollbackReconcile=fs.readFileSync(
  'supabase/drx-phase10d-reconcile-parallel-control-plane-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(parallel,/drx_dose\.phase10_runtime_control_v1/);
assert.match(parallel,/runtime_integration_active boolean not null default false/i);
assert.match(parallel,/strict_unlocked boolean not null default false check \(not strict_unlocked\)/i);
assert.match(parallel,/V3_STRICT is locked/i);
assert.match(parallel,/destructiveCleanupAllowed',false/);

assert.match(reconcile,/runtime_integration_active=false/i);
assert.match(reconcile,/mode='V2_FALLBACK'/i);
assert.match(reconcile,/canonicalControlPlane','drx_runtime\.phase10_cutover_control_v1'/);
assert.match(reconcile,/policyVersion','drx-phase10-runtime-policy-compat-v1'/);
assert.match(reconcile,/Superseded Phase 10 control RPC/);
assert.match(reconcile,/Use public\.drx_phase10_set_controlled_traffic_v1\(jsonb\)/);
assert.match(reconcile,/from drx_runtime\.phase10_cutover_control_v1 where singleton/i);
assert.match(reconcile,/goldenClinicalEvidencePass/);
assert.match(reconcile,/parityEvidencePass/);
assert.match(reconcile,/soak14DaysPass/);
assert.match(reconcile,/destructiveCleanupAllowed/);

// Reconciliation may mark only the duplicate control inert. It must never mutate
// the canonical traffic mode or percentage.
assert.doesNotMatch(
  reconcile,
  /update\s+drx_runtime\.phase10_cutover_control_v1/i,
  'reconciliation must not mutate canonical traffic state'
);
assert.doesNotMatch(reconcile,/\bdrop\s+(table|schema)\b/i);

for(const rollback of [rollbackParallel,rollbackReconcile]){
  assert.match(rollback,/Rollback blocked/i);
  assert.doesNotMatch(rollback,/\bcascade\b/i);
  assert.doesNotMatch(rollback,/\bdrop\s+(table|schema)\b/i);
}

for(const [version,name] of [
  ['20260831045759','drx_phase10a_cutover_control_plane'],
  ['20260831050214','drx_phase10d_reconcile_parallel_control_plane'],
]){
  assert.ok(history.migrations.some(m=>m.version===version && m.name===name),
    version+' must exist in migration history');
}

console.log('DRx Phase 10 parallel control-plane reconciliation contract: PASS');
