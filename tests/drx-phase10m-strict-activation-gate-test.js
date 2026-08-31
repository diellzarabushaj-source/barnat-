'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const Cutover=require('../lib/dose-v3-cutover-control.js');

// This contract intentionally re-runs after migration-history synchronization.
const migration=fs.readFileSync(
  'supabase/migrations/20260831062943_drx_phase10m_strict_activation_gate.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10m-strict-activation-gate-rollback.sql','utf8'
);

const strictState={
  stateVersion:'drx-phase10-cutover-state-v2',
  mode:'STRICT',
  controlledPercent:0,
  strictArmed:true,
  controlVersion:9,
  trafficBucketVersion:2,
  rollbackTarget:'V2',
  strictActivationSupported:false,
};
const normalized=Cutover._test.normalizeState(strictState);
assert.equal(normalized.stateAvailable,true);
assert.equal(normalized.mode,'STRICT');
assert.equal(normalized.strictArmed,true);

const decision=Cutover.decision(strictState,{column:'drug_id',value:'84a1cf4a-6568-41d7-8d13-0f2b7715acae'});
assert.equal(decision.strict,true);
assert.equal(decision.selectedForV3,true);
assert.equal(decision.serveV3,true);

const invalid=Cutover._test.normalizeState({...strictState,strictArmed:false});
assert.equal(invalid.stateAvailable,false,'unarmed STRICT state must fail closed');

assert.match(migration,/drx_phase10_arm_strict_v1/);
assert.match(migration,/security definer/i);
assert.match(migration,/set search_path = pg_catalog, public, drx_runtime/i);
assert.match(migration,/v_current\.mode <> 'CONTROLLED'/);
assert.match(migration,/v_current\.controlled_percent <> 10/);
assert.match(migration,/STRICT_RUNTIME_FAIL_CLOSED/,
  'strict activation needs independent fail-closed runtime evidence');
for(const gate of [
  'phase9Closed','phase10AllowedByPhase9','securityP0P1EvidencePass',
  'goldenClinicalEvidencePass','parityEvidencePass','effectiveParityCurrent',
  'legacyWritesZeroEvidencePass','rollbackEvidencePass','rollbackDrillPass',
  'restoreTestEvidencePass','soak14DaysPass','legacyWriteEventsSincePhase10Start'
]) assert.ok(migration.includes(gate),gate+' missing from strict activation gate');

assert.doesNotMatch(migration,/v_status->>'legacyConsumersZeroEvidencePass'/,
  'legacy consumer zero is a post-strict retirement gate and must not deadlock activation');
assert.match(migration,/mode='STRICT'/);
assert.match(migration,/strict_armed=true/);
assert.match(migration,/controlled_percent=0/);
assert.match(migration,/revoke all on function public\.drx_phase10_arm_strict_v1\(jsonb\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration,/grant execute on function public\.drx_phase10_arm_strict_v1\(jsonb\)[\s\S]*to service_role/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

console.log('DRx Phase 10M strict activation remains evidence-gated and fail-closed: PASS');
