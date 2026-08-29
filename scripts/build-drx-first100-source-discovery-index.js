'use strict';
const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const SourcePolicy=require('../lib/dose-source-policy.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const WAVE_FILES=fs.readdirSync(path.join(ROOT,'data'))
  .filter(name=>/^drx-first100-source-discovery-wave-[a-z]-v1\.json$/.test(name))
  .sort()
  .map(name=>'data/'+name);

function validAuthorityUrl(row){
  const expected=String(row?.sourceTier||'');
  const resolved=SourcePolicy.sourceTierForUrl(String(row?.url||''));
  return Boolean(
    resolved
    && resolved.key===expected
    && ['EMA','EMC','FACHINFO_DE','AEMPS_CIMA','EU_NATIONAL','KOSOVO_AKPPM'].includes(resolved.key)
  );
}

function build(){
 const queue=read('data/drx-first100-source-discovery-queue-v1.json');
 const quality=read('data/drx-first100-canonical-quality-audit-v1.json');
 const provenance=read('data/drx-first100-production-provenance-audit-v1.json');
 const decisions=read('data/drx-first100-canonical-review-decisions-v1.json');
 const resolvedDecisions=(decisions.decisions||[]).filter(d=>d.sourceDiscoveryEligible===true&&d.resolvedCanonicalKey);
 const resolvedTargets=new Set(resolvedDecisions.map(d=>d.resolvedCanonicalKey));
 const resolvedOriginals=new Map(resolvedDecisions.map(d=>[d.canonicalKey,d.resolvedCanonicalKey]));
 const queueKeys=new Set([...queue.queue.map(x=>x.canonicalKey),...resolvedTargets]);
 const reviewKeys=new Set((decisions.decisions||[]).filter(d=>d.sourceDiscoveryEligible!==true).map(d=>d.canonicalKey));
 const effectiveEligibleKeys=new Set([
   ...quality.rows.filter(x=>x.sourceDiscoveryEligible===true).map(x=>x.canonicalKey),
   ...resolvedTargets,
 ]);
 const rows=[];const seen=new Set();const issues=[];
 for(const file of WAVE_FILES){
   const w=read(file);
   for(const row of w.rows||[]){
     if(seen.has(row.canonicalKey)) issues.push({canonicalKey:row.canonicalKey,issue:'duplicate_wave_key'});
     seen.add(row.canonicalKey);
     if(!queueKeys.has(row.canonicalKey)) issues.push({canonicalKey:row.canonicalKey,issue:'not_in_first100_queue'});
     if(reviewKeys.has(row.canonicalKey)&&row.status.startsWith('verified_')) issues.push({canonicalKey:row.canonicalKey,issue:'canonical_review_bypassed'});
     if(resolvedOriginals.has(row.canonicalKey)&&row.status.startsWith('verified_')) issues.push({canonicalKey:row.canonicalKey,issue:'canonical_resolution_not_applied',resolvedCanonicalKey:resolvedOriginals.get(row.canonicalKey)});
     if(row.status.startsWith('verified_')){
       if(!validAuthorityUrl(row)) issues.push({canonicalKey:row.canonicalKey,issue:'invalid_authority_url',sourceTier:row.sourceTier,url:row.url});
       if(row.section41Present!==true||row.section42Present!==true) issues.push({canonicalKey:row.canonicalKey,issue:'sections_not_verified'});
     }
     rows.push({...row,wave:path.basename(file)});
   }
 }
 const verified=rows.filter(x=>x.status.startsWith('verified_'));
 const selection=rows.filter(x=>x.status==='product_selection_required');
 const eligibleTotal=effectiveEligibleKeys.size;
 const verifiedCanonicalSubstances=new Set(verified.map(x=>x.canonicalKey)).size;
 const repositoryComplete=issues.length===0&&verifiedCanonicalSubstances===eligibleTotal&&selection.length===0;
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
   verifiedCanonicalSubstances,
   sourceAuthorityCounts:verified.reduce((acc,row)=>{acc[row.sourceTier]=(acc[row.sourceTier]||0)+1;return acc;},{}),
   productSelectionRequired:selection.length,
   eligibleRemaining:Math.max(0,eligibleTotal-verified.length),
   sourceLookupRemaining:Math.max(0,eligibleTotal-verified.length-selection.length),
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
module.exports={build,WAVE_FILES,validAuthorityUrl};
