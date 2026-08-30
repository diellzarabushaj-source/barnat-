'use strict';
const assert=require('node:assert/strict');
const Audit=require('../scripts/audit-drx-production-release.js');
const observation=require('../data/drx-release-observation-v1.json');
const v3=require('../data/drx-dose-v3-supabase-candidate-status.json');
const matrix=require('../data/drx-batch2-readiness-matrix-v1.json');
const first100=require('../data/drx-first100-production-provenance-audit-v1.json');
const Legacy=require('../scripts/audit-drx-legacy-consumers.js');

const r=Audit.audit();
const legacy=Legacy.audit();
const expectBlocker=(name,condition)=>assert.equal(
  r.blockers.includes(name),
  Boolean(condition),
  `blocker ${name} must follow evidence instead of being hard-coded`
);

assert.equal(r.schemaVersion,'drx-production-release-readiness-v1');
assert.equal(r.releaseReady,r.blockers.length===0);
assert.equal(r.publicationAllowed,r.releaseReady);
assert.equal(r.phases.productionRelease,r.releaseReady?'ready':'blocked');

expectBlocker('supabase_v3_not_applied',v3.applied!==true);
expectBlocker('batch2_source_sections_not_persisted',(v3.liveVerification?.sourceSections||0)<25);
expectBlocker('batch2_normalization_not_ready',(matrix.normalizationReady||0)<25);
expectBlocker('first100_canonical_provenance_not_ready',first100.productionEligible!==true);
expectBlocker('first100_production_queue_not_ready',(first100?.metrics?.productionEligibleRows||0)<100);
expectBlocker('drx_safety_ci_not_observed',observation.drxSafetyWorkflowRunObserved!==true);
if(observation.drxSafetyWorkflowRunObserved===true){
  expectBlocker('drx_safety_ci_not_green',observation.drxSafetyWorkflowGreen!==true);
}
expectBlocker('full_ci_not_green',observation.fullCiGreen!==true);
expectBlocker('desktop_smoke_not_green',observation.desktopSmokeGreen!==true);
expectBlocker('mobile_smoke_not_green',observation.mobileSmokeGreen!==true);
expectBlocker('vercel_deploy_not_green',observation.vercelDeploymentGreen!==true);
expectBlocker('rollback_not_tested',observation.rollbackTested!==true);
expectBlocker('legacy_consumers_not_zero',legacy.zeroKnownLegacyConsumers!==true);

assert.equal(r.phases.apiFastPath,v3.applied===true?'v3_one_rpc_live_shadow_no_published_rules':'v3_one_rpc_ready_not_live');
assert.equal(r.phases.doseCore,'shared_core_runtime_hardened');
assert.equal(r.phases.cacheOffline,'implemented_indexeddb_etag');
assert.equal(r.phases.frontend,'shared_core_fast_flow_ready');
console.log('DRx release readiness contract is evidence-driven and fail-closed.');
