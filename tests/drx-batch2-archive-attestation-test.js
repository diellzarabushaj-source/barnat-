'use strict';

// Gate for materialized Batch 2 archive evidence.
//
// The archive workflow fetches 25 real regulatory sources and hashes them, but
// the result used to live only in a 90-day CI artifact, so no repository gate
// could see it and the tracker reported the hash gap as if it were missing
// repo work. The attestation closes that gap by committing hashes and CI
// provenance - never document text.
//
// This gate does not require the attestation to exist yet: CI writes it on its
// next run. What it does require is that the repository never carries an
// invalid or fabricated one, and that the tracker's claim about it matches
// what is actually on disk. Those two together are what stop the hash gap from
// being "closed" by hand.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ATTESTATION = path.join(ROOT, 'data', 'drx-batch2-archive-attestation-v1.json');
const SHA256_RE = /^[0-9a-f]{64}$/;
const EXPECTED_ROWS = 25;

const tracker = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'drx-dosierung-master-plan-status.json'), 'utf8'));
const execution = tracker.currentExecution;

// The generator is the only sanctioned way to produce this file, and it must
// keep refusing to run outside CI. Without that refusal the gate below could
// be satisfied by a hand-written file.
const generator = fs.readFileSync(
  path.join(ROOT, 'scripts', 'build-drx-batch2-archive-attestation.js'), 'utf8');
assert.match(generator, /GITHUB_ACTIONS === 'true'/,
  'the attestation generator must detect CI.');
assert.match(generator, /refusing to write an attestation outside CI/,
  'the attestation generator must refuse to write outside CI.');
assert.match(generator, /authoritative: false/,
  'a local dry run must mark itself non-authoritative.');

const present = fs.existsSync(ATTESTATION);
assert.equal(execution.archiveAttestationPresent, present,
  'tracker archiveAttestationPresent must match whether the attestation exists on disk.');

if (!present) {
  // Nothing materialized yet. The tracker must still say so, and must not be
  // claiming repo-side verified hashes it does not have.
  assert.equal(execution.archiveHashVerifiedCount, 0,
    'without a committed attestation the repo-side verified hash count must stay 0.');
  assert.ok(execution.releaseBlockers.includes('batch2_archive_evidence_not_materialized'),
    'the archive evidence blocker must stand until the attestation is committed.');
  console.log('DRx Batch 2 archive attestation gate passed (not materialized yet; blocker stands).');
  return;
}

const attestation = JSON.parse(fs.readFileSync(ATTESTATION, 'utf8'));

assert.equal(attestation.schemaVersion, 'drx-batch2-archive-attestation-v1');
assert.equal(attestation.publicationAllowed, false,
  'an attestation must never by itself allow publication.');
assert.equal(attestation.containsDocumentText, false,
  'the attestation must carry hashes only, never document text.');

// Only a real CI run counts. A dry run or hand-made file is rejected here.
assert.equal(attestation.ci.provider, 'github-actions',
  'only a GitHub Actions run may produce an authoritative attestation.');
assert.equal(attestation.ci.authoritative, true,
  'a non-authoritative attestation must never satisfy this gate.');
assert.ok(Number.isInteger(attestation.ci.runId) && attestation.ci.runId > 0,
  'the attestation must name the CI run that produced it.');
assert.match(attestation.ci.runUrl, /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/,
  'the run URL must be resolvable so a reviewer can check the run.');
assert.ok(attestation.ci.runUrl.endsWith('/' + attestation.ci.runId),
  'the run URL must point at the run id it claims.');
assert.match(String(attestation.ci.commitSha || ''), /^[0-9a-f]{7,40}$/,
  'the attestation must name the commit it was built from.');
assert.equal(attestation.ci.workflow, '.github/workflows/drx-batch2-source-archive.yml');

// The evidence set itself.
assert.equal(attestation.batch.complete, true);
assert.equal(attestation.batch.failedCount, 0);
assert.equal(attestation.batch.targetCount, EXPECTED_ROWS);
assert.equal(attestation.rows.length, EXPECTED_ROWS);
assert.equal(attestation.totals.rows, EXPECTED_ROWS);

const rawDigests = new Set();
for (const row of attestation.rows) {
  const where = row.canonicalKey || row.sourceKey || '(unknown row)';
  for (const field of ['rawSha256', 'snapshotId', 'section41Sha256', 'section42Sha256']) {
    assert.match(String(row[field] || ''), SHA256_RE, `${where}: ${field} must be a sha256 digest.`);
  }
  assert.equal(row.snapshotId, row.rawSha256, `${where}: snapshotId must equal rawSha256.`);
  assert.ok(String(row.finalUrl || '').startsWith('https://'), `${where}: finalUrl must be https.`);
  assert.ok(row.sourceKey && String(row.sourceKey).trim() !== '', `${where}: sourceKey is required.`);
  rawDigests.add(row.rawSha256);
}
assert.equal(rawDigests.size, EXPECTED_ROWS, 'every archived source must hash distinctly.');
assert.equal(attestation.totals.uniqueRawSha256, EXPECTED_ROWS);
assert.equal(attestation.totals.section42HashCount, EXPECTED_ROWS);

// Recomputing the digest catches edits made to the rows after CI wrote them.
const recomputed = crypto.createHash('sha256')
  .update(JSON.stringify(attestation.rows))
  .digest('hex');
assert.equal(recomputed, attestation.rowsDigest,
  'rowsDigest does not match the rows; the attestation was edited after CI produced it.');

// Evidence existing is not permission to publish.
assert.equal(execution.publicationAllowed, false,
  'materialized archive evidence must not flip publication open on its own.');

console.log(`DRx Batch 2 archive attestation gate passed (${EXPECTED_ROWS} hashed sources from run ${attestation.ci.runId}).`);
