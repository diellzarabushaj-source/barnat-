'use strict';

const Dose = require('./dose-rule-normalizer.js');

const SHA256_RE = /^[0-9a-f]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KNOWN_SOURCE_TIERS = new Set([
  'EMA','EMC','FACHINFO_DE','AEMPS_CIMA','EU_NATIONAL',
  'KOSOVO_AKPPM','NON_EU_REGULATOR','MEDIATELY','FALLBACK'
]);

const clean = value => String(value ?? '').trim();

function validSha256(value) {
  return SHA256_RE.test(clean(value));
}

function validUuid(value) {
  return UUID_RE.test(clean(value));
}

function sourceArchiveGate(extraction = {}) {
  const blockers = [];
  const snapshotId = clean(extraction.snapshotId);
  const rawSha256 = clean(extraction.rawSha256);
  const section41Sha256 = clean(extraction.section41Sha256 || extraction.sectionSha256?.['4.1']);
  const section42Sha256 = clean(extraction.section42Sha256 || extraction.sectionSha256?.['4.2']);
  const sourceTier = clean(extraction.sourceTier);
  const finalUrl = clean(extraction.finalUrl);
  const hasVersion = Boolean(clean(extraction.documentVersion) || clean(extraction.documentDate));

  if (!validSha256(snapshotId)) blockers.push('source_snapshot_sha256_invalid');
  if (!validSha256(rawSha256)) blockers.push('raw_snapshot_sha256_invalid');
  if (validSha256(snapshotId) && validSha256(rawSha256) && snapshotId.toLowerCase() !== rawSha256.toLowerCase()) {
    blockers.push('snapshot_raw_hash_mismatch');
  }
  if (!validSha256(section41Sha256)) blockers.push('section_4_1_sha256_invalid');
  if (!validSha256(section42Sha256)) blockers.push('section_4_2_sha256_invalid');
  if (extraction.archiveVerified !== true) blockers.push('archive_raw_reparse_not_verified');
  if (!/^https:\/\//i.test(finalUrl)) blockers.push('final_url_not_https');
  if (!KNOWN_SOURCE_TIERS.has(sourceTier)) blockers.push('source_tier_unknown');
  if (!hasVersion) blockers.push('source_version_or_date_missing');
  if (extraction.section41Present !== true) blockers.push('section_4_1_missing');
  if (extraction.section42Present !== true) blockers.push('section_4_2_missing');
  if (extraction.extractionGate?.allowed !== true) blockers.push('extraction_gate_closed');

  return {
    valid:blockers.length === 0,
    blockers:[...new Set(blockers)],
    snapshotId:snapshotId || null,
    rawSha256:rawSha256 || null,
    section41Sha256:section41Sha256 || null,
    section42Sha256:section42Sha256 || null,
    sourceTier:sourceTier || null,
    finalUrl:finalUrl || null,
  };
}

function draftRulePersistenceGate(bundle = {}) {
  const blockers = [];
  const extraction = sourceArchiveGate(bundle.extraction || {});
  blockers.push(...extraction.blockers.map(code => 'source:' + code));

  if (bundle.productionCanonicalProvenanceVerified !== true) blockers.push('canonical:production_provenance_not_verified');
  if (!validUuid(bundle.substanceConceptId)) blockers.push('canonical:live_substance_concept_id_invalid');
  if (!validUuid(bundle.indicationId)) blockers.push('indication:live_indication_id_invalid');
  if (!validUuid(bundle.drugId)) blockers.push('product:live_drug_id_invalid');

  const binding = bundle.binding || {};
  if (binding.valid !== true) blockers.push('binding:not_valid');
  if (!clean(binding.productKey)) blockers.push('binding:product_key_missing');
  if (!['exact_product','exact_registry_product','exact_drug_id'].includes(clean(binding.matchMethod))) {
    blockers.push('binding:not_exact_live_product');
  }

  const ruleInput = {
    ...(bundle.rule || {}),
    sourceSnapshotId:bundle.rule?.sourceSnapshotId || extraction.snapshotId,
    sourceSectionSha256:bundle.rule?.sourceSectionSha256 || extraction.section42Sha256,
    sourceEvidenceHash:bundle.rule?.sourceEvidenceHash || extraction.rawSha256,
  };
  const ruleValidation = Dose.validateRule(ruleInput);
  if (!ruleValidation.valid) blockers.push(...ruleValidation.errors.map(code => 'rule:' + code));

  const rule = ruleValidation.rule;
  if (clean(rule.sourceKey) !== clean(bundle.extraction?.sourceKey)) blockers.push('rule:source_key_mismatch');
  if (clean(rule.sourceSnapshotId).toLowerCase() !== clean(extraction.snapshotId).toLowerCase()) blockers.push('rule:snapshot_mismatch');
  if (clean(rule.sourceEvidenceHash).toLowerCase() !== clean(extraction.rawSha256).toLowerCase()) blockers.push('rule:evidence_hash_mismatch');
  if (clean(rule.sourceSectionSha256).toLowerCase() !== clean(extraction.section42Sha256).toLowerCase()) blockers.push('rule:section_4_2_hash_mismatch');
  if (rule.sourceSection !== '4.2') blockers.push('rule:source_section_must_be_4_2');
  if (rule.editorialStatus === 'published') blockers.push('rule:bulk_import_cannot_publish');

  return {
    schemaVersion:'drx-v3-draft-persistence-gate-v1',
    ready:blockers.length === 0,
    publicationAllowed:false,
    blockers:[...new Set(blockers)],
    source:extraction,
    ruleValidation,
    liveIdentity:{
      substanceConceptId:clean(bundle.substanceConceptId) || null,
      indicationId:clean(bundle.indicationId) || null,
      drugId:clean(bundle.drugId) || null,
      productKey:clean(binding.productKey) || null,
      matchMethod:clean(binding.matchMethod) || null,
    },
  };
}

function buildEnvelope(bundle = {}) {
  const gate = draftRulePersistenceGate(bundle);
  if (!gate.ready) return { ...gate, envelope:null };

  const extraction = bundle.extraction;
  const rule = gate.ruleValidation.rule;
  const initialEditorialStatus = rule.editorialStatus === 'in_review' ? 'in_review' : 'draft';

  return {
    ...gate,
    envelope:{
      sourceSnapshot:{
        snapshot_id:gate.source.snapshotId,
        source_key:clean(extraction.sourceKey),
        source_url:clean(extraction.requestedUrl || extraction.finalUrl),
        final_url:gate.source.finalUrl,
        source_tier:gate.source.sourceTier,
        authority:clean(extraction.authority),
        jurisdiction:clean(extraction.jurisdiction) || null,
        document_type:clean(extraction.documentType || 'SmPC'),
        document_version:clean(extraction.documentVersion) || null,
        document_date:clean(extraction.documentDate) || null,
        fetched_at:clean(extraction.fetchedAt),
        content_type:clean(extraction.contentType) || null,
        content_length:Number.isFinite(Number(extraction.contentLength)) ? Number(extraction.contentLength) : null,
        raw_sha256:gate.source.rawSha256,
        parser_version:clean(extraction.parserSchemaVersion) || null,
      },
      rule:{
        ...rule,
        substanceConceptId:gate.liveIdentity.substanceConceptId,
        indicationId:gate.liveIdentity.indicationId,
        sourceSnapshotId:gate.source.snapshotId,
        sourceSection:'4.2',
        sourceSectionSha256:gate.source.section42Sha256,
        sourceEvidenceHash:gate.source.rawSha256,
        editorialStatus:initialEditorialStatus,
      },
      binding:{
        drugId:gate.liveIdentity.drugId,
        productKey:gate.liveIdentity.productKey,
        matchMethod:gate.liveIdentity.matchMethod,
        bindingStatus:'candidate',
      },
    },
  };
}

module.exports = {
  sourceArchiveGate,
  draftRulePersistenceGate,
  buildEnvelope,
  _test:{ clean, validSha256, validUuid, SHA256_RE, UUID_RE, KNOWN_SOURCE_TIERS },
};
