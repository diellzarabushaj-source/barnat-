'use strict';

const assert = require('node:assert/strict');
const Coverage = require('../scripts/build-drx-dose-coverage-v2.js');
const observation = require('../data/drx-release-observation-v1.json');

const snapshot = Coverage.build();
assert.equal(snapshot.schemaVersion, 'drx-dose-coverage-snapshot-v2');
assert.equal(snapshot.publicationAllowed, false);
assert.equal(snapshot.counts.batch1Substances, 10);
assert.equal(snapshot.counts.batch2Substances, 25);
assert.equal(snapshot.counts.mappedSources, 35);
assert.equal(snapshot.counts.exactProductBound, 0);
assert.equal(snapshot.counts.legacyCompared, 0);
assert.equal(snapshot.counts.clinicallyReviewed, 0);
assert.equal(snapshot.counts.published, 0);
assert.equal(snapshot.counts.liveWebEvidenceStructured, 25);
assert.equal(snapshot.counts.batch2SourceMetadataVerified, 25);
assert.equal(snapshot.counts.batch2ArchiveSnapshots, 0);
assert.equal(snapshot.counts.first100QueueMaterialized, 100);
assert.equal(snapshot.counts.first100CanonicalReviewRequired, 14);
assert.equal(snapshot.counts.first100SourceDiscoveryEligible, 89);
assert.equal(snapshot.counts.first100VerifiedProductSources, 82);
assert.equal(snapshot.counts.first100SourceDiscoveryRemaining, 6);
assert.equal(snapshot.counts.first100SourceSectionVerificationPending, 0);
assert.equal(snapshot.counts.first100EffectiveSourceDiscoveryEligible, 89);
assert.equal(snapshot.counts.first100ProductSelectionPending, 1);
assert.equal(snapshot.first100ProgressPct.verifiedProductSources, 92.1);
assert.equal(snapshot.batch2ProgressPct.structuredEvidence, 100);
assert.equal(snapshot.batch2ProgressPct.archiveHashes, 0);
assert.equal(snapshot.architecture.v3TableCount, 12);
assert.equal(snapshot.architecture.v3SelfContainedProductShell, true);
assert.equal(snapshot.architecture.v2ProductShellDependency, false);
assert.equal(snapshot.gates.drxSafetyWorkflowConfigured, true);
assert.equal(snapshot.gates.drxSafetyWorkflowRunObserved, false);
assert.equal(
  snapshot.gates.vercelDeploymentGreen,
  observation.vercelDeploymentGreen === true,
  'Coverage must expose the commit-bound Vercel observation.'
);
assert.equal(snapshot.gates.rollbackTested, false);
assert.equal(snapshot.gates.publicationBlocked, true);
console.log('DRx coverage v2 contract passed.');
