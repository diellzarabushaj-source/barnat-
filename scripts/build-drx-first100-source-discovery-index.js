'use strict';
const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const WAVE_FILES=['a','b','c'].map(x=>'data/drx-first100-source-discovery-wave-'+x+'-v1.json');

function build(){
 const queue=read('data/drx-first100-source-discovery-queue-v1.json');
 const quality=read('data/drx-first100-canonical-quality-audit-v1.json');
 const provenance=read('data/drx-first100-production-provenance-audit-v1.json');
 const queueKeys=new Set(queue.queue.map(x=>x.canonicalKey));
 const reviewKeys=new Set(quality.rows.filter(x=>x.canonicalReviewRequired).map(x=>x.canonicalKey));
 const rows=[];const seen=new Set();const issues=[];
 for(const file of WAVE_FILES){
   const w=read(file);
   for(const row of w.rows||[]){
     if(seen.has(row.canonicalKey)) issues.push({canonicalKey:row.canonicalKey,issue:'duplicate_wave_key'});
     seen.add(row.canonicalKey);
     if(!queueKeys.has(row.canonicalKey)) issues.push({canonicalKey:row.canonicalKey,issue:'not_in_first100_queue'});
     if(reviewKeys.has(row.canonicalKey)&&row.status.startsWith('verified_')) issues.push({canonicalKey:row.canonicalKey,issue:'canonical_review_bypassed'});
     if(row.status.startsWith('verified_')){
       if(row.sourceTier!=='EMC') issues.push({canonicalKey:row.canonicalKey,issue:'unexpected_tier'});
       if(!/^https:\/\/www\.medicines\.org\.uk\/emc\//.test(row.url||'')) issues.push({canonicalKey:row.canonicalKey,issue:'invalid_emc_url'});
       if(row.section41Present!==true||row.section42Present!==true) issues.push({canonicalKey:row.canonicalKey,issue:'sections_not_verified'});
     }
     rows.push({...row,wave:path.basename(file)});
   }
 }
 const verified=rows.filter(x=>x.status.startsWith('verified_'));
 const selection=rows.filter(x=>x.status==='product_selection_required');
 const eligibleTotal=quality.sourceDiscoveryEligible;
 const repositoryComplete=issues.length===0&&verified.length===eligibleTotal&&selection.length===0;
 const canonicalProductionProvenanceEligible=provenance.productionEligible===true;
 const productionBlockers=[
   ...(repositoryComplete?[]:['source_discovery_incomplete']),
   ...(!canonicalProductionProvenanceEligible?(provenance.reasons||['canonical_provenance_not_verified']):[])
 ];
 return {
   schemaVersion:'drx-first100-source-discovery-index-v1',
   generatedAt:new Date().toISOString(),
   first100Count:queue.queuedCount,
   canonicalReviewRequired:quality.canonicalReviewRequired,
   sourceDiscoveryEligible:eligibleTotal,
   verifiedProductSpecific:verified.length,
   productSelectionRequired:selection.length,
   eligibleRemaining:Math.max(0,eligibleTotal-verified.length),
   issueCount:issues.length,
   complete:repositoryComplete,
   repositoryComplete,
   canonicalProductionProvenanceEligible,
   productionDiscoveryAllowed:repositoryComplete&&canonicalProductionProvenanceEligible,
   productionBlockers:[...new Set(productionBlockers)],
   publicationAllowed:false,
   issues,
   rows
 };
}
if(require.main===module){
 const x=build();
 fs.writeFileSync(path.join(ROOT,'data/drx-first100-source-discovery-index-v1.json'),JSON.stringify(x,null,2)+'\n');
 console.log(JSON.stringify({verified:x.verifiedProductSpecific,selection:x.productSelectionRequired,remaining:x.eligibleRemaining,issues:x.issueCount},null,2));
 if(x.issueCount) process.exitCode=1;
}
module.exports={build,WAVE_FILES};
