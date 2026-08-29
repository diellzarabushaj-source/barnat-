'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));

const wave=read('data/drx-first100-source-discovery-wave-j-v1.json');
const decisions=read('data/drx-first100-canonical-review-decisions-v1.json');

assert.equal(wave.schemaVersion,'drx-first100-source-discovery-wave-j-v1');
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.verifiedProductSpecificCount,1);
assert.equal(wave.sectionsPendingCount,0);
assert.equal(wave.productSelectionRequiredCount,0);
assert.equal(wave.rows.length,1);

const row=wave.rows[0];
assert.equal(row.canonicalKey,'amlodipineramipril');
assert.equal(row.canonicalName,'Amlodipine + Ramipril');
assert.match(row.status,/^verified_product_specific/);
assert.equal(row.sourceTier,'AEMPS_CIMA');
assert.equal(row.sourceKey,'cima-82689-ft');
assert.equal(row.url,'https://cima.aemps.es/cima/dochtml/ft/82689/FT_82689.html');
assert.equal(row.section41Present,true);
assert.equal(row.section42Present,true);
assert.equal(row.publicationAllowed,false);
assert.ok(row.reviewFlags.includes('clinical_review_required'));

const decision=decisions.decisions.find(d=>d.canonicalKey==='amlodipinebesilate2ramipril');
assert.ok(decision);
assert.equal(decision.resolvedCanonicalKey,row.canonicalKey);
assert.equal(decision.sourceDiscoveryEligible,true);
assert.equal(decision.publicationAllowed,false);

console.log('DRx first-100 source discovery wave J passed.');
