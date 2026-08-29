'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));

function audit(){
 const tracker=read('data/drx-dosierung-master-plan-status.json');
 const coverage=read('data/drx-dose-coverage-snapshot-v2.json');
 const v3=read('data/drx-dose-v3-supabase-candidate-status.json');
 const matrix=read('data/drx-batch2-readiness-matrix-v1.json');
 const observation=read('data/drx-release-observation-v1.json');
 const blockers=[];

 if(v3.applied!==true) blockers.push('supabase_v3_not_applied');
 if((tracker.currentExecution.archiveHashVerifiedCount||0)<25) blockers.push('batch2_archive_hashes_incomplete');
 if((matrix.normalizationReady||0)<25) blockers.push('batch2_normalization_not_ready');
 if((tracker.currentExecution.liveBoundRules||0)<=0) blockers.push('exact_product_binding_not_live');
 if((tracker.currentExecution.legacyComparedRules||0)<=0) blockers.push('legacy_comparison_not_live');
 if((tracker.currentExecution.clinicallyReviewedRules||0)<=0) blockers.push('clinical_review_not_complete');
 if((tracker.currentExecution.publishedRules||0)<=0) blockers.push('no_published_v3_rules');
 if(observation.drxSafetyWorkflowRunObserved!==true) blockers.push('drx_safety_ci_not_observed');
 else if(observation.drxSafetyWorkflowGreen!==true) blockers.push('drx_safety_ci_not_green');
 if(observation.fullCiGreen!==true) blockers.push('full_ci_not_green');
 if(observation.desktopSmokeGreen!==true) blockers.push('desktop_smoke_not_green');
 if(observation.mobileSmokeGreen!==true) blockers.push('mobile_smoke_not_green');
 if(observation.vercelDeploymentGreen!==true) blockers.push('vercel_deploy_not_green');
 if(observation.rollbackTested!==true) blockers.push('rollback_not_tested');
 if(observation.zeroKnownLegacyConsumers!==true) blockers.push('legacy_consumers_not_zero');
 if(coverage?.gates?.publicationBlocked!==true && blockers.length) blockers.push('coverage_gate_inconsistent');

 return {
   schemaVersion:'drx-production-release-readiness-v1',
   checkedAt:new Date().toISOString(),
   releaseReady:blockers.length===0,
   publicationAllowed:blockers.length===0,
   blockers:[...new Set(blockers)],
   phases:{
     apiFastPath:'v3_one_rpc_ready_not_live',
     doseCore:'shared_core_runtime_hardened',
     cacheOffline:'implemented_indexeddb_etag',
     frontend:'shared_core_fast_flow_ready',
     automatedQa:observation.drxSafetyWorkflowRunObserved?'dedicated_gate_observed':'dedicated_gate_configured_not_observed',
     coverage:'implemented_repo_evidence',
     cleanup:'gated_no_destructive_changes',
     productionRelease:blockers.length===0?'ready':'blocked'
   }
 };
}
if(require.main===module){
 const r=audit();
 fs.writeFileSync(path.join(ROOT,'data/drx-production-release-readiness-v1.json'),JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify(r,null,2));
 if(r.releaseReady) process.exitCode=0;
}
module.exports={audit};
