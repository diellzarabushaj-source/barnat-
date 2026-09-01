'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');

const script=fs.readFileSync('scripts/drx-phase10-controlled-canary.js','utf8');

assert.match(script,/PARACETAMOL_DRUG_ID='84a1cf4a-6568-41d7-8d13-0f2b7715acae'/);
assert.match(script,/if\(state\.mode==='SHADOW'\)/);
assert.match(script,/reason:'CONTROLLED_NOT_ACTIVE'/);
assert.match(script,/runtime:\{served:'v2-safety-path',v3Available:false,fallbackUsed:false\}/);
assert.match(script,/state\.mode,'CONTROLLED'/);
assert.match(script,/state\.controlledPercent,5/);
assert.match(script,/state\.trafficBucketVersion,2/);
assert.match(script,/decision\.trafficBucket,2/);
assert.match(script,/decision\.selectedForV3,true/);
assert.match(script,/handler\.buildRuntimePayload\(selector\)/);
assert.match(script,/result\.runtime,'v3'/);
assert.match(script,/result\.v3Available,true/);
assert.match(script,/result\.fallbackUsed,false/);
assert.doesNotMatch(script,/recordEvent\(/,
  'CI canary must not fabricate production runtime telemetry');

cp.execFileSync(process.execPath,['--check','scripts/drx-phase10-controlled-canary.js'],{stdio:'pipe'});
console.log('DRx Phase 10 controlled canary contract: PASS');
