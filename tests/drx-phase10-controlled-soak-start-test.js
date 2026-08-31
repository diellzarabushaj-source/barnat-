'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260831052414_drx_phase10h_controlled_soak_start.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase10h-controlled-soak-start-rollback.sql','utf8'
);
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(migration,/phase10_soak_guard_v1/);
assert.match(migration,/Phase 10 soak evidence cannot be deleted/);
assert.match(migration,/Completed Phase 10 soak evidence is immutable/);
assert.match(migration,/incident counters cannot decrease/);
assert.match(migration,/cannot complete before 14 elapsed days/);
assert.match(migration,/CONTROLLED 5%% v4/);
assert.match(migration,/trafficBucketVersion/);
assert.match(migration,/33360299633/);
assert.match(migration,/283dcd41f96d8eb3fce332c7dfd1c71a13d5f90d/);
assert.match(migration,/9746451841/);
assert.match(migration,/2fbc9f24da0f5126880273d56a44481d315d1b0ef305e9a16e17e487fbb4694d/);
assert.match(migration,/strict off/i);
assert.match(migration,/V2 fallback remains active/i);

assert.match(rollback,/rollback blocked: production soak evidence exists and must be preserved/i);
assert.doesNotMatch(rollback,/\bdelete\b/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

assert.ok(history.migrations.some(
  m=>m.version==='20260831052414' && m.name==='drx_phase10h_controlled_soak_start'
));

console.log('DRx Phase 10H controlled soak start contract: PASS');
