'use strict';

const { createHash } = require('node:crypto');
const revisions = require('../data/recetat-clinical-revisions-1-5.json');

// Compare semantic source fields, independent of GROQ object-key ordering and
// Sanity revisions. A changed source must never inherit an old clinical plan.
function sourceFingerprint(guide) {
  const fields = ['kind','title','genericName','form','strength','dose','route','frequency','duration','sig','note'];
  const value = [String(guide?._id || ''), String(guide?.title || ''),String(guide?.chapterNumber || ''),String(guide?.orderInChapter || ''),
    (guide?.logicBlocks || []).map(block => [
      ...['order','relation','sourceConnectorLabel','condition','selection','note'].map(key => String(block?.[key] || '')),
      (block?.items || []).map(item => ['order',...fields].map(key => String(item?.[key] || ''))),
    ])];
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function withPrescriptionClinicalPlan(guide) {
  const revision = revisions.guides[guide?._id];
  if (!revision || guide?.reviewStatus !== 'verified') return guide;
  if (sourceFingerprint(guide) !== revision.sourceFingerprint) {
    return {...guide, clinicalPlan:{version:revisions.version,status:'source-changed',groups:[],
      notes:['Përmbajtja është përditësuar dhe skema duhet rikontrolluar.'],references:revision.references}};
  }
  return {...guide, clinicalPlan:{...revision,version:revisions.version,checkedAt:revisions.checkedAt}};
}

function forPrescriptionReader(guide, reader) {
  const enriched = withPrescriptionClinicalPlan(guide);
  if (!enriched.clinicalPlan || reader === 'clinical-v1') return enriched;
  // Cached v32 readers know the source-imported gate but cannot represent
  // nested complete regimens. Preserve the authoring status separately and
  // refuse legacy draft transfer until the current reader is loaded.
  return {...enriched,authoringReviewStatus:guide.reviewStatus,reviewStatus:'source-imported'};
}

module.exports = { sourceFingerprint, withPrescriptionClinicalPlan, forPrescriptionReader };
