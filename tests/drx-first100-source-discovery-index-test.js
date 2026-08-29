'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const Index=require('../scripts/build-drx-first100-source-discovery-index.js');
const ROOT=path.resolve(__dirname,'..');
const persisted=JSON.parse(fs.readFileSync(path.join(ROOT,'data','drx-first100-source-discovery-index-v1.json'),'utf8'));
const x=Index.build();

assert.equal(x.first100Count,100);
assert.equal(x.canonicalReviewRequired,13);
assert.equal(x.sourceDiscoveryEligible,88);
assert.equal(x.verifiedProductSpecific,73);
assert.equal(x.productSelectionRequired,1);
assert.equal(x.verifiedCanonicalSubstances,73);
assert.equal(x.sourceAuthorityCounts.EMC,54);
assert.equal(x.sourceAuthorityCounts.AEMPS_CIMA,12);
assert.equal(x.sourceAuthorityCounts.EU_NATIONAL,7);
assert.equal(x.eligibleRemaining,15);
assert.equal(x.sourceLookupRemaining,14);
assert.equal(x.issueCount,0);
assert.equal(x.complete,false);
assert.equal(x.repositoryComplete,false);
assert.equal(x.canonicalProductionProvenanceEligible,false);
assert.equal(x.productionDiscoveryAllowed,false);
assert.equal(x.publicationAllowed,false);
assert.equal(new Set(x.rows.map(r=>r.canonicalKey)).size,x.rows.length);

for(const key of [
  'first100Count','canonicalReviewRequired','sourceDiscoveryEligible',
  'verifiedProductSpecific','verifiedCanonicalSubstances','productSelectionRequired',
  'eligibleRemaining','sourceLookupRemaining','issueCount','complete',
  'repositoryComplete','canonicalProductionProvenanceEligible',
  'productionDiscoveryAllowed','publicationAllowed'
]){
  assert.deepEqual(persisted[key],x[key],key+' persisted index drift');
}
assert.deepEqual(persisted.sourceAuthorityCounts,x.sourceAuthorityCounts);
assert.deepEqual(persisted.productionBlockers,x.productionBlockers);
assert.deepEqual(persisted.issues,x.issues);
assert.deepEqual(persisted.rows.map(r=>r.canonicalKey),x.rows.map(r=>r.canonicalKey));
assert.equal(persisted.rows.some(r=>/wave-[jk]-v1\.json$/.test(String(r.wave||''))),false,'deleted J/K wave rows must not remain in persisted index');
console.log('DRx first-100 source discovery aggregate index parity passed.');
