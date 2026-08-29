'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/drx-batch1-source-verification-v1.json'), 'utf8')
);

assert.equal(manifest.schemaVersion, 'drx-batch1-source-verification-v1');
assert.equal(manifest.publicationAllowed, false);
assert.equal(manifest.summary.batch1Target, 10);
assert.equal(manifest.substances.length, 10);
assert.equal(manifest.summary.authoritativeSourcesMapped, 10);
assert.equal(manifest.summary.readyForRepositorySideArchiveAndParse, 10);
assert.equal(manifest.summary.readyForLiveProductBinding, 0);

const keys = new Set();
for (const substance of manifest.substances) {
  assert.equal(typeof substance.canonicalKey, 'string');
  assert.ok(substance.canonicalKey.length > 0);
  assert.equal(keys.has(substance.canonicalKey), false, 'Batch 1 canonical keys must be unique');
  keys.add(substance.canonicalKey);

  assert.equal(typeof substance.sourceKey, 'string');
  assert.ok(substance.sourceKey.startsWith('emc-'));
  assert.match(substance.url, /^https:\/\/www\.medicines\.org\.uk\/emc\/product\/\d+\/smpc$/);
  assert.ok(['already_pilot_verified', 'verified_live', 'verified_live_via_search_fallback'].includes(substance.status));
}

assert.equal(keys.has('ibuprofen'), true);
assert.equal(keys.has('paracetamol'), true);
assert.equal(keys.has('amoxicillin-clavulanic-acid'), true);
assert.equal(keys.has('cefuroxime'), true);

console.log('DRx Batch 1 source verification contract passed.');
