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
assert.equal(tracker.currentExecution.liveRlsCoverage, '50/50');
assert.equal(tracker.currentExecution.liveSecurityAdvisorErrors, 0);
assert.ok(!tracker.currentExecution.releaseBlockers.includes('supabase_data_plane_down'));

// Live is behind the repository by the migration that was in flight at the crash.
const drift = tracker.currentExecution.migrationDrift;
assert.equal(drift.repositoryCount - drift.liveCount, drift.missingLive.length);
assert.equal(drift.mustReapplyBeforeV3, true);
assert.ok(tracker.currentExecution.releaseBlockers.includes('migration_drift_phase5_missing'));
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
assert.ok(network.blocks.includes('batch2_archive_evidence_not_materialized'));
assert.equal(tracker.currentExecution.archiveBlockedByNetworkPolicy, true);
// A real archive run has been observed in CI, where egress is permitted.
// Repo-side hash count stays 0 because those artifacts are not committed.
assert.equal(tracker.currentExecution.archiveWorkflowRunObserved, true);
assert.equal(tracker.currentExecution.archiveEvidenceLocation, 'ci_artifact_only_not_committed');
assert.equal(tracker.currentExecution.archiveCiSectionHashVerifiedCount, 25);
const ciEvidence = tracker.currentExecution.archiveCiEvidence;
assert.equal(ciEvidence.conclusion, 'success');
assert.equal(ciEvidence.extraction.extractedCount, 25);
assert.equal(ciEvidence.extraction.failedCount, 0);
assert.equal(ciEvidence.verification.sectionHashVerifiedCount, 25);
assert.equal(ciEvidence.verification.publicationAllowed, false);
assert.ok(ciEvidence.runUrl.startsWith('https://github.com/'));
assert.match(tracker.sourceNetworkBlocker.ciExemption, /hash-verified 25\/25 sources/);
assert.ok(tracker.currentExecution.releaseBlockers.includes('batch2_archive_evidence_not_materialized'));

assert.equal(tracker.currentExecution.activeCriticalPhase, 14);
assert.equal(tracker.currentExecution.repositoryImplementationThroughPhase, 32);
assert.equal(tracker.phases.find(p => p.id === 14).status, 'BLOCKED_DB_GATEWAY_CANDIDATE_HARDENED');
assert.equal(tracker.phases.find(p => p.id === 15).status, 'IN_PROGRESS');
assert.match(tracker.phases.find(p => p.id === 16).status, /^IN_PROGRESS/);
assert.equal(tracker.phases.find(p => p.id === 17).status, 'FIRST100_87_OF_87_REPOSITORY_SOURCE_DISCOVERY_COMPLETE_PRODUCTION_PROVENANCE_BLOCKED');
assert.equal(tracker.currentExecution.phase, 32);
assert.equal(tracker.currentExecution.pilot, 'batch2-25');
assert.equal(tracker.currentExecution.repositoryBatch1Substances, 10);
assert.equal(tracker.currentExecution.repositoryBatch2Substances, 25);
assert.equal(tracker.currentExecution.mappedSources, 35);
assert.equal(tracker.currentExecution.archiveHashVerifiedCount, 0);
assert.equal(tracker.currentExecution.normalizationReady, 0);
assert.equal(tracker.currentExecution.liveBoundRules, 0);
assert.equal(tracker.currentExecution.v3Applied, false);
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
