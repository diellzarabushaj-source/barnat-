'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const tracker = readJson('data/drx-dosierung-master-plan-status.json');
assert.equal(tracker.schemaVersion, 'drx-dosierung-master-plan-status-v1');
assert.equal(tracker.phases.length, 33);
assert.deepEqual(tracker.phases.map(p => p.id), Array.from({ length:33 }, (_, i) => i));

for (const phase of tracker.phases) {
  assert.equal(typeof phase.status, 'string');
  assert.ok(phase.status.length > 0);
  assert.equal(typeof phase.next, 'string');
}

for (const artifact of [
  'data/drx-dose-source-policy-v1.json',
  'data/drx-dose-source-map-v1.json',
  'lib/dose-source-archive.js',
  'lib/smpc-parser.js',
  'lib/indication-normalizer.js',
  'lib/dose-rule-normalizer.js',
  'lib/dose-product-binding.js',
  'lib/dose-combination-basis.js',
  'lib/dose-legacy-comparator.js',
  'lib/dose-confidence-engine.js',
  'lib/dose-safety-validator.js',
  'data/drx-pilot-ibuprofen-v1.json',
  'data/drx-dose-v3-schema-proposal.json',
]) {
  assert.equal(exists(artifact), true, artifact + ' must exist.');
}

// The data plane was recovered by an operator restart on 2026-08-29.
// The disk-full evidence stays as the historical root cause.
assert.equal(tracker.databaseBlocker.active, false);
assert.match(tracker.databaseBlocker.resolution, /restarted the project/);
assert.match(tracker.databaseBlocker.rootCauseConfirmed, /not a data-size quota/);

const baseline = tracker.databaseBlocker.liveBaseline;
assert.ok(baseline.databaseSizeMb < baseline.freePlanQuotaMb,
  'live database must sit under the Free plan quota.');
assert.equal(baseline.readOnlyMode, 'off');
assert.equal(baseline.publicTables, baseline.rlsEnabledTables,
  'every public table must keep RLS enabled.');
assert.equal(tracker.currentExecution.supabaseSqlGateway, 'live');
assert.equal(tracker.currentExecution.supabaseDataPlaneDown, false);
// Assert full coverage, not a fixed table count: the count legitimately grows
// as migrations land, but every public table must keep RLS enabled.
const rlsCoverage = /^(\d+)\/(\d+)$/.exec(tracker.currentExecution.liveRlsCoverage);
assert.ok(rlsCoverage, 'liveRlsCoverage must read "<enabled>/<total>".');
assert.equal(rlsCoverage[1], rlsCoverage[2], 'every public table must have RLS enabled.');
assert.equal(tracker.currentExecution.liveSecurityAdvisorErrors, 0);
assert.ok(!tracker.currentExecution.releaseBlockers.includes('supabase_data_plane_down'));

// The migration that was in flight at the crash has been applied, so live and
// the repository agree again. It carried a real defect as well as bad luck.
const drift = tracker.currentExecution.migrationDrift;
assert.equal(drift.resolved, true);
assert.equal(drift.liveCount, drift.repositoryCount);
assert.deepEqual(drift.missingLive, []);
assert.equal(drift.mustReapplyBeforeV3, false);
assert.match(drift.defectFound, /collides with sync_runs\.started_at/);
assert.ok(!tracker.currentExecution.releaseBlockers.includes('migration_drift_phase5_missing'));

// Applying it must not have moved clinical data or weakened RLS.
const post = drift.postApplyVerification;
assert.equal(post.drugs, 4015);
assert.equal(post.dosageRegimens, 8104);
assert.equal(post.publicTables, post.rlsEnabledTables);
assert.equal(post.leakedClientGrants, 0);
assert.equal(post.securityAdvisorErrors, 0);
assert.match(tracker.databaseBlocker.likelyCauseEvidence, /No space left on device/);
assert.match(tracker.databaseBlocker.likelyCauseEvidence, /edge_logs stayed live/);

const outage = tracker.databaseBlocker.dataPlaneOutage;
assert.equal(typeof outage, 'object');
assert.ok(Array.isArray(outage.silentSources) && outage.silentSources.length >= 5);
assert.ok(outage.silentSources.includes('postgres_logs'));
assert.ok(outage.silentSources.includes('postgrest_logs'));
assert.deepEqual(outage.liveSources, ['edge_logs']);
assert.ok(new Date(outage.lastEdgeLog) > new Date(outage.lastDatabasePlaneLog),
  'edge plane must outlive the database plane for the outage diagnosis to hold.');

// Batch 2 archive work is blocked by egress policy, not by missing repo code.
// This gate exists so nobody "fixes" the hash gap with hand-authored artifacts.
const network = tracker.sourceNetworkBlocker;
assert.equal(network.active, true);
assert.ok(network.deniedHosts.includes('www.ema.europa.eu:443'));
assert.ok(network.deniedHosts.includes('www.medicines.org.uk:443'));
assert.ok(network.deniedHosts.includes('cima.aemps.es:443'));
assert.match(network.rule, /Do not fabricate/);
assert.ok(network.blocks.includes('batch2_source_sections_not_persisted'));
assert.equal(tracker.currentExecution.archiveBlockedByNetworkPolicy, true);
// A real archive run has been observed in CI, where egress is permitted.
// CI attestation and live V3 snapshot rows now materialize the 25 raw hashes.
assert.equal(tracker.currentExecution.archiveWorkflowRunObserved, true);
assert.equal(tracker.currentExecution.archiveEvidenceLocation, 'repo_attestation_and_supabase_v3_source_snapshots');
assert.equal(tracker.currentExecution.archiveCiSectionHashVerifiedCount, 25);
const ciEvidence = tracker.currentExecution.archiveCiEvidence;
assert.equal(ciEvidence.conclusion, 'success');
assert.equal(ciEvidence.extraction.extractedCount, 25);
assert.equal(ciEvidence.extraction.failedCount, 0);
assert.equal(ciEvidence.verification.sectionHashVerifiedCount, 25);
assert.equal(ciEvidence.verification.publicationAllowed, false);
assert.ok(ciEvidence.runUrl.startsWith('https://github.com/'));
assert.match(tracker.sourceNetworkBlocker.ciExemption, /hash-verified 25\/25 sources/);
assert.ok(tracker.currentExecution.releaseBlockers.includes('batch2_source_sections_not_persisted'));

assert.equal(tracker.currentExecution.activeCriticalPhase, 15);
assert.equal(tracker.currentExecution.repositoryImplementationThroughPhase, 32);
assert.equal(tracker.phases.find(p => p.id === 14).status, 'APPLIED_LIVE_SHADOW_SCHEMA_FAIL_CLOSED');
assert.equal(tracker.phases.find(p => p.id === 15).status, 'IN_PROGRESS');
assert.match(tracker.phases.find(p => p.id === 16).status, /^IN_PROGRESS/);
assert.equal(tracker.phases.find(p => p.id === 17).status, 'FIRST100_87_OF_87_REPOSITORY_SOURCE_DISCOVERY_COMPLETE_PRODUCTION_PROVENANCE_BLOCKED');
assert.equal(tracker.currentExecution.phase, 32);
assert.equal(tracker.currentExecution.pilot, 'batch2-25');
assert.equal(tracker.currentExecution.repositoryBatch1Substances, 10);
assert.equal(tracker.currentExecution.repositoryBatch2Substances, 25);
assert.equal(tracker.currentExecution.mappedSources, 35);
assert.equal(tracker.currentExecution.archiveHashVerifiedCount, 25);
assert.equal(tracker.currentExecution.normalizationReady, 0);
assert.equal(tracker.currentExecution.liveBoundRules, 0);
// V3 is applied live. It is a fail-closed shadow with provenance snapshots only.
assert.equal(tracker.currentExecution.v3Applied, true);
const v3 = tracker.currentExecution.v3LiveVerification;
assert.equal(v3.tables, 12);
assert.equal(v3.rlsEnabledTables, v3.tables, 'every V3 table must have RLS enabled.');
assert.equal(v3.clientWriteGrants, 0, 'clients must never hold write grants on V3.');
assert.equal(v3.securityAdvisorErrors, 0);
assert.equal(v3.totalPublicTables, v3.totalRlsEnabledTables);
for (const [check, result] of Object.entries(v3.failClosedSmoke)) {
  assert.equal(result, true, 'fail-closed smoke must hold: ' + check);
}
assert.equal(v3.v2Untouched.drugs, 4015);
assert.equal(v3.v2Untouched.dosageRegimens, 8104);
assert.equal(v3.contentAfterApply.publishedRules, 0, 'applying schema must publish nothing.');
assert.equal(v3.contentAfterApply.snapshots, 25);
assert.equal(v3.contentAfterApply.sections, 0);
assert.equal(v3.liveMigrationCount, 80);
assert.equal(v3.repositoryMigrationCount, 80);
assert.ok(!tracker.currentExecution.releaseBlockers.includes('supabase_v3_not_applied'));
assert.equal(tracker.currentExecution.releaseReady, false);
assert.equal(tracker.currentExecution.first100ProductionDiscoveryAllowed, false);
assert.equal(tracker.currentExecution.first100VerifiedProductSources, 87);
assert.equal(tracker.currentExecution.first100SourceLookupRemaining, 0);
assert.equal(tracker.currentExecution.first100ProductSelectionRequired, 0);
assert.equal(tracker.currentExecution.first100ProductSelectionPending, 0);
assert.equal(tracker.currentExecution.publicationAllowed, false);

const batch1 = readJson('data/drx-dose-batch1-v1.json');
assert.equal(batch1.substances.length, 10);
assert.equal(batch1.publicationAllowed, false);

console.log('DRx master plan status contract passed.');
