'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const Policy=require('../lib/dose-source-policy.js');
const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const wave=read('data/drx-first100-source-discovery-wave-i-v1.json');
const quality=read('data/drx-first100-canonical-quality-audit-v1.json');
const prior=['a','b','c','d','e','f','g','h'].flatMap(l=>read('data/drx-first100-source-discovery-wave-'+l+'-v1.json').rows);
assert.equal(wave.verifiedProductSpecificCount,3);
assert.equal(wave.rows.length,3);
assert.equal(wave.publicationAllowed,false);
const eligible=new Set(quality.rows.filter(x=>x.sourceDiscoveryEligible).map(x=>x.canonicalKey));
const priorKeys=new Set(prior.map(x=>x.canonicalKey));
for(const row of wave.rows){
 assert.ok(eligible.has(row.canonicalKey),row.canonicalKey+': not eligible');
 assert.equal(priorKeys.has(row.canonicalKey),false,row.canonicalKey+': duplicate prior wave');
 assert.equal(row.sourceTier,'EU_NATIONAL');
 assert.equal(Policy.sourceTierForUrl(row.url).key,'EU_NATIONAL');
 assert.equal(row.section41Present,true);
 assert.equal(row.section42Present,true);
 assert.equal(row.publicationAllowed,false);
}
assert.match(wave.rows.find(x=>x.canonicalKey==='chamomiletincturelauromacrogollidocaine').productName,/Dentinox/);
assert.match(wave.rows.find(x=>x.canonicalKey==='chlorquinaldoltriamcinoloneacetonide').productName,/Triamcinolon/);
assert.match(wave.rows.find(x=>x.canonicalKey==='betamethasonedipropionateclotrimazolegentamicin').productName,/Tresyl/);
console.log('DRx first-100 official source discovery wave I contract passed.');
