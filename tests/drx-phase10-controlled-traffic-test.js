'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const Cutover=require('../lib/dose-v3-cutover-control.js');

const migration=fs.readFileSync(
  'supabase/migrations/20260830231042_drx_phase10b_controlled_traffic_plumbing.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10b-controlled-traffic-plumbing-rollback.sql','utf8'
);
const handler=fs.readFileSync('lib/dose-product-fast-path-handler.js','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/phase10_cutover_events_v1/);
assert.match(migration,/phase10_runtime_events_v1/);
assert.match(migration,/strictActivationSupported',false/);
assert.match(migration,/Strict cutover is locked until the final Phase 10 gate and 14-day soak pass/);
assert.match(migration,/v_percent not in \(1,5,10\)/);
assert.match(migration,/v_from_mode:=v_current\.mode/);
assert.match(migration,/v_from_percent:=v_current\.controlled_percent/);
assert.match(migration,/v_from_version:=v_current\.version_no/);
assert.match(migration,/values\(\s*v_from_mode,\s*v_current\.mode,\s*v_from_percent/);
assert.match(migration,/drx_phase10_record_runtime_event_v1/);
assert.doesNotMatch(migration,/clinical payload/i);
assert.match(migration,/revoke all on function public\.drx_phase10_cutover_state_v1\(\)[\s\S]*from public,anon,authenticated/i);
assert.match(migration,/grant execute on function public\.drx_phase10_cutover_state_v1\(\)[\s\S]*to service_role/i);

const safe=Cutover._test.safeState('test');
assert.equal(safe.mode,'SHADOW');
assert.equal(safe.controlledPercent,0);
assert.equal(safe.strictArmed,false);
assert.equal(safe.stateAvailable,false);

const controlled=Cutover._test.normalizeState({
  stateVersion:'drx-phase10-cutover-state-v2',
  mode:'CONTROLLED',controlledPercent:5,strictArmed:false,controlVersion:7,
  trafficBucketVersion:2,rollbackTarget:'V2',strictActivationSupported:false,
});
assert.equal(controlled.stateAvailable,true);
assert.equal(controlled.mode,'CONTROLLED');
assert.equal(controlled.controlledPercent,5);

const strict=Cutover._test.normalizeState({
  stateVersion:'drx-phase10-cutover-state-v2',
  mode:'STRICT',controlledPercent:0,strictArmed:true,controlVersion:8,
  trafficBucketVersion:2,rollbackTarget:'V2',strictActivationSupported:true,
});
assert.equal(strict.mode,'SHADOW');
assert.equal(strict.stateAvailable,false);

const selector={column:'drug_id',value:'11111111-1111-4111-8111-111111111111'};
const bucket1=Cutover._test.trafficBucket(controlled,selector);
const bucket2=Cutover._test.trafficBucket(controlled,selector);
assert.equal(bucket1,bucket2);
assert.ok(bucket1>=0 && bucket1<=99);
const decision=Cutover.decision(controlled,selector);
assert.equal(decision.trafficBucket,bucket1);
assert.equal(decision.trafficBucketVersion,2);
assert.equal(decision.selectedForV3,bucket1<5);

const stableAcrossControlVersions=Cutover._test.trafficBucket(
  {...controlled,controlVersion:99},
  selector
);
assert.equal(stableAcrossControlVersions,bucket1,
  'controlled cohort must not reshuffle when controlVersion changes');
assert.equal(Cutover._test.TRAFFIC_BUCKET_VERSION,2);
assert.equal(Cutover.decision(safe,selector).selectedForV3,false);

const legacyControlled=Cutover._test.normalizeState({
  stateVersion:'drx-phase10-cutover-state-v1',
  mode:'CONTROLLED',controlledPercent:5,strictArmed:false,controlVersion:7,
  rollbackTarget:'V2',strictActivationSupported:false,
});
assert.equal(legacyControlled.stateAvailable,false);
assert.equal(legacyControlled.fallbackReason,'legacy_state_not_allowed_for_controlled');

assert.match(handler,/Cutover\.getState\(\)/);
assert.match(handler,/Cutover\.decision\(state,selector\)/);
assert.match(handler,/Phase 10B DB control is authoritative/);
assert.doesNotMatch(
  handler.slice(handler.indexOf('async function buildRuntimePayload'),handler.indexOf('async function handler')),
  /v3ReadsEnabled|v3StrictEnabled/,
  'env V3 flags must not control Phase 10B serving'
);
assert.match(handler,/X-DRx-Dose-Cutover-Mode/);
assert.match(handler,/X-DRx-Dose-Traffic-Bucket/);
assert.match(handler,/Cutover\.recordEvent/);

assert.match(rollback,/cutover\/runtime evidence exists/);
assert.match(rollback,/cutover control has changed/);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260830231042' && m.name==='drx_phase10b_controlled_traffic_plumbing'
));

console.log('DRx Phase 10B controlled traffic plumbing contract: PASS');
