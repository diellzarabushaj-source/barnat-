'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SourcePolicy = require('./dose-source-policy.js');

const DEFAULT_MAP_PATH = path.join(__dirname, '..', 'data', 'drx-dose-source-map-v1.json');

function clean(value) {
  return String(value ?? '').trim();
}

function loadSourceMap(filePath = DEFAULT_MAP_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateCandidate(candidate, policy = SourcePolicy.loadPolicy()) {
  const ranked = SourcePolicy.rankCandidate(candidate, policy);
  const declaredTier = clean(candidate?.tier);
  const errors = [];

  if (!clean(candidate?.sourceKey)) errors.push('source_key_missing');
  if (!ranked.tier) errors.push('source_tier_unresolved');
  if (ranked.tier && declaredTier && declaredTier !== ranked.tier.key) errors.push('declared_tier_mismatch');
  if (!clean(candidate?.documentType)) errors.push('document_type_missing');
  if (candidate?.hasDoseSection !== true) errors.push('dose_section_not_confirmed');
  if (candidate?.substanceMatch !== true && candidate?.productMatch !== true) errors.push('identity_not_confirmed');

  const hasDocumentVersion = Boolean(clean(candidate?.documentVersion) || clean(candidate?.documentDate));
  const authoritative = Boolean(ranked.tier?.autoPublishEligible);
  const archiveReady = authoritative && ranked.accepted && !errors.includes('declared_tier_mismatch');
  const publicationReady = archiveReady && hasDocumentVersion && ranked.publicationEligible;

  return {
    candidate:{ ...candidate, url:ranked.url || clean(candidate?.url) },
    ranked,
    errors,
    valid:errors.length === 0 && ranked.accepted,
    authoritative,
    hasDocumentVersion,
    archiveReady,
    publicationReady,
  };
}

function validateSubstance(key, entry, policy = SourcePolicy.loadPolicy()) {
  const candidates = Array.isArray(entry?.candidates) ? entry.candidates : [];
  const seen = new Set();
  const validations = candidates.map(candidate => {
    const result = validateCandidate(candidate, policy);
    const sourceKey = clean(candidate?.sourceKey);
    if (sourceKey && seen.has(sourceKey)) result.errors.push('duplicate_source_key');
    if (sourceKey) seen.add(sourceKey);
    result.valid = result.errors.length === 0 && result.ranked.accepted;
    result.archiveReady = result.archiveReady && !result.errors.includes('duplicate_source_key');
    result.publicationReady = result.publicationReady && !result.errors.includes('duplicate_source_key');
    return result;
  });

  return {
    key,
    canonicalKey:clean(entry?.canonicalKey),
    canonicalName:clean(entry?.canonicalName),
    candidateCount:validations.length,
    archiveReadyCount:validations.filter(item => item.archiveReady).length,
    publicationReadyCount:validations.filter(item => item.publicationReady).length,
    validations,
  };
}

function validateSourceMap(map, policy = SourcePolicy.loadPolicy()) {
  const substances = map?.substances && typeof map.substances === 'object' ? map.substances : {};
  const results = Object.entries(substances).map(([key, entry]) => validateSubstance(key, entry, policy));
  const errors = [];

  if (map?.schemaVersion !== 'drx-dose-source-map-v1') errors.push('schema_version_invalid');
  if (!results.length) errors.push('substance_map_empty');

  for (const item of results) {
    if (!item.canonicalKey) errors.push(`${item.key}:canonical_key_missing`);
    if (!item.canonicalName) errors.push(`${item.key}:canonical_name_missing`);
    for (const validation of item.validations) {
      for (const error of validation.errors) errors.push(`${item.key}:${validation.candidate?.sourceKey || 'unknown'}:${error}`);
    }
  }

  return {
    schemaVersion:'drx-dose-source-map-validation-v1',
    valid:errors.length === 0,
    errors,
    substances:results,
    summary:{
      substances:results.length,
      candidates:results.reduce((n, item) => n + item.candidateCount, 0),
      archiveReady:results.reduce((n, item) => n + item.archiveReadyCount, 0),
      publicationReady:results.reduce((n, item) => n + item.publicationReadyCount, 0),
    },
  };
}

function archiveQueue(map, policy = SourcePolicy.loadPolicy()) {
  const validation = validateSourceMap(map, policy);
  const queue = [];
  for (const substance of validation.substances) {
    for (const item of substance.validations) {
      if (!item.archiveReady) continue;
      const status = clean(item.candidate?.status).toLowerCase();
      if (['archived','parsed','verified','published'].includes(status)) continue;
      queue.push({
        canonicalKey:substance.canonicalKey,
        canonicalName:substance.canonicalName,
        sourceKey:item.candidate.sourceKey,
        url:item.candidate.url,
        tier:item.ranked.tier.key,
        documentType:item.candidate.documentType,
        documentDate:item.candidate.documentDate || null,
        documentVersion:item.candidate.documentVersion || null,
        publicationReady:item.publicationReady,
      });
    }
  }
  return queue.sort((a, b) =>
    SourcePolicy.sourceTierForUrl(a.url).rank - SourcePolicy.sourceTierForUrl(b.url).rank
    || a.canonicalKey.localeCompare(b.canonicalKey)
    || a.sourceKey.localeCompare(b.sourceKey)
  );
}

function publicationCandidates(map, policy = SourcePolicy.loadPolicy()) {
  const validation = validateSourceMap(map, policy);
  return validation.substances.flatMap(substance =>
    substance.validations
      .filter(item => item.publicationReady)
      .map(item => ({
        canonicalKey:substance.canonicalKey,
        canonicalName:substance.canonicalName,
        sourceKey:item.candidate.sourceKey,
        candidate:item.candidate,
        rankScore:item.ranked.rankScore,
      }))
  ).sort((a, b) => a.rankScore - b.rankScore || a.sourceKey.localeCompare(b.sourceKey));
}

module.exports = {
  DEFAULT_MAP_PATH,
  loadSourceMap,
  validateCandidate,
  validateSubstance,
  validateSourceMap,
  archiveQueue,
  publicationCandidates,
  _test:{ clean },
};
