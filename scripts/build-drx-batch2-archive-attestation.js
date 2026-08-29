'use strict';

// Materializes Batch 2 archive evidence into something the repository can read.
//
// The archive workflow already fetches 25 real regulatory sources and hashes
// them, but the result lives in a 90-day CI artifact that no repo gate can see.
// This script distills that run into a committable attestation: hashes, source
// identity and CI provenance only - never document text, so nothing
// copyrighted is checked in.
//
// The attestation is only authoritative when produced by a real CI run. Outside
// CI the script refuses to write one unless --dry-run is passed, and a dry run
// is explicitly marked non-authoritative so the gate rejects it.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_INDEX = path.join(ROOT, 'data', 'drx-batch2-extraction-index-v1.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'drx-batch2-archive-attestation-v1.json');
const SHA256_RE = /^[0-9a-f]{64}$/;

function arg(name) {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const indexPath = path.resolve(arg('index') || DEFAULT_INDEX);
const outputPath = path.resolve(arg('output') || DEFAULT_OUTPUT);

if (!fs.existsSync(indexPath)) {
  fail(`extraction index not found: ${path.relative(ROOT, indexPath)}`);
}

let index;
try {
  index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
} catch (error) {
  fail(`extraction index is not valid JSON: ${error.message}`);
}

if (index.schemaVersion !== 'drx-batch2-extraction-index-v1') {
  fail(`unexpected extraction index schemaVersion: ${index.schemaVersion}`);
}
if (!Array.isArray(index.rows)) fail('extraction index has no rows array.');
if (index.complete !== true) fail('extraction index is not complete; refusing to attest a partial run.');
if (index.failedCount !== 0) fail(`extraction index reports ${index.failedCount} failures.`);
if (index.rows.length !== index.targetCount) {
  fail(`extraction index has ${index.rows.length} rows for target ${index.targetCount}.`);
}

// Every row must carry a real raw hash plus both clinical section hashes.
// A row missing any of these cannot back a published rule, so it must not be
// attested as if it could.
const rows = [];
for (const row of index.rows) {
  const where = row.canonicalKey || row.sourceKey || '(unknown row)';
  for (const field of ['rawSha256', 'snapshotId', 'section41Sha256', 'section42Sha256']) {
    if (!SHA256_RE.test(String(row[field] || ''))) {
      fail(`${where}: ${field} is not a sha256 digest.`);
    }
  }
  if (row.snapshotId !== row.rawSha256) {
    fail(`${where}: snapshotId must equal rawSha256.`);
  }
  if (row.section41Present !== true || row.section42Present !== true) {
    fail(`${where}: sections 4.1 and 4.2 must both be present.`);
  }
  if (!row.finalUrl || !String(row.finalUrl).startsWith('https://')) {
    fail(`${where}: finalUrl must be https.`);
  }

  // Section 2 carries the salt and strength basis. It is deliberately optional:
  // it is not needed to publish a dose, and demanding it would turn a parser
  // miss on an unusual label layout into a failed archive run. Carrying it as
  // null instead makes a miss countable rather than invisible.
  const section2 = row.sectionSha256?.['2'] || null;
  if (section2 !== null && !SHA256_RE.test(String(section2))) {
    fail(`${where}: section 2 hash is present but is not a sha256 digest.`);
  }

  rows.push({
    canonicalKey: row.canonicalKey,
    canonicalName: row.canonicalName,
    sourceKey: row.sourceKey,
    sourceTier: row.sourceTier,
    authority: row.authority,
    jurisdiction: row.jurisdiction || null,
    finalUrl: row.finalUrl,
    fetchedAt: row.fetchedAt,
    documentDate: row.documentDate || null,
    contentLength: row.contentLength,
    snapshotId: row.snapshotId,
    rawSha256: row.rawSha256,
    section2Sha256: section2,
    section41Sha256: row.section41Sha256,
    section42Sha256: row.section42Sha256,
    parserSchemaVersion: row.parserSchemaVersion,
  });
}

const section2Count = rows.filter(r => r.section2Sha256).length;

const uniqueRaw = new Set(rows.map(r => r.rawSha256));
if (uniqueRaw.size !== rows.length) {
  fail(`raw hashes are not unique: ${rows.length} rows, ${uniqueRaw.size} distinct digests.`);
}

const env = process.env;
const inCi = env.GITHUB_ACTIONS === 'true';
if (!inCi && !dryRun) {
  fail('refusing to write an attestation outside CI. Run the archive workflow, or pass --dry-run for a non-authoritative preview.');
}

const ci = inCi
  ? {
      provider: 'github-actions',
      authoritative: true,
      repository: env.GITHUB_REPOSITORY || null,
      workflowRef: env.GITHUB_WORKFLOW_REF || null,
      workflow: '.github/workflows/drx-batch2-source-archive.yml',
      runId: env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : null,
      runNumber: env.GITHUB_RUN_NUMBER ? Number(env.GITHUB_RUN_NUMBER) : null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : null,
      runUrl: env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : null,
      commitSha: env.GITHUB_SHA || null,
      ref: env.GITHUB_REF || null,
    }
  : { provider: 'local', authoritative: false, note: 'dry run: not produced by CI, must never satisfy a publication gate.' };

if (inCi) {
  for (const field of ['repository', 'runId', 'commitSha', 'runUrl']) {
    if (!ci[field]) fail(`CI attestation is missing ${field}.`);
  }
}

// Row digest lets a reviewer confirm the evidence set was not edited after CI
// wrote it, without needing the archived documents themselves.
const rowsDigest = crypto.createHash('sha256')
  .update(JSON.stringify(rows))
  .digest('hex');

const attestation = {
  schemaVersion: 'drx-batch2-archive-attestation-v1',
  generatedAt: new Date().toISOString(),
  ci,
  batch: {
    batchSchemaVersion: index.batchSchemaVersion,
    targetCount: index.targetCount,
    extractedCount: index.extractedCount,
    failedCount: index.failedCount,
    complete: index.complete,
  },
  totals: {
    rows: rows.length,
    uniqueRawSha256: uniqueRaw.size,
    section41HashCount: rows.length,
    section42HashCount: rows.length,
    // Reported rather than required: section 2 proves salt basis, it does not
    // gate publication. A shortfall here names how many labels the composition
    // parser could not read.
    section2HashCount: section2Count,
    section2Missing: rows.length - section2Count,
  },
  rowsDigest,
  // Evidence only. Applying this never publishes anything on its own: rules
  // still need binding, legacy comparison and clinical review.
  publicationAllowed: false,
  containsDocumentText: false,
  rows,
};

if (dryRun && !inCi) {
  console.log(JSON.stringify({
    ok: true, dryRun: true, rows: rows.length, rowsDigest,
    section2HashCount: section2Count,
  }, null, 2));
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(attestation, null, 2) + '\n', 'utf8');

// The gate cross-checks the tracker's claim against what is on disk, so the
// step that makes the file exist is the step that must update that claim.
// Only do this for the canonical output path; a redirected --output is a test
// or preview run and must not touch the tracker.
let trackerUpdated = false;
if (outputPath === DEFAULT_OUTPUT) {
  const trackerPath = path.join(ROOT, 'data', 'drx-dosierung-master-plan-status.json');
  const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  tracker.currentExecution.archiveAttestationPresent = true;
  tracker.currentExecution.archiveAttestationRunId = ci.runId || null;
  tracker.currentExecution.archiveAttestationRowsDigest = rowsDigest;
  tracker.updatedAt = new Date().toISOString().replace(/\.\d+Z$/, '.000Z');
  fs.writeFileSync(trackerPath, JSON.stringify(tracker, null, 2) + '\n', 'utf8');
  trackerUpdated = true;
}

console.log(JSON.stringify({
  ok: true,
  output: path.relative(ROOT, outputPath),
  rows: rows.length,
  rowsDigest,
  section2HashCount: section2Count,
  section2Missing: rows.length - section2Count,
  runUrl: ci.runUrl || null,
  trackerUpdated,
}, null, 2));
