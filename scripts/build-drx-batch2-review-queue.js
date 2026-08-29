'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WAVE_FILES = [1,2,3,4,5].map(n => `data/drx-batch2-live-evidence-wave${n}-v1.json`);

const HIGH = new Set([
  'clinical_review_required',
  'high_risk_antimicrobial',
  'parenteral_high_risk',
  'high_risk_opioid',
  'serum_potassium_required',
  'renal_function_monitoring_required',
  'infusion_rate_required',
  'bleeding_risk_review',
  'hypoglycaemia_risk'
]);

function priorityFor(flags) {
  if (flags.some(x => HIGH.has(x))) return 'high';
  if (flags.some(x => /renal|hepatic|pediatric|titration|monitoring|interaction/.test(x))) return 'medium';
  return 'normal';
}

function build() {
  const rows = [];
  for (const rel of WAVE_FILES) {
    const wave = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const source of wave.sources) {
      const flags = Array.isArray(source.reviewFlags) ? [...new Set(source.reviewFlags)] : [];
      rows.push({
        reviewKey:`batch2:${source.canonicalKey}`,
        batch:'batch2',
        canonicalKey:source.canonicalKey,
        sourceKey:source.sourceKey,
        productName:source.productName,
        priority:priorityFor(flags),
        status:'open',
        reasons:flags,
        archiveHashStatus:source.archiveHashStatus,
        normalizationStatus:source.normalizationStatus,
        exactProductBindingComplete:false,
        legacyComparisonComplete:false,
        safetyValidationComplete:false,
        requiredAdjustmentEvidenceComplete:false,
        sourceSnapshotId:null,
        sourceSection:'4.2',
        sourceSectionSha256:null,
        reviewerId:null,
        reviewedAt:null,
        decision:null,
        decisionReason:null,
        publicationAllowed:false
      });
    }
  }

  rows.sort((a,b) => {
    const rank = {high:0,medium:1,normal:2};
    return rank[a.priority] - rank[b.priority] || a.canonicalKey.localeCompare(b.canonicalKey);
  });

  return {
    schemaVersion:'drx-batch2-clinical-review-queue-v1',
    generatedAt:new Date().toISOString(),
    status:'open',
    publicationAllowed:false,
    total:rows.length,
    open:rows.length,
    highPriority:rows.filter(x => x.priority === 'high').length,
    mediumPriority:rows.filter(x => x.priority === 'medium').length,
    normalPriority:rows.filter(x => x.priority === 'normal').length,
    rows
  };
}

if (require.main === module) {
  const result = build();
  fs.writeFileSync(path.join(ROOT,'data/drx-batch2-clinical-review-queue-v1.json'), JSON.stringify(result,null,2)+'\n','utf8');
  console.log(JSON.stringify({total:result.total,highPriority:result.highPriority,mediumPriority:result.mediumPriority,normalPriority:result.normalPriority},null,2));
}

module.exports = { build, priorityFor };
