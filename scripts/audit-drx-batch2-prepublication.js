'use strict';

const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));

function audit(){
  const matrix=read('data/drx-batch2-readiness-matrix-v1.json');
  const gate=read('data/drx-publication-gate-v3-policy.json');
  const issues=[];

  if(gate.failClosed!==true) issues.push('publication_gate_not_fail_closed');
  if(gate.bulkImporterMayPublish!==false) issues.push('bulk_importer_may_publish');
  if(matrix.total!==25) issues.push('batch2_total_not_25');
  if(matrix.publicationReady!==0) issues.push('unexpected_publication_ready_rows');
  if(matrix.normalizationReady!==0) issues.push('unexpected_normalization_ready_rows');
  if(matrix.blockedByArchiveHash!==25) issues.push('archive_block_not_25');
  if(matrix.blockedByClinicalReview!==25) issues.push('review_block_not_25');
  if(matrix.blockedByProductBinding!==25) issues.push('binding_block_not_25');
  if(matrix.blockedBySafety!==25) issues.push('safety_block_not_25');

  const required=[
    'publication_eligible_source_tier',
    'source_snapshot_sha256_present',
    'source_snapshot_equals_evidence_hash',
    'source_section_is_4_2',
    'source_section_sha256_present',
    'source_section_hash_matches_persisted_artifact',
    'product_binding_exact',
    'required_renal_adjustments_verified_if_required',
    'required_hepatic_adjustments_verified_if_required',
    'legacy_comparison_clean',
    'safety_validation_passed',
    'reviewer_audit_complete',
    'no_open_clinical_review'
  ];
  for(const item of required) if(!gate.publishWhenAll.includes(item)) issues.push('publication_gate_missing:'+item);

  return {
    schemaVersion:'drx-batch2-prepublication-audit-v1',
    checkedAt:new Date().toISOString(),
    total:25,
    publishable:0,
    blocked:25,
    pass:issues.length===0,
    publicationAllowed:false,
    issues
  };
}
if(require.main===module){
 const r=audit(); console.log(JSON.stringify(r,null,2)); if(!r.pass) process.exitCode=1;
}
module.exports={audit};
