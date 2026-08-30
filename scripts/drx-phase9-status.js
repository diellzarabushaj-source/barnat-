'use strict';

const fs=require('node:fs');
const assert=require('node:assert/strict');
const { supabaseRequest }=require('../lib/medindex-data-api.js');

async function rpc(name,body={}) {
  const {data}=await supabaseRequest(
    'rpc/'+name,
    {method:'POST',body,timeoutMs:12000,label:'DRx Phase 9 '+name},
    {privileged:true}
  );
  return data;
}

async function main() {
  const status=await rpc('drx_phase9_status_v1');
  assert.equal(status.statusVersion,'drx-phase9-status-v2');
  assert.equal(status.phase,9);
  assert.equal(status.phase8Closed,true);
  assert.equal(status.backendFoundationGatePass,true);
  assert.equal(status.v2FallbackRequired,true);
  assert.equal(status.v2RuntimePreserved,true);
  assert.equal(status.v3CutoverEnabled,false);
  assert.equal(status.favoritesPolymorphic,true);
  assert.equal(status.notesEntityTypeReady,true);
  assert.equal(status.notesEntityKeyReady,true);
  assert.equal(status.notesPolymorphicDrugNullable,true);
  assert.equal(status.favoriteOwnerPolicyCount,4);
  assert.ok(status.noteOwnerPolicyCount>=4);
  assert.equal(status.contextRpcExists,true);
  assert.equal(status.contextServiceExecute,true);
  assert.equal(status.contextAnonExecute,false);
  assert.equal(status.contextAuthenticatedExecute,false);
  assert.equal(status.frontendQaRequired,true);
  assert.equal(status.frontendQaPassed,true);
  assert.equal(status.technicalQaEvidencePass,true);
  assert.equal(status.technicalQaEvidenceId,'phase9-qa-8ecaa228');
  assert.equal(status.phase9WorkflowRunId,33339677881);
  assert.equal(status.phase9ArtifactId,9740145041);
  assert.equal(status.clinicalAttestationUsed,false);
  assert.equal(status.finalExitPass,true);
  assert.equal(status.phase10Allowed,true);

  const pilots=[
    'c8cd0467-da73-479c-b8e8-b785af833f59',
    '84a1cf4a-6568-41d7-8d13-0f2b7715acae',
  ];
  const contexts=[];
  for(const drugId of pilots){
    const context=await rpc('drx_phase9_product_context_v1',{p_drug_id:drugId});
    assert.equal(context.contextVersion,'drx-phase9-product-context-v1');
    assert.equal(context.drugId,drugId);
    assert.ok(context.substanceConceptId);
    assert.ok(context.populationKey);
    assert.equal(context.v3Published,true);
    assert.ok(context.source?.documentVersion);
    contexts.push(context);
  }

  const evidence={
    evidenceVersion:'drx-phase9-foundation-evidence-v1',
    generatedAt:new Date().toISOString(),
    status,
    contexts,
  };
  fs.writeFileSync('drx-phase9-foundation-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
