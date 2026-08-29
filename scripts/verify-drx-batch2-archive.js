'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA256_RE = /^[0-9a-f]{64}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(path.resolve(full));
  }
  return out;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ''
    && !relative.startsWith('..' + path.sep)
    && relative !== '..'
    && !path.isAbsolute(relative);
}

function resolveArchiveReference(repoRoot, archiveRoot, value, label, errors) {
  if (!value || typeof value !== 'string') {
    errors.push(`${label}:missing_path`);
    return null;
  }
  const resolved = path.resolve(repoRoot, value);
  if (!isWithin(archiveRoot, resolved)) {
    errors.push(`${label}:outside_archive`);
    return null;
  }
  return resolved;
}

function parseJsonFile(file, label, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    errors.push(`${label}:invalid_json`);
    return null;
  }
}

function verifyArchive(options = {}) {
  const index = options.index || {};
  const expectedCount = Number.isInteger(Number(options.expectedCount))
    ? Number(options.expectedCount)
    : 25;
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const archiveRoot = path.resolve(
    path.isAbsolute(String(options.archiveDirectory || ''))
      ? String(options.archiveDirectory || '')
      : path.join(repoRoot, String(options.archiveDirectory || ''))
  );
  const errors = [];
  const rows = Array.isArray(index.rows) ? index.rows : [];

  if (index.publicationAllowed !== false) errors.push('index:publication_must_remain_closed');
  if (Number(index.targetCount) !== expectedCount) errors.push('index:target_count_mismatch');
  if (Number(index.extractedCount) !== expectedCount) errors.push('index:extracted_count_mismatch');
  if (Number(index.failedCount) !== 0) errors.push('index:failed_count_nonzero');
  if (index.complete !== true) errors.push('index:not_complete');
  if (rows.length !== expectedCount) errors.push('index:row_count_mismatch');

  const seenCanonical = new Set();
  const seenSource = new Set();
  const seenRequestedUrl = new Set();
  const seenHash = new Set();
  const referencedRaw = new Set();
  const referencedMeta = new Set();

  for (const row of rows) {
    const key = String(row?.canonicalKey || 'unknown');
    const prefix = `row:${key}`;

    for (const [name, value, set] of [
      ['canonical_key', key, seenCanonical],
      ['source_key', String(row?.sourceKey || ''), seenSource],
      ['requested_url', String(row?.requestedUrl || ''), seenRequestedUrl],
      ['raw_sha256', String(row?.rawSha256 || ''), seenHash],
    ]) {
      if (!value) errors.push(`${prefix}:${name}_missing`);
      else if (set.has(value)) errors.push(`${prefix}:${name}_duplicate`);
      else set.add(value);
    }

    if (!SHA256_RE.test(String(row?.rawSha256 || ''))) errors.push(`${prefix}:raw_sha256_invalid`);
    if (row?.snapshotId !== row?.rawSha256) errors.push(`${prefix}:snapshot_hash_mismatch`);
    if (!ISO_DATE_RE.test(String(row?.documentDate || ''))) errors.push(`${prefix}:document_date_missing_or_invalid`);
    if (row?.section41Present !== true) errors.push(`${prefix}:section_4_1_missing`);
    if (row?.section42Present !== true) errors.push(`${prefix}:section_4_2_missing`);
    if (row?.extractionGate?.allowed !== true) errors.push(`${prefix}:extraction_gate_closed`);
    if (!String(row?.sourceTier || '').trim()) errors.push(`${prefix}:source_tier_missing`);
    if (!String(row?.finalUrl || '').startsWith('https://')) errors.push(`${prefix}:final_url_invalid`);

    const rawPath = resolveArchiveReference(
      repoRoot, archiveRoot, row?.archiveFiles?.rawPath, `${prefix}:raw`, errors
    );
    const metaPath = resolveArchiveReference(
      repoRoot, archiveRoot, row?.archiveFiles?.metaPath, `${prefix}:meta`, errors
    );
    if (!rawPath || !metaPath) continue;

    referencedRaw.add(rawPath);
    referencedMeta.add(metaPath);

    if (!fs.existsSync(rawPath)) {
      errors.push(`${prefix}:raw_missing`);
      continue;
    }
    if (!fs.existsSync(metaPath)) {
      errors.push(`${prefix}:meta_missing`);
      continue;
    }

    const raw = fs.readFileSync(rawPath);
    const actualHash = sha256(raw);
    if (actualHash !== row.rawSha256) errors.push(`${prefix}:raw_hash_mismatch`);
    if (Number(row.contentLength) !== raw.length) errors.push(`${prefix}:content_length_mismatch`);

    const meta = parseJsonFile(metaPath, `${prefix}:meta`, errors);
    if (!meta) continue;
    if (meta.rawSha256 !== row.rawSha256) errors.push(`${prefix}:meta_raw_hash_mismatch`);
    if (meta.snapshotId !== row.snapshotId) errors.push(`${prefix}:meta_snapshot_id_mismatch`);
    if (meta.requestedUrl !== row.requestedUrl) errors.push(`${prefix}:meta_requested_url_mismatch`);
    if (meta.finalUrl !== row.finalUrl) errors.push(`${prefix}:meta_final_url_mismatch`);
    if (meta.sourceTier !== row.sourceTier) errors.push(`${prefix}:meta_source_tier_mismatch`);
    if (meta.sourceDocument?.documentDate !== row.documentDate) errors.push(`${prefix}:meta_document_date_mismatch`);
    if (Number(meta.contentLength) !== raw.length) errors.push(`${prefix}:meta_content_length_mismatch`);
    if (meta.parser?.indicationsSectionPresent !== true) errors.push(`${prefix}:meta_section_4_1_missing`);
    if (meta.parser?.doseSectionPresent !== true) errors.push(`${prefix}:meta_section_4_2_missing`);
  }

  const files = walkFiles(archiveRoot);
  const rawFiles = files.filter(file => file.endsWith('.raw'));
  const metaFiles = files.filter(file => file.endsWith('.json'));
  if (rawFiles.length !== expectedCount) errors.push('archive:raw_file_count_mismatch');
  if (metaFiles.length !== expectedCount) errors.push('archive:meta_file_count_mismatch');
  if (referencedRaw.size !== expectedCount) errors.push('archive:referenced_raw_count_mismatch');
  if (referencedMeta.size !== expectedCount) errors.push('archive:referenced_meta_count_mismatch');
  for (const file of rawFiles) if (!referencedRaw.has(file)) errors.push('archive:unreferenced_raw_file');
  for (const file of metaFiles) if (!referencedMeta.has(file)) errors.push('archive:unreferenced_meta_file');

  return {
    valid:errors.length === 0,
    errors,
    summary:{
      expectedCount,
      rowCount:rows.length,
      uniqueHashes:seenHash.size,
      rawFiles:rawFiles.length,
      metadataFiles:metaFiles.length,
      publicationAllowed:false,
    },
  };
}

function cliArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

if (require.main === module) {
  const indexPath = path.resolve(cliArg('index', 'data/drx-batch2-extraction-index-v1.json'));
  const archiveDirectory = cliArg('archive', process.env.DRX_ARCHIVE_DIR || 'artifacts/drx-batch2-raw');
  const expectedCount = Number(cliArg('expected', '25'));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const result = verifyArchive({ index, archiveDirectory, expectedCount, repoRoot:process.cwd() });
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

module.exports = { verifyArchive, _test:{ sha256, walkFiles, isWithin, resolveArchiveReference } };
