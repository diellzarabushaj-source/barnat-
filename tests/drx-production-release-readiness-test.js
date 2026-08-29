'use strict';
const assert=require('node:assert/strict');
const Audit=require('../scripts/audit-drx-production-release.js');
const observation=require('../data/drx-release-observation-v1.json');
const r=Audit.audit();
assert.equal(r.schemaVersion,'drx-production-release-readiness-v1');
assert.equal(r.releaseReady,false);
assert.equal(r.publicationAllowed,false);
assert.ok(r.blockers.includes('supabase_v3_not_applied'));
assert.ok(!r.blockers.includes('batch2_archive_ci_hashes_incomplete'));
assert.ok(r.blockers.includes('batch2_archive_evidence_not_materialized'));
assert.ok(r.blockers.includes('first100_canonical_provenance_not_ready'));
assert.ok(r.blockers.includes('first100_production_queue_not_ready'));
assert.equal(r.phases.apiFastPath,'v3_one_rpc_ready_not_live');
assert.equal(r.phases.doseCore,'shared_core_runtime_hardened');
assert.equal(r.phases.cacheOffline,'implemented_indexeddb_etag');
assert.equal(r.phases.frontend,'shared_core_fast_flow_ready');
assert.ok(r.blockers.includes('drx_safety_ci_not_observed'));
assert.ok(r.blockers.includes('full_ci_not_green'));
assert.ok(r.blockers.includes('desktop_smoke_not_green'));
assert.ok(r.blockers.includes('mobile_smoke_not_green'));
assert.equal(
  r.blockers.includes('vercel_deploy_not_green'),
  observation.vercelDeploymentGreen!==true,
  'Vercel blocker must follow the recorded, commit-bound deployment observation.'
);
assert.ok(r.blockers.includes('rollback_not_tested'));
assert.ok(r.blockers.includes('legacy_consumers_not_zero'));
console.log('DRx final release gate correctly remains fail-closed.');
