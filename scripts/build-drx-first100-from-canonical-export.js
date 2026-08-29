'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Queue = require('./build-drx-first100-discovery-queue.js');

const PROJECT_ID = 'ftuchtmolddhhsdcwnqe';
const EXPORT_SCHEMA = 'drx-canonical-substance-export-v1';
const SHA256 = /^[0-9a-f]{64}$/i;
const RELATION = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?$/i;

const clean = value => String(value ?? '').normalize('NFC').trim();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function snapshotPayload(doc) {
  const rows = Array.isArray(doc?.rows) ? doc.rows : [];
  return {
    schemaVersion: doc?.schemaVersion ?? null,
    sourceSystem: doc?.sourceSystem ?? null,
    projectId: doc?.projectId ?? null,
    sourceRelation: doc?.sourceRelation ?? null,
    exportedAt: doc?.exportedAt ?? null,
    rowCount: Number(doc?.rowCount ?? 0),
    rows: rows.map(row => ({
      canonical_key: clean(row?.canonical_key),
      canonical_name: clean(row?.canonical_name),
      concept_id: clean(row?.concept_id) || null,
    })),
  };
}

function computeSnapshotHash(doc) {
  return digest(JSON.stringify(snapshotPayload(doc)));
}

function normalizedRow(row) {
  return {
    canonicalKey: Queue._test.stableKey({ canonical_key: row?.canonical_key }),
    canonicalName: clean(row?.canonical_name),
    conceptId: clean(row?.concept_id) || null,
  };
}

function compareRows(a, b) {
  if (a.canonicalKey !== b.canonicalKey) {
    return a.canonicalKey < b.canonicalKey ? -1 : 1;
  }
  const ac = clean(a.conceptId);
  const bc = clean(b.conceptId);
  return ac === bc ? 0 : (ac < bc ? -1 : 1);
}

function validateCanonicalExport(doc, options = {}) {
  const errors = [];
  const rows = Array.isArray(doc?.rows) ? doc.rows : [];
  const expectedProjectId = options.projectId || PROJECT_ID;

  if (doc?.schemaVersion !== EXPORT_SCHEMA) errors.push('export:schema_version_invalid');
  if (doc?.sourceSystem !== 'supabase') errors.push('export:source_system_not_supabase');
  if (doc?.projectId !== expectedProjectId) errors.push('export:project_id_mismatch');
  if (!RELATION.test(clean(doc?.sourceRelation))) errors.push('export:source_relation_invalid');
  if (!Number.isFinite(Date.parse(String(doc?.exportedAt || '')))) errors.push('export:exported_at_invalid');
  if (doc?.publicationAllowed !== false) errors.push('export:publication_must_remain_closed');
  if (!Array.isArray(doc?.rows)) errors.push('export:rows_missing');
  if (Number(doc?.rowCount) !== rows.length) errors.push('export:row_count_mismatch');
  if (!SHA256.test(String(doc?.snapshotSha256 || ''))) errors.push('export:snapshot_hash_invalid');

  const normalized = rows.map(normalizedRow);
  const seen = new Set();
  normalized.forEach((row, index) => {
    const prefix = 'row:' + (index + 1);
    if (!row.canonicalKey) errors.push(prefix + ':canonical_key_missing');
    if (!row.canonicalName) errors.push(prefix + ':canonical_name_missing');
    if (row.canonicalKey && seen.has(row.canonicalKey)) {
      errors.push(prefix + ':canonical_key_duplicate');
    }
    if (row.canonicalKey) seen.add(row.canonicalKey);
  });

  const sorted = [...normalized].sort(compareRows);
  if (normalized.some((row, index) =>
    row.canonicalKey !== sorted[index]?.canonicalKey ||
    clean(row.conceptId) !== clean(sorted[index]?.conceptId)
  )) {
    errors.push('export:ordering_not_deterministic');
  }

  if (SHA256.test(String(doc?.snapshotSha256 || '')) &&
      computeSnapshotHash(doc) !== doc.snapshotSha256) {
    errors.push('export:snapshot_hash_mismatch');
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      rowCount: rows.length,
      uniqueCanonicalKeys: seen.size,
      projectId: doc?.projectId || null,
      sourceRelation: doc?.sourceRelation || null,
      snapshotSha256: doc?.snapshotSha256 || null,
      publicationAllowed: false,
    },
  };
}

function coveredCanonicalKeys(root = path.resolve(__dirname, '..')) {
  const batch1 = JSON.parse(fs.readFileSync(path.join(root, 'data/drx-dose-batch1-v1.json'), 'utf8'));
  const batch2 = JSON.parse(fs.readFileSync(path.join(root, 'data/drx-dose-batch2-v1.json'), 'utf8'));
  const items = [
    ...(Array.isArray(batch1.substances) ? batch1.substances : []),
    ...(Array.isArray(batch2.substances) ? batch2.substances : []),
  ];
  return [...new Set(items.map(Queue._test.stableKey).filter(Boolean))].sort();
}

function buildValidatedDiscoveryBatch(doc, options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const limit = options.limit === undefined ? 100 : Number(options.limit);
  const validation = validateCanonicalExport(doc, {
    projectId: options.projectId || PROJECT_ID,
  });
  const errors = [...validation.errors];
  const covered = coveredCanonicalKeys(root);

  if (covered.length !== 35) errors.push('coverage:expected_35_batch1_batch2_keys');

  const available = new Set(
    (Array.isArray(doc?.rows) ? doc.rows : [])
      .map(Queue._test.stableKey)
      .filter(Boolean)
  );
  const missingCovered = covered.filter(key => !available.has(key));
  if (missingCovered.length) errors.push('coverage:covered_keys_missing_from_export');

  let batch = null;
  if (errors.length === 0) {
    batch = Queue.buildDiscoveryBatch(doc.rows, covered, limit);
    if (batch.excludedCanonicalCount !== covered.length) errors.push('queue:covered_exclusion_mismatch');
    if (batch.uncoveredAvailableCount < limit) errors.push('queue:not_enough_uncovered_canonical_rows');
    if (!batch.complete || batch.queuedCount !== limit) errors.push('queue:requested_batch_incomplete');
    if (batch.publicationAllowed !== false) errors.push('queue:publication_must_remain_closed');
  }

  return {
    generationAllowed: errors.length === 0,
    publicationAllowed: false,
    errors,
    evidence: {
      projectId: doc?.projectId || null,
      sourceRelation: doc?.sourceRelation || null,
      exportedAt: doc?.exportedAt || null,
      snapshotSha256: doc?.snapshotSha256 || null,
      coveredCanonicalCount: covered.length,
      missingCovered,
    },
    batch: errors.length === 0 ? batch : null,
  };
}

function arg(name, fallback = null) {
  const prefix = '--' + name + '=';
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

if (require.main === module) {
  const input = arg('input');
  if (!input) {
    console.error(JSON.stringify({
      ok: false,
      error: 'canonical_export_input_required',
      publicationAllowed: false,
    }, null, 2));
    process.exit(1);
  }

  const output = path.resolve(arg('output', 'artifacts/drx-first100-discovery-batch-v1.json'));
  const doc = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const result = buildValidatedDiscoveryBatch(doc, {
    limit: Number(arg('limit', '100')),
    root: path.resolve(__dirname, '..'),
  });

  console.log(JSON.stringify({
    ok: result.generationAllowed,
    errors: result.errors,
    evidence: result.evidence,
    queuedCount: result.batch?.queuedCount || 0,
    publicationAllowed: false,
  }, null, 2));

  if (!result.generationAllowed) process.exit(1);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    ...result.batch,
    sourceExportEvidence: result.evidence,
    publicationAllowed: false,
  }, null, 2) + '\n');
}

module.exports = {
  PROJECT_ID,
  EXPORT_SCHEMA,
  computeSnapshotHash,
  validateCanonicalExport,
  coveredCanonicalKeys,
  buildValidatedDiscoveryBatch,
  _test: { snapshotPayload, normalizedRow, compareRows },
};
