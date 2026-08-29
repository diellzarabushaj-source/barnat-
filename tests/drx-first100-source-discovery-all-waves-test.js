'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ANY_WAVE_FILE_PATTERN = /^drx-first100-source-discovery-wave-.*\.json$/;
const SUPPORTED_WAVE_FILE_PATTERN = /^drx-first100-source-discovery-wave-([a-z]+)-v1\.json$/;

function waveOrdinal(label) {
  assert.match(label, /^[a-z]+$/, `invalid wave label: ${label}`);
  let ordinal = 0;
  for (const char of label) {
    ordinal = (ordinal * 26) + (char.charCodeAt(0) - 96);
  }
  return ordinal;
}

const candidateWaveFileNames = fs.readdirSync(DATA_DIR)
  .filter((fileName) => ANY_WAVE_FILE_PATTERN.test(fileName));

assert.ok(candidateWaveFileNames.length > 0, 'no first-100 source-discovery waves found');

const waveFiles = candidateWaveFileNames
  .map((fileName) => {
    const match = fileName.match(SUPPORTED_WAVE_FILE_PATTERN);
    assert.ok(
      match,
      `${fileName}: unsupported source-discovery wave filename/schema version; fail closed until the aggregate gate is explicitly upgraded`
    );
    return { fileName, label: match[1], ordinal: waveOrdinal(match[1]) };
  })
  .sort((a, b) => a.ordinal - b.ordinal);

for (let index = 0; index < waveFiles.length; index += 1) {
  const expectedOrdinal = index + 1;
  const waveFile = waveFiles[index];
  assert.equal(
    waveFile.ordinal,
    expectedOrdinal,
    `source-discovery wave sequence is not contiguous at ${waveFile.label.toUpperCase()}: expected ordinal ${expectedOrdinal}, got ${waveFile.ordinal}`
  );
}

const seen = new Map();
let verified = 0;
let pending = 0;
let selectionRequired = 0;

for (const { fileName, label } of waveFiles) {
  const file = path.join(DATA_DIR, fileName);
  const wave = JSON.parse(fs.readFileSync(file, 'utf8'));
  const waveName = label.toUpperCase();

  assert.equal(
    wave.schemaVersion,
    `drx-first100-source-discovery-wave-${label}-v1`,
    `wave ${waveName}: schemaVersion must match its filename`
  );
  assert.equal(wave.publicationAllowed, false, `wave ${waveName} must fail closed`);
  assert.ok(Array.isArray(wave.rows) && wave.rows.length > 0, `wave ${waveName} has no rows`);

  verified += Number(wave.verifiedProductSpecificCount || 0);
  pending += Number(wave.sectionsPendingCount || 0);
  selectionRequired += Number(wave.productSelectionRequiredCount || 0);

  for (const row of wave.rows) {
    assert.equal(row.publicationAllowed, false, `${row.canonicalKey}: publication must remain closed`);
    assert.ok(row.canonicalKey, `wave ${waveName}: canonicalKey missing`);
    assert.equal(
      seen.has(row.canonicalKey),
      false,
      `${row.canonicalKey}: duplicate across waves ${seen.get(row.canonicalKey)} and ${waveName}`
    );
    seen.set(row.canonicalKey, waveName);

    if (row.status.startsWith('verified_product_specific')) {
      assert.ok(row.sourceTier, `${row.canonicalKey}: sourceTier missing`);
      assert.ok(row.sourceKey, `${row.canonicalKey}: sourceKey missing`);
      assert.ok(/^https:\/\//.test(row.url || ''), `${row.canonicalKey}: official source URL missing`);
      if (row.sourceTier === 'NON_EU_REGULATOR') {
        assert.equal(row.officialIdentityPresent, true, `${row.canonicalKey}: non-EU regulator identity not verified`);
        assert.equal(row.doseEvidencePresent, true, `${row.canonicalKey}: non-EU dose evidence missing`);
        assert.ok((row.reviewFlags || []).includes('manual_publication_review_required'), `${row.canonicalKey}: manual publication review flag missing`);
      } else {
        assert.equal(row.section41Present, true, `${row.canonicalKey}: SmPC 4.1 not verified`);
        assert.equal(row.section42Present, true, `${row.canonicalKey}: SmPC 4.2 not verified`);
      }
    }
  }
}

assert.ok(verified >= 62, `verified coverage regressed below 62: ${verified}`);
assert.ok(seen.has('acetylsalicylicacidrosuvastatin'), 'Wave G Roasax canonical is missing');
assert.ok(seen.has('amlodipineramipril'), 'Wave H Amlodipine + Ramipril canonical is missing');
assert.ok(pending >= 0 && selectionRequired >= 0);

console.log(JSON.stringify({
  waves: waveFiles.map(({ label }) => label.toUpperCase()),
  waveCount: waveFiles.length,
  uniqueCanonicalRows: seen.size,
  verifiedProductSpecificCount: verified,
  sectionsPendingCount: pending,
  productSelectionRequiredCount: selectionRequired,
  publicationAllowed: false
}, null, 2));
