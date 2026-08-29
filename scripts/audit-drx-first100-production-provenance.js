'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_ID = 'ftuchtmolddhhsdcwnqe';
const HASH = /^[0-9a-f]{64}$/i;

const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function audit(queue, quality) {
  const reasons = [];
  const evidence = queue?.sourceExportEvidence || {};
  const rows = Array.isArray(queue?.queue) ? queue.queue : [];
  const qualityRows = Array.isArray(quality?.rows) ? quality.rows : [];

  if (queue?.publicationAllowed !== false) reasons.push('queue_publication_not_closed');
  if (Number(queue?.queuedCount) !== 100 || rows.length !== 100 || queue?.complete !== true) {
    reasons.push('queue_not_exactly_100_complete');
  }

  if (evidence.projectId !== PROJECT_ID) reasons.push('canonical_supabase_project_not_verified');
  if (!String(evidence.sourceRelation || '').trim()) reasons.push('canonical_supabase_relation_not_verified');
  if (!HASH.test(String(evidence.snapshotSha256 || ''))) reasons.push('canonical_export_hash_not_verified');
  if (!Number.isFinite(Date.parse(String(evidence.exportedAt || '')))) {
    reasons.push('canonical_export_timestamp_not_verified');
  }

  const qualityByKey = new Map(
    qualityRows.map(row => [String(row.canonicalKey || ''), row])
  );
  const unmatchedQuality = rows.filter(row => !qualityByKey.has(String(row.canonicalKey || '')));
  if (unmatchedQuality.length) reasons.push('quality_audit_not_aligned_with_queue');

  const reviewRequired = qualityRows.filter(row => row.canonicalReviewRequired === true).length;
  const discoveryEligible = qualityRows.filter(row => row.sourceDiscoveryEligible === true).length;
  if (reviewRequired !== 0) reasons.push('canonical_quality_review_unresolved');
  if (discoveryEligible !== 100) reasons.push('fewer_than_100_quality_eligible_rows');

  const uniqueKeys = new Set(rows.map(row => String(row.canonicalKey || '')).filter(Boolean));
  if (uniqueKeys.size !== 100) reasons.push('queue_canonical_keys_not_unique');

  return {
    schemaVersion: 'drx-first100-production-provenance-audit-v1',
    productionEligible: reasons.length === 0,
    publicationAllowed: false,
    reasons,
    metrics: {
      queuedRows: rows.length,
      uniqueCanonicalKeys: uniqueKeys.size,
      qualityRows: qualityRows.length,
      canonicalReviewRequired: reviewRequired,
      sourceDiscoveryEligible: discoveryEligible,
      supabaseProjectVerified: evidence.projectId === PROJECT_ID,
      exportHashVerified: HASH.test(String(evidence.snapshotSha256 || '')),
    },
    source: queue?.source || null,
    sourceExportEvidence: evidence,
  };
}

function build() {
  return audit(
    read('data/drx-first100-source-discovery-queue-v1.json'),
    read('data/drx-first100-canonical-quality-audit-v1.json')
  );
}

if (require.main === module) {
  const result = build();
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--require-production') && !result.productionEligible) {
    process.exitCode = 1;
  }
}

module.exports = { PROJECT_ID, audit, build };
