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
  if(matrix.total!==25) issues.push('batch2_total_not_25');
  if(matrix.publicationReady!==0) issues.push('unexpected_publication_ready_rows');
  if(matrix.normalizationReady!==0) issues.push('unexpected_normalization_ready_rows');
  if(matrix.blockedByArchiveHash!==25) issues.push('archive_block_not_25');
  if(matrix.blockedByClinicalReview!==25) issues.push('review_block_not_25');
  if(matrix.blockedByProductBinding!==25) issues.push('binding_block_not_25');
  if(matrix.blockedBySafety!==25) issues.push('safety_block_not_25');

  const required=['product_binding_exact','safety_validation_passed','no_open_clinical_review'];
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
