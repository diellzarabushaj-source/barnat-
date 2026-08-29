'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Verifier = require('../scripts/verify-drx-batch2-archive.js');
const Extraction = require('../scripts/build-drx-batch2-extraction-index.js');

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drx-archive-verify-'));
const archive = path.join(root, 'artifacts', 'drx-batch2-raw');
fs.mkdirSync(archive, { recursive:true });

function makeRow(key, body, date) {
  const raw = Buffer.from(body, 'utf8');
  const rawSha256 = hash(raw);
  const rawPath = path.join(archive, `emc-${key}-${rawSha256.slice(0, 20)}.raw`);
  const metaPath = path.join(archive, `emc-${key}-${rawSha256.slice(0, 20)}.json`);
  const requestedUrl = `https://www.medicines.org.uk/emc/product/${key}/smpc`;
  fs.writeFileSync(rawPath, raw);
  fs.writeFileSync(metaPath, JSON.stringify({
    snapshotId:rawSha256,
    requestedUrl,
    finalUrl:requestedUrl,
    sourceTier:'EMC',
    contentLength:raw.length,
    rawSha256,
    sourceDocument:{ documentDate:date, productName:key },
    parser:{ indicationsSectionPresent:true, doseSectionPresent:true },
  }, null, 2));
  return {
    canonicalKey:key,
    sourceKey:`emc-${key}-smpc`,
    requestedUrl,
    finalUrl:requestedUrl,
    sourceTier:'EMC',
    documentDate:date,
    contentLength:raw.length,
    rawSha256,
    snapshotId:rawSha256,
    section41Present:true,
    section42Present:true,
    extractionGate:{ allowed:true },
    archiveFiles:{
      rawPath:path.relative(root, rawPath),
      metaPath:path.relative(root, metaPath),
    },
  };
}

try {
  const rows = [
    makeRow('alpha', 'alpha source body', '2026-08-01'),
    makeRow('beta', 'beta source body', '2026-08-02'),
  ];
  const index = {
    targetCount:2,
    extractedCount:2,
    failedCount:0,
    complete:true,
    publicationAllowed:false,
    rows,
  };

  const good = Verifier.verifyArchive({
    index,
    archiveDirectory:path.relative(root, archive),
    expectedCount:2,
    repoRoot:root,
  });
  assert.equal(good.valid, true, JSON.stringify(good.errors));
  assert.equal(good.summary.uniqueHashes, 2);
  assert.equal(good.summary.rawFiles, 2);
  assert.equal(good.summary.metadataFiles, 2);

  const firstRaw = path.resolve(root, rows[0].archiveFiles.rawPath);
  fs.appendFileSync(firstRaw, 'tampered');
  const tampered = Verifier.verifyArchive({
    index,
    archiveDirectory:path.relative(root, archive),
    expectedCount:2,
    repoRoot:root,
  });
  assert.equal(tampered.valid, false);
  assert.ok(tampered.errors.includes('row:alpha:raw_hash_mismatch'));
  assert.ok(tampered.errors.includes('row:alpha:content_length_mismatch'));

  const envPath = Extraction._test.archiveDirectoryFromEnvironment({
    DRX_ARCHIVE_DIR:'artifacts/drx-batch2-raw',
  });
  assert.equal(envPath, path.resolve(__dirname, '..', 'artifacts/drx-batch2-raw'));
  assert.equal(Extraction._test.archiveDirectoryFromEnvironment({}), null);

  console.log('DRx Batch 2 archive verifier contract passed.');
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
