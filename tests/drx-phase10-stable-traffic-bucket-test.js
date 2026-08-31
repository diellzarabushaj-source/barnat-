'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const Cutover=require('../lib/dose-v3-cutover-control.js');

const migration=fs.readFileSync(
  'supabase/migrations/20260831051755_drx_phase10g_stable_traffic_bucket.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10g-stable-traffic-bucket-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/traffic_bucket_version/);
assert.match(migration,/check \(traffic_bucket_version=2\)/);
assert.match(migration,/drx-phase10-cutover-state-v2/);
assert.match(migration,/'trafficBucketVersion',c\.traffic_bucket_version/);
assert.match(migration,/strictActivationSupported',false/);

const a={stateVersion:'drx-phase10-cutover-state-v2',mode:'CONTROLLED',controlledPercent:5,strictArmed:false,controlVersion:4,trafficBucketVersion:2,rollbackTarget:'V2',strictActivationSupported:false};
const b={...a,controlVersion:100,controlledPercent:10};
const selector={column:'drug_id',value:'84a1cf4a-6568-41d7-8d13-0f2b7715acae'};
assert.equal(Cutover._test.trafficBucket(a,selector),Cutover._test.trafficBucket(b,selector));
assert.equal(Cutover._test.trafficBucket(a,selector),2);
assert.equal(Cutover.decision(a,selector).selectedForV3,true);

assert.match(rollback,/rollback blocked: control has advanced or runtime evidence exists/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260831051755' && m.name==='drx_phase10g_stable_traffic_bucket'
));

console.log('DRx Phase 10G stable traffic bucket contract: PASS');
