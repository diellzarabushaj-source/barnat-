'use strict';

const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));

function decisionsFor(reasons=[]){
  const out=new Set(['confirm_indication_scope','confirm_product_formulation_route','confirm_dose_structure_from_smpc_4_2']);
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
 const byKey=new Map(batch.substances.map(x=>[x.canonicalKey,x]));
 const packets=q.rows.map(row=>{
   const item=byKey.get(row.canonicalKey)||{};
   return {
     reviewKey:row.reviewKey,
     canonicalKey:row.canonicalKey,
     productName:row.productName,
     sourceKey:row.sourceKey,
     sourceUrl:item.url||null,
     documentDate:item.documentDate||null,
     priority:row.priority,
     reasons:row.reasons,
     requiredDecisions:decisionsFor(row.reasons),
     status:'pending_clinical_review',
     reviewer:null,
     reviewedAt:null,
     decision:null,
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
