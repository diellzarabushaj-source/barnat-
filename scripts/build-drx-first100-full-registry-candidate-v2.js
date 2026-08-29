'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const stable=v=>String(v??'').normalize('NFC').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');

const SUSPICIOUS=[
 ['IMPORT_TOKEN_2H20',/\b2h20\b/i],
 ['TYPO_BESILATE2',/\bbesilate2\b/i],
 ['TYPO_PANCEATIN',/\bpanceatin\b/i],
 ['TYPO_EQUIVALNT',/\bequivalnt\b/i],
 ['IMPORT_TOKEN_EQUTO',/\bequto\b/i],
 ['TYPO_CLORUR',/\bclorur\b/i],
 ['IMPORT_TOKEN_APPROPRIATE',/\bappropriate\b/i],
 ['GENERIC_COMBINATIONS_LABEL',/\bcombinations\b/i],
 ['GENERIC_AMINOACIDS_LABEL',/^aminoacids$/i],
 ['GENERIC_VITAMIN_LABEL',/^vitamins?$/i],
 ['GENERIC_SOLUTION_LABEL',/\bsolution$/i],
 ['POSSIBLE_EXCIPIENT_NOISE',/\b(?:microcrystalline cellulose|sugar spheres|stearate)\b/i],
 ['POSSIBLE_HYDRATION_NOISE',/\b(?:hexahydrate|heptahydrate|dodecahydrate|tetrahydrate|pentahydrated)\b/i],
 ['POSSIBLE_EQUIVALENCE_NOISE',/\bequivalent\b/i],
];

function coveredKeys(){
 const b1=read('data/drx-dose-batch1-v1.json');
 const b2=read('data/drx-dose-batch2-v1.json');
 const old=read('data/drx-first100-source-discovery-queue-v1.json');
 return new Set([
  ...(b1.substances||[]).map(x=>stable(x.canonicalKey||x.key||x.name)),
  ...(b2.substances||[]).map(x=>stable(x.canonicalKey||x.key||x.name)),
  ...Object.keys(old.reviewedCoveredAliases||{}).map(stable),
 ].filter(Boolean));
}

function transform(){
 const source=read('data/drx-registry-substance-full-fallback-v1.json');
 const decisions=read('data/drx-first100-canonical-review-decisions-v1.json');
 const covered=coveredKeys();
 const dm=new Map((decisions.decisions||[]).map(d=>[d.canonicalKey,d]));
 const output=[];
 for(const raw of source.rows||[]){
   if(covered.has(raw.canonicalKey)) continue;
   const d=dm.get(raw.canonicalKey);
   if(d?.queueDisposition==='dedupe_existing_canonical'||d?.queueDisposition==='remove_product_level_mixture') continue;
   let row={...raw};
   if(d?.queueDisposition==='replace_with_clean_canonical'){
     row={...row,canonicalKey:d.resolvedCanonicalKey,canonicalName:d.resolvedCanonicalName,reconciledFrom:raw.canonicalKey};
   }else if(d?.queueDisposition==='requires_product_selection'){
     row={...row,canonicalKey:d.resolvedCanonicalKey,canonicalName:d.resolvedCanonicalName,reconciledFrom:raw.canonicalKey,productSelectionRequired:true};
   }
   if(!row.canonicalKey||!row.canonicalName||covered.has(row.canonicalKey)) continue;
   const componentCount=String(row.canonicalName).split(/\\s*\\+\\s*/).filter(Boolean).length;
   const flags=SUSPICIOUS.filter(([,re])=>re.test(row.canonicalName)).map(([code])=>code);
   if(componentCount>4) flags.push('HIGH_COMPONENT_COUNT_REVIEW');
   output.push({...row,componentCount,qualityFlags:[...new Set(flags)]});
 }
 const seen=new Set();
 return output
   .sort((a,b)=>a.canonicalKey.localeCompare(b.canonicalKey,'en')||Number(a.sourceRow)-Number(b.sourceRow))
   .filter(row=>{if(seen.has(row.canonicalKey)) return false;seen.add(row.canonicalKey);return true;});
}

function build(limit=100){
 const all=transform();
 const old=read('data/drx-first100-source-discovery-queue-v1.json');
 const oldKeys=new Set((old.queue||[]).map(x=>x.canonicalKey));
 const queue=all.slice(0,limit).map((row,index)=>({
   ordinal:index+1,
   ...row,
   status:row.productSelectionRequired?'product_selection_required':(row.qualityFlags.length?'canonical_review_required':'source_discovery_pending'),
   provenance:'registry_full_fallback_not_supabase_canonical',
   publicationAllowed:false,
 }));
 const counts={
   queued:queue.length,
   clean:queue.filter(x=>x.status==='source_discovery_pending').length,
   canonicalReviewRequired:queue.filter(x=>x.status==='canonical_review_required').length,
   productSelectionRequired:queue.filter(x=>x.status==='product_selection_required').length,
   overlapWithLegacyFirst100:queue.filter(x=>oldKeys.has(x.canonicalKey)).length,
   newVsLegacyFirst100:queue.filter(x=>!oldKeys.has(x.canonicalKey)).length,
 };
 return {
  schemaVersion:'drx-first100-full-registry-candidate-v2',
  generatedAt:new Date().toISOString(),
  source:'data/drx-registry-substance-full-fallback-v1.json',
  ordering:'full_registry_final_canonical_key_ascending',
  productionCanonicalExportVerified:false,
  productionEligible:false,
  publicationAllowed:false,
  counts,
  queue
 };
}
if(require.main===module){
 const x=build(100);
 fs.writeFileSync(path.join(ROOT,'data/drx-first100-full-registry-candidate-v2.json'),JSON.stringify(x,null,2)+'\n');
 console.log(JSON.stringify(x.counts,null,2));
 if(x.queue.length!==100) process.exitCode=1;
}
module.exports={build,transform,SUSPICIOUS,stable};
