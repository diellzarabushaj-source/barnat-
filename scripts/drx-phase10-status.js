'use strict';

const fs=require('node:fs');
const assert=require('node:assert/strict');
const { supabaseRequest }=require('../lib/medindex-data-api.js');

async function rpc(name,body={}) {
  const {data}=await supabaseRequest(
    'rpc/'+name,
    {method:'POST',body,timeoutMs:12000,label:'DRx Phase 10 '+name},
    {privileged:true}
  );
  return data;
}

async function main(){
  const status=await rpc('drx_phase10_status_v1');
  assert.equal(status.statusVersion,'drx-phase10-status-v1');
  assert.equal(status.phase,10);
  assert.equal(status.phase9Closed,true);
  assert.equal(status.phase10AllowedByPhase9,true);
  assert.equal(status.mode,'SHADOW');
  assert.equal(status.controlledTrafficPercent,0);
  assert.equal(status.strictArmed,false);
  assert.equal(status.strictModeLocked,true);
  assert.equal(status.rollbackTarget,'V2');
  assert.equal(status.v2FallbackRequired,true);
  assert.equal(status.v3StrictActive,false);
  assert.equal(status.minimumSoakDays,14);
  assert.equal(status.soak14DaysPass,false);
  assert.equal(status.finalGatePass,false);
  assert.equal(status.destructiveCleanupAllowed,false);

  assert.ok(Number.isInteger(status.publishedV3Products) && status.publishedV3Products>0);
  assert.ok(Number.isInteger(status.publishedV3Rules) && status.publishedV3Rules>0);
  assert.ok(Number.isInteger(status.rawShadowDiffs) && status.rawShadowDiffs>=0);
  assert.ok(Number.isInteger(status.approvedClinicalCorrections) && status.approvedClinicalCorrections>=0);
  assert.equal(status.effectiveParityCurrent,true);
  assert.ok(Number.isInteger(status.legacyWriteEventsSincePhase10Start)
    && status.legacyWriteEventsSincePhase10Start>=0);

  const evidence={
    evidenceVersion:'drx-phase10-status-evidence-v1',
    generatedAt:new Date().toISOString(),
    status,
  };
  fs.writeFileSync('drx-phase10-status-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
