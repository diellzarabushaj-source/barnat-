'use strict';

const SourcePolicy = require('./dose-source-policy.js');
const SmPC = require('./smpc-parser.js');
const Indication = require('./indication-normalizer.js');
const Dose = require('./dose-rule-normalizer.js');
const Binding = require('./dose-product-binding.js');
const Combo = require('./dose-combination-basis.js');
const Legacy = require('./dose-legacy-comparator.js');
const Confidence = require('./dose-confidence-engine.js');
const Safety = require('./dose-safety-validator.js');

const GATE_VERSION = 'drx-dose-publication-gate-v1';

function clean(value) {
  return String(value ?? '').trim();
}

function evaluate(bundle = {}) {
  const blockers = [];
  const warnings = [];

  const sourceDecision = bundle.sourceDecision
    || SourcePolicy.publicationDecision(bundle.sourceCandidate || {});
  if (!sourceDecision.allowed) blockers.push('source:' + sourceDecision.reason);

  const extractionDecision = bundle.extractionDecision
    || SmPC.publicationExtractionGate(bundle.parsedSource || {});
  if (!extractionDecision.allowed) blockers.push('extraction:' + extractionDecision.reason);

  const indicationDecision = bundle.indicationDecision
    || Indication.publicationDecision(bundle.indicationText || '', bundle.indicationCatalog);
  if (!indicationDecision.allowed) blockers.push('indication:' + indicationDecision.reason);

  const ruleValidation = bundle.ruleValidation || Dose.validateRule(bundle.rule || {});
  if (!ruleValidation.valid) blockers.push(...ruleValidation.errors.map(code => 'rule:' + code));

  const sourceSnapshot = bundle.sourceSnapshot || {};
  const sourceVersion = clean(
    bundle.sourceVersion
    || bundle.sourceDocumentVersion
    || sourceSnapshot.documentVersion
    || sourceSnapshot.document_version
  );
  const sourceDocumentDate = clean(
    bundle.sourceDocumentDate
    || sourceSnapshot.documentDate
    || sourceSnapshot.document_date
  );
  if (!sourceVersion && !sourceDocumentDate) blockers.push('source:version_or_date_missing');

  const binding = bundle.binding || Binding.bindRuleToProduct(bundle.rule || {}, bundle.product || {});
  if (!binding.valid) blockers.push(...binding.errors.map(code => 'binding:' + code));

  const combinationBasis = bundle.combinationBasis
    || Combo.resolveDoseBasis(bundle.product || {}, bundle.rule || {});
  if (!combinationBasis.valid) blockers.push('combination:' + combinationBasis.reason);

  const legacyComparison = bundle.legacyComparison
    || Legacy.compareRules(bundle.rule || {}, bundle.legacyRule || null);
  if (legacyComparison.status === 'conflict') blockers.push('legacy:conflict');
  if (legacyComparison.status === 'missing') warnings.push('legacy:missing');

  const confidence = bundle.confidence || Confidence.confidence(bundle.confidenceInput || {});
  if (confidence.hardBlockers.length) blockers.push(...confidence.hardBlockers.map(code => 'confidence:' + code));
  if (confidence.reviewClass === 'manual_review') blockers.push('confidence:manual_review');
  if (confidence.reviewClass === 'quick_review') warnings.push('confidence:quick_review');

  const safetyValidation = bundle.safetyValidation || Safety.validatePublicationBundle({
    ruleValidation,
    sourceDecision,
    indicationDecision,
    binding,
    combinationBasis,
    legacyComparison,
    confidence,
    siblingRules:bundle.siblingRules || [bundle.rule].filter(Boolean),
    highRisk:bundle.highRisk === true,
  });
  if (!safetyValidation.publishable) blockers.push(...safetyValidation.blockers.map(code => 'safety:' + code));
  warnings.push(...safetyValidation.warnings.map(code => 'safety:' + code));

  // Bundle-level review metadata is the current publication decision input. Respect
  // an explicit empty value instead of silently falling back to stale rule metadata.
  const verifiedBy = clean(bundle.verifiedBy ?? bundle.rule?.verifiedBy ?? bundle.rule?.verified_by);
  const verifiedAt = clean(bundle.verifiedAt ?? bundle.rule?.verifiedAt ?? bundle.rule?.verified_at);
  if (!verifiedBy) blockers.push('review:verified_by_missing');
  if (!verifiedAt) blockers.push('review:verified_at_missing');

  if (bundle.reviewStatus && clean(bundle.reviewStatus).toLowerCase() !== 'approved') {
    blockers.push('review:not_approved');
  }
  if (bundle.openReviewReasons?.length) blockers.push('review:open_reasons');

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];

  return {
    schemaVersion:GATE_VERSION,
    allowed:uniqueBlockers.length === 0,
    decision:uniqueBlockers.length === 0 ? 'publish' : 'hold',
    blockers:uniqueBlockers,
    warnings:uniqueWarnings,
    evidence:{
      sourceTier:sourceDecision.candidate?.tier?.key || sourceDecision.candidate?.tier || null,
      sourceSnapshotId:ruleValidation.rule?.sourceSnapshotId || null,
      sourceEvidenceHash:ruleValidation.rule?.sourceEvidenceHash || null,
      sourceSection:ruleValidation.rule?.sourceSection || null,
      sourceVersion:sourceVersion || null,
      sourceDocumentDate:sourceDocumentDate || null,
      indicationKey:ruleValidation.rule?.indicationKey || null,
      ruleKey:ruleValidation.rule?.ruleKey || null,
      productKey:binding.productKey || null,
      legacyStatus:legacyComparison.status,
      confidenceScore:confidence.score,
      confidenceClass:confidence.reviewClass,
      verifiedBy:verifiedBy || null,
      verifiedAt:verifiedAt || null,
    },
    components:{
      sourceDecision,
      extractionDecision,
      indicationDecision,
      ruleValidation,
      binding,
      combinationBasis,
      legacyComparison,
      confidence,
      safetyValidation,
    },
  };
}

module.exports = { GATE_VERSION, evaluate };
