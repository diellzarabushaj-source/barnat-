'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const seen = new Map();
let verified = 0;
let pending = 0;
let selectionRequired = 0;

for (const letter of letters) {
  const file = path.join(ROOT, 'data', `drx-first100-source-discovery-wave-${letter}-v1.json`);
  assert.ok(fs.existsSync(file), `missing source-discovery wave ${letter.toUpperCase()}`);
  const wave = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.equal(wave.publicationAllowed, false, `wave ${letter.toUpperCase()} must fail closed`);
  assert.ok(Array.isArray(wave.rows) && wave.rows.length > 0, `wave ${letter.toUpperCase()} has no rows`);

  verified += Number(wave.verifiedProductSpecificCount || 0);
  pending += Number(wave.sectionsPendingCount || 0);
  selectionRequired += Number(wave.productSelectionRequiredCount || 0);

  for (const row of wave.rows) {
    assert.equal(row.publicationAllowed, false, `${row.canonicalKey}: publication must remain closed`);
    assert.ok(row.canonicalKey, `wave ${letter.toUpperCase()}: canonicalKey missing`);
    assert.equal(seen.has(row.canonicalKey), false, `${row.canonicalKey}: duplicate across waves ${seen.get(row.canonicalKey)} and ${letter.toUpperCase()}`);
    seen.set(row.canonicalKey, letter.toUpperCase());

    if (row.status.startsWith('verified_product_specific')) {
      assert.ok(row.sourceTier, `${row.canonicalKey}: sourceTier missing`);
      assert.ok(row.sourceKey, `${row.canonicalKey}: sourceKey missing`);
      assert.ok(/^https:\/\//.test(row.url || ''), `${row.canonicalKey}: official source URL missing`);
      assert.equal(row.section41Present, true, `${row.canonicalKey}: SmPC 4.1 not verified`);
      assert.equal(row.section42Present, true, `${row.canonicalKey}: SmPC 4.2 not verified`);
    }
  }
}

assert.ok(verified >= 61, `verified coverage regressed below 61: ${verified}`);
assert.ok(seen.has('acetylsalicylicacidrosuvastatin'), 'Wave G Roasax canonical is missing');
assert.ok(pending >= 0 && selectionRequired >= 0);

console.log(JSON.stringify({ waves: letters.length, uniqueCanonicalRows: seen.size, verifiedProductSpecificCount: verified, sectionsPendingCount: pending, productSelectionRequiredCount: selectionRequired, publicationAllowed: false }, null, 2));
