'use strict';

const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));

const SUSPICIOUS=[
  {code:'IMPORT_TOKEN_2H20',re:/\b2h20\b/i},
  {code:'TYPO_BESILATE2',re:/\bbesilate2\b/i},
  {code:'TYPO_PANCEATIN',re:/\bpanceatin\b/i},
  {code:'TYPO_EQUIVALNT',re:/\bequivalnt\b/i},
  {code:'IMPORT_TOKEN_EQUTO',re:/\bequto\b/i},
  {code:'TYPO_CLORUR',re:/\bclorur\b/i},
  {code:'IMPORT_TOKEN_APPROPRIATE',re:/\bappropriate\b/i},
  {code:'GENERIC_COMBINATIONS_LABEL',re:/\bcombinations\b/i},
  {code:'GENERIC_AMINOACIDS_LABEL',re:/^aminoacids$/i},
  {code:'GENERIC_VITAMIN_LABEL',re:/^vitamins?$/i},
  {code:'GENERIC_SOLUTION_LABEL',re:/\bsolution$/i},
  {code:'POSSIBLE_EXCIPIENT_NOISE',re:/\b(?:microcrystalline cellulose|sugar spheres|stearate)\b/i},
  {code:'POSSIBLE_HYDRATION_NOISE',re:/\b(?:hexahydrate|heptahydrate|dodecahydrate|tetrahydrate|pentahydrated)\b/i},
  {code:'POSSIBLE_EQUIVALENCE_NOISE',re:/\bequivalent\b/i},
];

function auditName(name){
 const value=String(name||'').trim();
 const flags=SUSPICIOUS.filter(x=>x.re.test(value)).map(x=>x.code);
 const componentCount=value ? value.split(/\s*\+\s*/).length : 0;
 return {
   flags,
   componentCount,
   combination:componentCount>1,
   canonicalReviewRequired:flags.length>0,
   sourceDiscoveryEligible:Boolean(value)&&flags.length===0,
 };
}
function build(){
 const q=read('data/drx-first100-source-discovery-queue-v1.json');
 const rows=q.queue.map(row=>({...row,...auditName(row.canonicalName)}));
 return {
   schemaVersion:'drx-first100-canonical-quality-audit-v1',
   generatedAt:new Date().toISOString(),
   total:rows.length,
   canonicalReviewRequired:rows.filter(x=>x.canonicalReviewRequired).length,
   sourceDiscoveryEligible:rows.filter(x=>x.sourceDiscoveryEligible).length,
   combinations:rows.filter(x=>x.combination).length,
   publicationAllowed:false,
   rows
 };
}
if(require.main===module){
 const r=build();
 fs.writeFileSync(path.join(ROOT,'data/drx-first100-canonical-quality-audit-v1.json'),JSON.stringify(r,null,2)+'\n');
 console.log(JSON.stringify({total:r.total,canonicalReviewRequired:r.canonicalReviewRequired,sourceDiscoveryEligible:r.sourceDiscoveryEligible,combinations:r.combinations},null,2));
}
module.exports={auditName,build,SUSPICIOUS};
