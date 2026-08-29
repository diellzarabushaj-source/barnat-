'use strict';

const assert = require('node:assert/strict');
const Bulk = require('../scripts/build-drx-bulk-discovery-batches.js');

const canonicalRows = Array.from({length:620}, (_, i) => ({
  concept_id:'00000000-0000-5000-a000-' + String(i + 1).padStart(12,'0'),
  canonical_key:'drug' + String(i + 1).padStart(4,'0'),
  canonical_name:'Drug ' + (i + 1),
}));

canonicalRows.push({
  concept_id:'00000000-0000-5000-a000-999999999999',
  canonical_key:'amoxicillinclavulanicacid',
  canonical_name:'Amoxicillin clavulanic acid',
});

const batch1 = {
  substances:[
    {key:'ibuprofen'},
    {key:'amoxicillin-clavulanic-acid'},
  ],
};
const batch2 = {
  substances:[
    {canonicalKey:'amlodipine'},
    {canonicalKey:'loratadine'},
  ],
};

const out = Bulk.build(canonicalRows, {batch1, batch2});

assert.equal(out.sourceOfTruth, 'public.substance_concepts_v1');
assert.equal(out.publicationAllowed, false);
assert.equal(out.batchSizes.join(','), '100,250,500');
assert.equal(out.batches[0].queuedCount, 100);
assert.equal(out.batches[1].queuedCount, 250);
assert.equal(out.batches[2].queuedCount, 500);
assert.equal(out.batches[0].complete, true);
assert.ok(out.batches.every(x => x.publicationAllowed === false));
assert.ok(out.batches.every(x => x.queue.every(row => row.publicationAllowed === false)));
assert.ok(out.batches.every(x => x.queue.every(row => row.canonicalKey !== 'amoxicillinclavulanicacid')));
assert.ok(out.batches[0].queue.every((row, index, arr) => index === 0 || arr[index - 1].canonicalKey < row.canonicalKey));

const covered = Bulk.coveredKeys(batch1, batch2);
assert.ok(covered.includes('amoxicillin-clavulanic-acid'));
assert.ok(covered.includes('amlodipine'));

console.log('DRx bulk discovery 100/250/500 contracts passed.');
