'use strict';

const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
function readOptional(rel){
  const p=path.join(ROOT,rel);
  return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;
}

function decisionsFor(reasons=[]){
  const out=new Set(['confirm_indication_scope','confirm_product_formulation_route','confirm_dose_structure_from_smpc_4_2','confirm_source_snapshot_and_section_hash','confirm_exact_product_can_supply_rule','confirm_legacy_comparison','confirm_safety_validation','confirm_reviewer_identity_and_reason']);
  for(const r of reasons){
    if(/renal/.test(r)) out.add('confirm_renal_adjustment_logic');
    if(/hepatic/.test(r)) out.add('confirm_hepatic_adjustment_logic');
    if(/pediatric|age|weight|bsa/.test(r)) out.add('confirm_pediatric_age_weight_bsa_logic');
    if(/titration|monitoring|potassium|glucose|qt/.test(r)) out.add('confirm_monitoring_or_titration_requirements');
    if(/antimicrobial|resistance|susceptibility|malaria/.test(r)) out.add('confirm_antimicrobial_guidance_context');
    if(/bleeding|opioid|high_risk|infusion|oncology/.test(r)) out.add('confirm_high_risk_manual_review');
    if(/product_binding|formulation|split|unscored|starting_dose/.test(r)) out.add('confirm_exact_product_can_supply_rule');
  }
  return [...out];
}

function build(){
 const q=read('data/drx-batch2-clinical-review-queue-v1.json');
 const batch=read('data/drx-dose-batch2-v1.json');
 const extraction=readOptional('data/drx-batch2-extraction-index-v1.json');
 const byKey=new Map(batch.substances.map(x=>[x.canonicalKey,x]));
 const extractionByKey=new Map((extraction?.rows||[]).map(x=>[x.canonicalKey,x]));
 const packets=q.rows.map(row=>{
   const item=byKey.get(row.canonicalKey)||{};
   const extracted=extractionByKey.get(row.canonicalKey)||{};
   const reasons=row.reasons||[];
   const manualReviewRequired=row.priority==='high'||reasons.some(r=>/clinical_review_required|high_risk|opioid|bleeding|antimicrobial|parenteral/.test(r));
   return {
     reviewKey:row.reviewKey,
     canonicalKey:row.canonicalKey,
     productName:row.productName,
     sourceKey:row.sourceKey,
     sourceUrl:item.url||null,
     documentDate:item.documentDate||null,
     sourceSnapshotId:extracted.snapshotId||null,
     sourceSection:'4.2',
     sourceSectionSha256:extracted.section42Sha256||extracted.sectionSha256?.['4.2']||null,
     archiveHashStatus:row.archiveHashStatus||'pending',
     exactProductBindingComplete:row.exactProductBindingComplete===true,
     legacyComparisonComplete:row.legacyComparisonComplete===true,
     safetyValidationComplete:row.safetyValidationComplete===true,
     requiredAdjustmentEvidenceComplete:row.requiredAdjustmentEvidenceComplete===true,
     manualReviewRequired,
     priority:row.priority,
     reasons:row.reasons,
     requiredDecisions:decisionsFor(row.reasons),
     status:'pending_clinical_review',
     reviewerId:null,
     reviewedAt:null,
     decision:null,
     decisionReason:null,
     sourceVersion:item.documentVersion||item.documentDate||null,
     reviewEvidenceReady:false,
     publicationAllowed:false
   };
 });
 return {
   schemaVersion:'drx-batch2-review-packets-v1',
   generatedAt:new Date().toISOString(),
   total:packets.length,
   publicationAllowed:false,
   packets
 };
}
if(require.main===module){
 const r=build();
 fs.writeFileSync(path.join(ROOT,'data/drx-batch2-review-packets-v1.json'),JSON.stringify(r,null,2)+'\n','utf8');
 console.log(JSON.stringify({total:r.total},null,2));
}
module.exports={build,decisionsFor};
