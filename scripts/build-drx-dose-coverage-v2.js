'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const pct = (value, total) => total > 0 ? Number(((Number(value || 0) / total) * 100).toFixed(1)) : 0;

function optional(rel) {
  return exists(rel) ? readJson(rel) : null;
}

function build() {
  const batch1 = readJson('data/drx-dose-batch1-v1.json');
  const batch2 = readJson('data/drx-dose-batch2-v1.json');
  const tracker = readJson('data/drx-dosierung-master-plan-status.json');
  const matrix = readJson('data/drx-batch2-readiness-matrix-v1.json');
  const v3 = readJson('data/drx-dose-v3-supabase-candidate-status.json');
  const release = readJson('data/drx-release-observation-v1.json');
  const batch2Extraction = optional('data/drx-batch2-extraction-index-v1.json');
  const batch2Normalization = optional('data/drx-batch2-normalization-index-v1.json');
  const reviewPackets = optional('data/drx-batch2-review-packets-v1.json');

  const execution = tracker.currentExecution || {};
  const mapped = batch1.substances.length + batch2.substances.length;
  const extracted = batch1.gates?.representativeExtractionCompleteForBatch
    ? batch1.substances.length + Number(batch2Extraction?.extractedCount || 0)
    : Number(batch2Extraction?.extractedCount || 0);
  const normalized = batch1.gates?.structuralNormalizationCheckedForNewPilots
    ? batch1.substances.length + Number(batch2Normalization?.normalizedRuleCount || 0)
    : Number(batch2Normalization?.normalizedRuleCount || 0);

  const batch2Total = Number(matrix.total || batch2.substances.length || 25);
  const archived = Number(execution.archiveHashVerifiedCount || 0);
  const archiveCiVerified = Number(execution.archiveCiSectionHashVerifiedCount || 0);
  const normalizationReady = Number(matrix.normalizationReady || execution.normalizationReady || 0);
  const publicationReady = Number(matrix.publicationReady || execution.publicationReady || 0);
  const bound = Number(execution.liveBoundRules || 0);
  const legacyCompared = Number(execution.legacyComparedRules || 0);
  const clinicallyReviewed = Number(execution.clinicallyReviewedRules || 0);
  const published = Number(execution.publishedRules || 0);
  const reviewEvidenceReady = Number(reviewPackets?.reviewEvidenceReady || 0);
  const renalAdjustmentLiveVerified = Number(execution.renalAdjustmentLiveVerified || 0);
  const hepaticAdjustmentLiveVerified = Number(execution.hepaticAdjustmentLiveVerified || 0);

  return {
    schemaVersion:'drx-dose-coverage-snapshot-v2',
    generatedAt:new Date().toISOString(),
    publicationAllowed:false,
    counts:{
      batch1Substances:batch1.substances.length,
      batch2Substances:batch2.substances.length,
      mappedSources:mapped,
      extractedSubstances:extracted,
      normalizedSubstances:normalized,
      exactProductBound:bound,
      legacyCompared,
      clinicallyReviewed,
      published,
      liveWebEvidenceStructured:Number(execution.webEvidenceStructuredSources || 0),
      batch2SourceMetadataVerified:Number(execution.batch2SourceMetadataVerified || 0),
      batch2ArchiveSnapshots:archived,
      batch2ArchiveCiVerified:archiveCiVerified,
      openClinicalReviewQueue:Number(execution.reviewQueueItems || 0),
      highPriorityClinicalReviewQueue:Number(execution.highPriorityReviewItems || 0),
      structuredCandidateReady:Number(matrix.structuredCandidateReady || execution.structuredCandidateReady || 0),
      normalizationReady,
      publicationReady,
      reviewPacketsReady:Number(execution.reviewPacketsReady || 0),
      reviewEvidenceReady,
      renalAdjustmentLiveVerified,
      hepaticAdjustmentLiveVerified,
      first100QueueMaterialized:Number(execution.first100QueueMaterialized || 0),
      first100CanonicalReviewRequired:Number(execution.first100CanonicalReviewRequired || 0),
      first100SourceDiscoveryEligible:Number(execution.first100SourceDiscoveryEligible || 0),
      first100EffectiveSourceDiscoveryEligible:Number(execution.first100EffectiveSourceDiscoveryEligible || execution.first100SourceDiscoveryEligible || 0),
      first100VerifiedProductSources:Number(execution.first100VerifiedProductSources || 0),
      first100SourceDiscoveryRemaining:Number(execution.first100SourceDiscoveryRemaining || 0),
      first100SourceSectionVerificationPending:Number(execution.first100SourceSectionVerificationPending || 0),
      first100ProductSelectionPending:Number(execution.first100ProductSelectionPending || 0),
      first100ProductionEligibleRows:Number(execution.first100ProductionEligibleRows || 0)
    },
    batch2ProgressPct:{
      structuredEvidence:pct(execution.webEvidenceStructuredSources, batch2Total),
      archiveHashes:pct(archived, batch2Total),
      archiveCiVerified:pct(archiveCiVerified, batch2Total),
      normalizationReady:pct(normalizationReady, batch2Total),
      exactProductBinding:pct(bound, batch2Total),
      clinicalReview:pct(clinicallyReviewed, batch2Total),
      publicationReady:pct(publicationReady, batch2Total),
      published:pct(published, batch2Total)
    },
    first100ProgressPct:{
      verifiedProductSources:pct(execution.first100VerifiedProductSources, execution.first100EffectiveSourceDiscoveryEligible || execution.first100SourceDiscoveryEligible),
      discoveryRemaining:pct(execution.first100SourceDiscoveryRemaining, execution.first100EffectiveSourceDiscoveryEligible || execution.first100SourceDiscoveryEligible),
      canonicalReviewBlocked:pct(execution.first100CanonicalReviewRequired, execution.first100QueueMaterialized)
    },
    architecture:{
      v3CandidateReady:execution.v3CandidateReady === true,
      v3Applied:v3.applied === true,
      v3TableCount:Number(v3.tableCount || 0),
      v3SelfContainedProductShell:v3.selfContainedV3ProductShell === true,
      v2ProductShellDependency:v3.v2ProductShellDependency === true,
      oneRpcFastPathConfigured:true,
      sharedDoseCoreConfigured:true,
      adjustmentAwareDoseRuntimeConfigured:true,
      provenanceBoundOfflineCacheConfigured:true,
      requiredAdjustmentPublicationGateConfigured:v3.security?.adjustmentRequiredPublicationGate === true,
      requiredAdjustmentRuntimeGateConfigured:v3.security?.adjustmentRequiredRuntimeGate === true
    },
    gates:{
      supabaseLiveAvailable:['available','live'].includes(execution.supabaseSqlGateway),
      batch2ExtractionArtifactPresent:Boolean(batch2Extraction),
      batch2NormalizationArtifactPresent:Boolean(batch2Normalization),
      batch2LiveWebEvidenceComplete:Number(execution.webEvidenceStructuredSources || 0) === batch2Total,
      archiveWorkflowConfigured:execution.archiveWorkflowReady === true,
      archiveWorkflowRunObserved:execution.archiveWorkflowRunObserved === true,
      archiveCiEvidenceComplete:archiveCiVerified === batch2Total,
      archiveEvidenceMaterialized:archived === batch2Total,
      archiveEvidenceLocation:execution.archiveEvidenceLocation || null,
      drxSafetyWorkflowConfigured:release.drxSafetyWorkflowConfigured === true,
      drxSafetyWorkflowRunObserved:release.drxSafetyWorkflowRunObserved === true,
      drxSafetyWorkflowGreen:release.drxSafetyWorkflowGreen === true,
      fullCiGreen:release.fullCiGreen === true,
      desktopSmokeGreen:release.desktopSmokeGreen === true,
      mobileSmokeGreen:release.mobileSmokeGreen === true,
      vercelDeploymentGreen:release.vercelDeploymentGreen === true,
      rollbackTested:release.rollbackTested === true,
      zeroKnownLegacyConsumers:release.zeroKnownLegacyConsumers === true,
      reviewEvidenceComplete:reviewEvidenceReady === batch2Total,
      renalHepaticLiveValidationObserved:(renalAdjustmentLiveVerified + hepaticAdjustmentLiveVerified) > 0,
      publicationBlocked:true
    },
    next:'CI archive evidence and persisted/materialized archive evidence are reported separately. Promote live/import counts only from repo/DB-readable persisted evidence; binding, review, CI, smoke, deploy and rollback remain fail-closed until observed.'
  };
}

if (require.main === module) {
  const output = build();
  const target = path.join(ROOT, 'data/drx-dose-coverage-snapshot-v2.json');
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

module.exports = { build, _test:{ pct } };
