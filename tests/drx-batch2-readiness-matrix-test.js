'use strict';
const assert=require('node:assert/strict');
const Matrix=require('../scripts/build-drx-batch2-readiness-matrix.js');
const m=Matrix.build();

assert.equal(m.schemaVersion,'drx-batch2-readiness-matrix-v1');
assert.equal(m.total,25);
assert.equal(m.structuredCandidateReady,25);
assert.equal(m.normalizationReady,0);
assert.equal(m.publicationReady,0);
assert.equal(m.blockedByArchiveHash,25);
assert.equal(m.blockedByClinicalReview,25);
assert.equal(m.blockedByProductBinding,25);
assert.equal(m.blockedBySafety,25);
assert.equal(m.publicationAllowed,false);
assert.ok(m.rows.every(x=>x.publicationAllowed===false));
assert.ok(m.rows.every(x=>x.blockers.includes('archive_hash_missing')));
console.log('DRx Batch 2 readiness matrix contract passed.');
