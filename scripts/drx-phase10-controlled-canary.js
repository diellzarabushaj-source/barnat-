'use strict';

const fs=require('node:fs');
const assert=require('node:assert/strict');
const handler=require('../lib/dose-product-fast-path-handler.js');
const Cutover=require('../lib/dose-v3-cutover-control.js');

const PARACETAMOL_DRUG_ID='84a1cf4a-6568-41d7-8d13-0f2b7715acae';

async function main(){
  Cutover._test.clearCache();

  const state=await Cutover.getState({force:true});
  assert.equal(state.stateAvailable,true);
  assert.equal(state.stateVersion,'drx-phase10-cutover-state-v2');
  assert.equal(state.trafficBucketVersion,2);

  if(state.mode==='SHADOW'){
    assert.equal(state.controlledPercent,0);
    assert.equal(state.strictArmed,false);
    const evidence={
      evidenceVersion:'drx-phase10-controlled-canary-v2',
      generatedAt:new Date().toISOString(),
      applicable:false,
      reason:'CONTROLLED_NOT_ACTIVE',
      control:{
        stateVersion:state.stateVersion,
        mode:state.mode,
        controlledPercent:state.controlledPercent,
        controlVersion:state.controlVersion,
        trafficBucketVersion:state.trafficBucketVersion,
        strictArmed:state.strictArmed,
      },
      runtime:{served:'v2-safety-path',v3Available:false,fallbackUsed:false},
      pass:true,
    };
    fs.writeFileSync('drx-phase10-controlled-canary-evidence.json',JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
    return;
  }
  assert.equal(state.mode,'CONTROLLED');
  assert.equal(state.controlledPercent,5);
  assert.equal(state.strictArmed,false);

  const selector={column:'drug_id',value:PARACETAMOL_DRUG_ID};
  const decision=Cutover.decision(state,selector);
  assert.equal(decision.trafficBucketVersion,2);
  assert.equal(decision.trafficBucket,2);
  assert.equal(decision.selectedForV3,true);
  assert.equal(decision.strict,false);

  const result=await handler.buildRuntimePayload(selector);
  assert.equal(result.cutover?.mode,'CONTROLLED');
  assert.equal(result.cutover?.controlledPercent,5);
  assert.equal(result.cutover?.trafficBucketVersion,2);
  assert.equal(result.cutover?.trafficBucket,2);
  assert.equal(result.cutover?.selectedForV3,true);
  assert.equal(result.runtime,'v3');
  assert.equal(result.v3Available,true);
  assert.equal(result.fallbackUsed,false);
  assert.ok(result.payload);
  assert.equal(result.payload.schemaVersion,'dose-product-fast-path-v3');
  assert.equal(result.payload.product?.drugId,PARACETAMOL_DRUG_ID);

  const evidence={
    evidenceVersion:'drx-phase10-controlled-canary-v1',
    generatedAt:new Date().toISOString(),
    selector:{kind:'drug_id',sha256:Cutover.selectorHash(selector)},
    control:{
      stateVersion:state.stateVersion,
      mode:state.mode,
      controlledPercent:state.controlledPercent,
      controlVersion:state.controlVersion,
      trafficBucketVersion:state.trafficBucketVersion,
      trafficBucket:decision.trafficBucket,
      selectedForV3:decision.selectedForV3,
      strictArmed:state.strictArmed,
    },
    runtime:{
      served:result.runtime,
      v3Available:result.v3Available,
      fallbackUsed:result.fallbackUsed,
      payloadSchemaVersion:result.payload.schemaVersion,
      productKey:result.payload.product?.productKey || null,
      ruleCount:Array.isArray(result.payload.product?.rules)?result.payload.product.rules.length:null,
    },
    pass:true,
  };

  fs.writeFileSync('drx-phase10-controlled-canary-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
