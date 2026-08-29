'use strict';

const assert = require('node:assert/strict');
const Coverage = require('../scripts/build-drx-dose-coverage-v2.js');

const snapshot = Coverage.build();
assert.equal(snapshot.schemaVersion, 'drx-dose-coverage-snapshot-v2');
assert.equal(snapshot.publicationAllowed, false);
assert.equal(snapshot.counts.batch1Substances, 10);
assert.equal(snapshot.counts.batch2Substances, 25);
assert.equal(snapshot.counts.mappedSources, 35);
assert.equal(snapshot.counts.exactProductBound, 0);
assert.equal(snapshot.counts.legacyCompared, 0);
assert.equal(snapshot.counts.clinicallyReviewed, 0);
assert.equal(snapshot.counts.published, 0);
assert.equal(snapshot.gates.publicationBlocked, true);
console.log('DRx coverage v2 contract passed.');
