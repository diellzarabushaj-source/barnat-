'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function build() {
  const batch = read('data/drx-dose-batch2-v1.json');
  const queue = read('data/drx-batch2-clinical-review-queue-v1.json');
  const byKey = new Map(batch.substances.map(x => [x.canonicalKey, x]));

  const rows = queue.rows.map(review => {
    const item = byKey.get(review.canonicalKey);
    const blockers = [];

    if (!item) blockers.push('manifest_missing');
    if (!item?.documentDate) blockers.push('document_version_missing');
    if (item?.section41Present !== true) blockers.push('section_4_1_missing');
    if (item?.section42Present !== true) blockers.push('section_4_2_missing');
    if (review.archiveHashStatus !== 'verified') blockers.push('archive_hash_missing');
    if (review.status !== 'resolved') blockers.push('clinical_review_open');
    if (review.exactProductBindingComplete !== true) blockers.push('exact_product_binding_missing');
    if (review.safetyValidationComplete !== true) blockers.push('safety_validation_missing');

    const structuredCandidateReady =
      Boolean(item?.documentDate)
      && item?.section41Present === true
      && item?.section42Present === true;

    const normalizationReady =
      structuredCandidateReady
      && review.archiveHashStatus === 'verified';

    const publicationReady =
      normalizationReady
      && review.status === 'resolved'
      && review.exactProductBindingComplete === true
      && review.safetyValidationComplete === true
      && blockers.length === 0;

    return {
      canonicalKey:review.canonicalKey,
      productName:review.productName,
      priority:review.priority,
      structuredCandidateReady,
      normalizationReady,
      publicationReady,
      blockers:[...new Set(blockers)],
      publicationAllowed:false
    };
  });

  return {
    schemaVersion:'drx-batch2-readiness-matrix-v1',
    generatedAt:new Date().toISOString(),
    publicationAllowed:false,
    total:rows.length,
    structuredCandidateReady:rows.filter(x => x.structuredCandidateReady).length,
    normalizationReady:rows.filter(x => x.normalizationReady).length,
    publicationReady:rows.filter(x => x.publicationReady).length,
    blockedByArchiveHash:rows.filter(x => x.blockers.includes('archive_hash_missing')).length,
    blockedByClinicalReview:rows.filter(x => x.blockers.includes('clinical_review_open')).length,
    blockedByProductBinding:rows.filter(x => x.blockers.includes('exact_product_binding_missing')).length,
    blockedBySafety:rows.filter(x => x.blockers.includes('safety_validation_missing')).length,
    rows
  };
}

if (require.main === module) {
  const result = build();
  fs.writeFileSync(path.join(ROOT,'data/drx-batch2-readiness-matrix-v1.json'), JSON.stringify(result,null,2)+'\n','utf8');
  console.log(JSON.stringify({
    total:result.total,
    structuredCandidateReady:result.structuredCandidateReady,
    normalizationReady:result.normalizationReady,
    publicationReady:result.publicationReady,
    blockedByArchiveHash:result.blockedByArchiveHash
  },null,2));
}

module.exports = { build };
