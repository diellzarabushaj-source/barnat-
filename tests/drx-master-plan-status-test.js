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

assert.equal(tracker.databaseBlocker.active, true);
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
assert.ok(network.blocks.includes('batch2_archive_hashes_incomplete'));
assert.equal(tracker.currentExecution.archiveBlockedByNetworkPolicy, true);
assert.equal(tracker.currentExecution.supabaseDataPlaneDown, true);
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
assert.match(tracker.sourceNetworkBlocker.ciExemption, /not behind this workspace egress policy/);
assert.ok(tracker.currentExecution.releaseBlockers.includes('supabase_data_plane_down'));
assert.ok(tracker.currentExecution.releaseBlockers.includes('archive_sources_network_denied'));

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
