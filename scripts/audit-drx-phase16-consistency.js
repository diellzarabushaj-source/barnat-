'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const WAVE_FILES = Object.freeze([
  'data/drx-batch2-live-evidence-wave1-v1.json',
  'data/drx-batch2-live-evidence-wave2-v1.json',
  'data/drx-batch2-live-evidence-wave3-v1.json',
  'data/drx-batch2-live-evidence-wave4-v1.json',
  'data/drx-batch2-live-evidence-wave5-v1.json',
]);

function comparable(value) {
  return value === undefined ? null : value;
}

function parityIssue(issues, key, field, left, right, scope) {
  if (comparable(left) !== comparable(right)) {
    issues.push({
      key,
      issue:`${scope}_${field}_mismatch`,
      expected:left ?? null,
      actual:right ?? null,
    });
  }
}

function audit() {
  const batch2 = read('data/drx-dose-batch2-v1.json');
  const map = read('data/drx-dose-source-map-v1.json');
  const waves = WAVE_FILES.map(read);
  const issues = [];
  const seen = new Set();
  const manifestByKey = new Map();

  for (const item of batch2.substances) {
    if (seen.has(item.canonicalKey)) issues.push({key:item.canonicalKey,issue:'duplicate_batch_key'});
    seen.add(item.canonicalKey);
    manifestByKey.set(item.canonicalKey, item);

    const mapped = map.substances?.[item.canonicalKey];
    if (!mapped) {
      issues.push({key:item.canonicalKey,issue:'missing_source_map_entry'});
      continue;
    }

    const candidate = mapped.candidates?.find(x => x.sourceKey === item.sourceKey);
    if (!candidate) {
      issues.push({key:item.canonicalKey,issue:'source_key_not_found_in_map'});
      continue;
    }

    if (candidate.url !== item.url) issues.push({key:item.canonicalKey,issue:'url_mismatch'});
    if (candidate.tier !== 'EMC') issues.push({key:item.canonicalKey,issue:'unexpected_source_tier'});
    if (candidate.documentType !== 'SmPC') issues.push({key:item.canonicalKey,issue:'unexpected_document_type'});
    if (candidate.hasDoseSection !== true) issues.push({key:item.canonicalKey,issue:'dose_section_not_expected'});
    if (candidate.productSpecific !== true) issues.push({key:item.canonicalKey,issue:'product_specific_flag_missing'});
    if (candidate.substanceMatch !== true) issues.push({key:item.canonicalKey,issue:'substance_match_missing'});
    if (candidate.liveMetadataVerified !== true) issues.push({key:item.canonicalKey,issue:'live_metadata_not_verified'});

    for (const field of ['productName','formulation','route','strength','documentDate','section41Present','section42Present']) {
      parityIssue(issues, item.canonicalKey, field, item[field], candidate[field], 'source_map');
    }

    if (!item.documentDate) issues.push({key:item.canonicalKey,issue:'manifest_document_date_missing'});
    if (!item.productName) issues.push({key:item.canonicalKey,issue:'manifest_product_name_missing'});
    if (item.section41Present !== true) issues.push({key:item.canonicalKey,issue:'manifest_section_4_1_not_verified'});
    if (item.section42Present !== true) issues.push({key:item.canonicalKey,issue:'manifest_section_4_2_not_verified'});
  }

  const waveKeys = new Set();
  let liveEvidenceCount = 0;
  let archiveHashVerifiedCount = 0;

  for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
    const wave = waves[waveIndex];
    const waveNumber = waveIndex + 1;
    if (wave.sourceCount !== 5 || wave.sources?.length !== 5) {
      issues.push({issue:`wave_${waveNumber}_count_not_5`});
    }
    if (wave.publicationAllowed !== false) issues.push({issue:`wave_${waveNumber}_publication_not_closed`});
    if (wave.archiveSnapshotCount !== 0) issues.push({issue:`wave_${waveNumber}_archive_count_must_remain_0_until_hashed`});
    if (wave.normalizedRuleCount !== 0) issues.push({issue:`wave_${waveNumber}_normalized_count_must_remain_0_before_archive`});
    if (wave.completionGate?.archiveHashesComplete !== false) issues.push({issue:`wave_${waveNumber}_archive_gate_not_closed`});

    for (const evidence of wave.sources || []) {
      liveEvidenceCount += 1;
      if (waveKeys.has(evidence.canonicalKey)) {
        issues.push({key:evidence.canonicalKey,issue:'duplicate_live_evidence_key'});
      }
      waveKeys.add(evidence.canonicalKey);

      const manifest = manifestByKey.get(evidence.canonicalKey);
      if (!manifest) {
        issues.push({key:evidence.canonicalKey,issue:'wave_source_not_in_manifest'});
        continue;
      }
      for (const field of ['sourceKey','url','documentDate','productName','section41Present','section42Present']) {
        parityIssue(issues, evidence.canonicalKey, field, manifest[field], evidence[field], 'wave');
      }
      if (evidence.archiveHashStatus !== 'pending') {
        if (/^[0-9a-f]{64}$/i.test(String(evidence.archiveSha256 || ''))) archiveHashVerifiedCount += 1;
        else issues.push({key:evidence.canonicalKey,issue:'archive_hash_status_without_valid_sha256'});
      }
      if (!Array.isArray(evidence.reviewFlags) || evidence.reviewFlags.length === 0) {
        issues.push({key:evidence.canonicalKey,issue:'review_flags_missing'});
      }
      if (!evidence.normalizationStatus) {
        issues.push({key:evidence.canonicalKey,issue:'normalization_status_missing'});
      }
    }
  }

  for (const item of batch2.substances) {
    if (!waveKeys.has(item.canonicalKey)) issues.push({key:item.canonicalKey,issue:'live_evidence_missing'});
  }

  if (batch2.substances.length !== 25) issues.push({issue:'batch2_count_not_25'});
  if (seen.size !== 25) issues.push({issue:'batch2_unique_count_not_25'});
  if (liveEvidenceCount !== 25 || waveKeys.size !== 25) issues.push({issue:'live_evidence_coverage_not_25'});
  if (batch2.gates?.liveWebEvidenceStructuredCount !== 25) issues.push({issue:'manifest_live_web_evidence_count_not_25'});
  if (batch2.gates?.archiveHashVerifiedCount !== 0) issues.push({issue:'manifest_archive_hash_count_must_remain_0'});
  if (map.batch2LiveMetadata?.matchedSourceCount !== 25) issues.push({issue:'source_map_batch2_match_count_not_25'});
  if (map.batch2LiveMetadata?.documentDateCount !== 25) issues.push({issue:'source_map_document_date_count_not_25'});
  if (map.batch2LiveMetadata?.section41VerifiedCount !== 25) issues.push({issue:'source_map_section_4_1_count_not_25'});
  if (map.batch2LiveMetadata?.section42VerifiedCount !== 25) issues.push({issue:'source_map_section_4_2_count_not_25'});
  if (map.batch2LiveMetadata?.archiveHashVerifiedCount !== 0) issues.push({issue:'source_map_archive_hash_count_must_remain_0'});
  if (batch2.publicationAllowed !== false || map.batch2LiveMetadata?.publicationAllowed !== false) {
    issues.push({issue:'publication_gate_open_before_archive_and_review'});
  }

  return {
    schemaVersion:'drx-phase16-consistency-audit-v2',
    checkedAt:new Date().toISOString(),
    targetCount:25,
    checkedCount:batch2.substances.length,
    liveEvidenceCount,
    liveEvidenceUniqueCount:waveKeys.size,
    sourceMapDocumentDateCount:map.batch2LiveMetadata?.documentDateCount ?? 0,
    archiveHashVerifiedCount,
    issueCount:issues.length,
    pass:issues.length === 0,
    publicationAllowed:false,
    issues,
  };
}

if (require.main === module) {
  const result = audit();
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

module.exports = { audit, WAVE_FILES };
