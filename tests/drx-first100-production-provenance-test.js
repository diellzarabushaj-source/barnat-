'use strict';

const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-drx-first100-production-provenance.js');

const current = Audit.build();
assert.equal(current.productionEligible, false);
assert.equal(current.publicationAllowed, false);
assert.equal(current.metrics.queuedRows, 100);
assert.equal(current.metrics.uniqueCanonicalKeys, 100);
assert.equal(current.metrics.canonicalReviewRequired, 13);
assert.equal(current.metrics.sourceDiscoveryEligible, 87);
assert.equal(current.metrics.supabaseProjectVerified, false);
assert.equal(current.metrics.exportHashVerified, false);
assert.ok(current.reasons.includes('canonical_supabase_project_not_verified'));
assert.ok(current.reasons.includes('canonical_export_hash_not_verified'));
assert.ok(current.reasons.includes('canonical_quality_review_unresolved'));
assert.ok(current.reasons.includes('fewer_than_100_quality_eligible_rows'));

const rows = Array.from({ length: 100 }, (_, index) => ({
  canonicalKey: 'drug' + String(index + 1).padStart(3, '0'),
  publicationAllowed: false,
}));
const qualityRows = rows.map(row => ({
  canonicalKey: row.canonicalKey,
  canonicalReviewRequired: false,
  sourceDiscoveryEligible: true,
}));
const synthetic = Audit.audit({
  complete: true,
  queuedCount: 100,
  publicationAllowed: false,
  queue: rows,
  sourceExportEvidence: {
    projectId: Audit.PROJECT_ID,
    sourceRelation: 'public.substance_concepts_v1',
    exportedAt: '2026-08-29T03:45:00Z',
    snapshotSha256: 'a'.repeat(64),
  },
}, { rows: qualityRows });

assert.equal(synthetic.productionEligible, true, JSON.stringify(synthetic.reasons));
assert.equal(synthetic.metrics.sourceDiscoveryEligible, 100);
assert.equal(synthetic.publicationAllowed, false);

console.log('DRx first-100 production provenance gate passed.');
