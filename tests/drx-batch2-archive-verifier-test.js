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
  const html = [
    '<h2>4.1 Therapeutic indications</h2><p>'+body+' indication.</p>',
    '<h2>4.2 Posology and method of administration</h2><p>'+body+' dose.</p>',
    '<h2>5. Pharmacological properties</h2>'
  ].join('');
  const raw = Buffer.from(html, 'utf8');
  const rawSha256 = hash(raw);
  const rawPath = path.join(archive, `emc-${key}-${rawSha256.slice(0, 20)}.raw`);
  const metaPath = path.join(archive, `emc-${key}-${rawSha256.slice(0, 20)}.json`);
  const requestedUrl = `https://www.medicines.org.uk/emc/product/${key}/smpc`;
  const parsed = require('../lib/smpc-parser.js').extractClinicalSections(html);
  const section41Sha256 = hash(Buffer.from(parsed.sections['4.1'].text, 'utf8'));
  const section42Sha256 = hash(Buffer.from(parsed.sections['4.2'].text, 'utf8'));
  const sectionSha256 = {'4.1':section41Sha256,'4.2':section42Sha256};
  fs.writeFileSync(rawPath, raw);
  fs.writeFileSync(metaPath, JSON.stringify({
    snapshotId:rawSha256,
    requestedUrl,
    finalUrl:requestedUrl,
    sourceTier:'EMC',
    contentLength:raw.length,
    rawSha256,
    sectionSha256,
    sourceDocument:{ documentDate:date, productName:key },
    parser:{ indicationsSectionPresent:true, doseSectionPresent:true },
  }, null, 2));
  // The payload the database load reads. The verifier checks it against the
  // raw document, so the fixture has to produce a real one.
  const sectionsPath = path.join(archive, `emc-${key}-${rawSha256.slice(0, 20)}.sections.json`);
  fs.writeFileSync(sectionsPath, JSON.stringify({
    schemaVersion:'drx-dose-section-payload-v1',
    snapshotId:rawSha256,
    rawSha256,
    parserVersion:parsed.schemaVersion,
    sections:{
      '4.1':{ code:'4.1', key:'indications', heading:null, text:parsed.sections['4.1'].text, sha256:section41Sha256 },
      '4.2':{ code:'4.2', key:'posology', heading:null, text:parsed.sections['4.2'].text, sha256:section42Sha256 },
    },
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
    sectionSha256,
    section41Sha256,
    section42Sha256,
    section41Present:true,
    section42Present:true,
    extractionGate:{ allowed:true },
    archiveFiles:{
      rawPath:path.relative(root, rawPath),
      metaPath:path.relative(root, metaPath),
      sectionsPath:path.relative(root, sectionsPath),
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
  assert.equal(good.summary.sectionHashVerifiedCount, 2);
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

  fs.writeFileSync(firstRaw, Buffer.from([
    '<h2>4.1 Therapeutic indications</h2><p>alpha source body indication.</p>',
    '<h2>4.2 Posology and method of administration</h2><p>changed dose.</p>',
    '<h2>5. Pharmacological properties</h2>'
  ].join(''), 'utf8'));
  const sectionTampered = Verifier.verifyArchive({
    index,
    archiveDirectory:path.relative(root, archive),
    expectedCount:2,
    repoRoot:root,
  });
  assert.equal(sectionTampered.valid, false);
  assert.ok(sectionTampered.errors.includes('row:alpha:raw_hash_mismatch'));
  assert.ok(sectionTampered.errors.includes('row:alpha:section_4_2_hash_mismatch'));

  // The payload is the file the database load actually reads, so text edited
  // there - with the raw document left untouched - must be caught. Verifying
  // only the raw and the metadata would let doctored text reach production
  // while every hash in the index still matched.
  const betaSections = path.resolve(root, rows[1].archiveFiles.sectionsPath);
  const betaPayload = JSON.parse(fs.readFileSync(betaSections, 'utf8'));
  betaPayload.sections['4.2'].text = 'Take as much as you like.';
  fs.writeFileSync(betaSections, JSON.stringify(betaPayload, null, 2));
  const payloadTampered = Verifier.verifyArchive({
    index,
    archiveDirectory:path.relative(root, archive),
    expectedCount:2,
    repoRoot:root,
  });
  assert.equal(payloadTampered.valid, false);
  assert.ok(payloadTampered.errors.includes('row:beta:sections_4_2_hash_mismatch'),
    'payload text that does not hash to the archived section hash must be rejected.');
  assert.ok(payloadTampered.errors.includes('row:beta:sections_4_2_text_mismatch'),
    'payload text must equal the text reparsed from the raw document.');

  // A payload that goes missing must fail rather than pass quietly, since a
  // silently absent payload is what let a partial load report success.
  fs.rmSync(betaSections);
  const payloadMissing = Verifier.verifyArchive({
    index,
    archiveDirectory:path.relative(root, archive),
    expectedCount:2,
    repoRoot:root,
  });
  assert.equal(payloadMissing.valid, false);
  assert.ok(payloadMissing.errors.includes('row:beta:sections_missing'));

  const envPath = Extraction._test.archiveDirectoryFromEnvironment({
    DRX_ARCHIVE_DIR:'artifacts/drx-batch2-raw',
  });
  assert.equal(envPath, path.resolve(__dirname, '..', 'artifacts/drx-batch2-raw'));
  assert.equal(Extraction._test.archiveDirectoryFromEnvironment({}), null);

  console.log('DRx Batch 2 archive verifier contract passed.');
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
