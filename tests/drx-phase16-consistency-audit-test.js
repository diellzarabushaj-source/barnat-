'use strict';

const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-drx-phase16-consistency.js');
const Queue = require('../scripts/build-drx-first100-discovery-queue.js');

const result = Audit.audit();
assert.equal(result.targetCount, 25);
assert.equal(result.checkedCount, 25);
assert.equal(result.liveEvidenceCount, 25);
assert.equal(result.liveEvidenceUniqueCount, 25);
assert.equal(result.sourceMapDocumentDateCount, 25);
assert.equal(result.archiveHashVerifiedCount, 0);
assert.equal(result.issueCount, 0);
assert.equal(result.pass, true);
assert.equal(result.publicationAllowed, false);

assert.throws(() => Queue.buildDiscoveryQueue(null, [], 100), /canonicalSubstances must be an array/);

const duplicateCanonical = [
  {canonicalKey:'alpha',canonicalName:'Alpha'},
  {canonicalKey:'alpha',canonicalName:'Alpha duplicate'},
  {canonicalKey:'beta',canonicalName:'Beta'},
];
const queue = Queue.buildDiscoveryQueue(duplicateCanonical, [], 100);
assert.equal(queue.length, 2);
assert.deepEqual(queue.map(x => x.canonicalKey), ['alpha','beta']);
assert.ok(queue.every(x => x.publicationAllowed === false));

console.log('DRx Phase 16 consistency and canonical queue guards passed.');
