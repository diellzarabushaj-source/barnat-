'use strict';

const { createHash } = require('node:crypto');
const legacyRevisions = require('../data/recetat-clinical-revisions-16-22.json');
const datasets = [
  require('../data/recetat-clinical-revisions-1-5.json'),
  require('../data/recetat-clinical-revisions-6-10.json'),
  require('../data/recetat-clinical-revisions-11-15.json'),
  require('../data/recetat-clinical-revisions-16-20.json'),
  // Chapters 16–20 now use the complete dataset above. Retain the already
  // published 21–22 records unchanged, without republishing their clinical data.
  {...legacyRevisions,guides:Object.fromEntries(Object.entries(legacyRevisions.guides)
    .filter(([,plan])=>Number(plan.key.split('.')[0])>=21))},
];
const revisions = new Map();
for (const dataset of datasets) for (const [id, revision] of Object.entries(dataset.guides)) {
  if (revisions.has(id)) throw new Error(`Duplicate prescription clinical revision: ${id}`);
  revisions.set(id, {...revision,version:dataset.version,checkedAt:dataset.checkedAt});
}

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
  const revision = revisions.get(guide?._id);
  if (!revision || guide?.reviewStatus !== 'verified') return guide;
  if (sourceFingerprint(guide) !== revision.sourceFingerprint) {
    return {...guide, clinicalPlan:{version:revision.version,status:'source-changed',groups:[],
      notes:['Përmbajtja është përditësuar dhe skema duhet rikontrolluar.'],references:revision.references}};
  }
  return {...guide, clinicalPlan:{...revision}};
}

function forPrescriptionReader(guide, reader) {
  const enriched = withPrescriptionClinicalPlan(guide);
  if (enriched.clinicalPlan?.doseInputs?.length && reader !== 'clinical-v3') {
    const {clinicalPlan,...legacy}=enriched;
    return {...legacy,authoringReviewStatus:guide.reviewStatus,reviewStatus:'source-imported'};
  }
  if (!enriched.clinicalPlan || reader === 'clinical-v3' || reader === 'clinical-v2' || (reader === 'clinical-v1' && !enriched.clinicalPlan.confirmation)) return enriched;
  // Cached v32 readers know the source-imported gate but cannot represent
  // nested complete regimens. Preserve the authoring status separately and
  // refuse legacy draft transfer until the current reader is loaded.
  // A v33 reader renders clinicalPlan before inspecting reviewStatus, so an
  // unsupported plan must be omitted as well as gated by the legacy status.
  const {clinicalPlan, ...legacy} = enriched;
  return {...legacy,authoringReviewStatus:guide.reviewStatus,reviewStatus:'source-imported'};
}

module.exports = { sourceFingerprint, withPrescriptionClinicalPlan, forPrescriptionReader };
