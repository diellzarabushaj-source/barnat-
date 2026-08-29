'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Queue = require('./build-drx-first100-discovery-queue.js');

const ROOT = path.resolve(__dirname, '..');
const BATCH1 = path.join(ROOT, 'data/drx-dose-batch1-v1.json');
const BATCH2 = path.join(ROOT, 'data/drx-dose-batch2-v1.json');
const OUT = path.join(ROOT, 'data/drx-bulk-discovery-batches-v1.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function coveredKeys(batch1, batch2) {
  const b1 = (batch1.substances || []).map(x => x.key ?? x.canonicalKey ?? x.canonical_key).filter(Boolean);
  const b2 = (batch2.substances || []).map(x => x.canonicalKey ?? x.canonical_key ?? x.key).filter(Boolean);
  return [...b1, ...b2];
}

function build(canonicalRows, options = {}) {
  if (!Array.isArray(canonicalRows)) throw new TypeError('canonicalRows must be an array');
  const batch1 = options.batch1 || loadJson(BATCH1);
  const batch2 = options.batch2 || loadJson(BATCH2);
  const covered = coveredKeys(batch1, batch2);

  const sizes = options.sizes || [100, 250, 500];
  const batches = sizes.map(size => Queue.buildDiscoveryBatch(canonicalRows, covered, size));

  const normalizedCanonical = Queue.normalizeCanonicalRows(canonicalRows);
  const coveredSet = new Set(covered.map(Queue._test.stableKey).filter(Boolean));
  const uncovered = normalizedCanonical.filter(row => !coveredSet.has(row.canonicalKey));

  return {
    schemaVersion:'drx-bulk-discovery-batches-v1',
    generatedAt:new Date().toISOString(),
    canonicalCount:normalizedCanonical.length,
    coveredCount:normalizedCanonical.filter(row => coveredSet.has(row.canonicalKey)).length,
    uncoveredCount:uncovered.length,
    coveredByPlanCount:coveredSet.size,
    sourceOfTruth:'public.substance_concepts_v1',
    requiredInputShape:['concept_id','canonical_key','canonical_name'],
    publicationAllowed:false,
    batchSizes:sizes,
    batches:batches.map(batch => ({
      requestedCount:batch.requestedCount,
      queuedCount:batch.queuedCount,
      complete:batch.complete,
      publicationAllowed:false,
      firstCanonicalKey:batch.queue[0]?.canonicalKey || null,
      lastCanonicalKey:batch.queue.at(-1)?.canonicalKey || null,
      queue:batch.queue,
    })),
    gates:{
      sourceExportResolved:true,
      sourceRowsValidated:normalizedCanonical.length > 0,
      batch1And2Excluded:true,
      deterministicOrdering:true,
      publicationAllowed:false,
    },
  };
}

function fromFile(inputPath, options = {}) {
  const payload = loadJson(inputPath);
  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) throw new TypeError('input JSON must be an array or { rows: [] }');
  const output = build(rows, options);
  if (options.write !== false) fs.writeFileSync(options.outputPath || OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
  return output;
}

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/build-drx-bulk-discovery-batches.js <canonical-export.json>');
    process.exitCode = 2;
  } else {
    try {
      const output = fromFile(path.resolve(inputPath));
      console.log(JSON.stringify({
        canonicalCount:output.canonicalCount,
        coveredCount:output.coveredCount,
        uncoveredCount:output.uncoveredCount,
        batchSizes:output.batchSizes,
        batchQueuedCounts:output.batches.map(x => x.queuedCount),
        publicationAllowed:output.publicationAllowed,
      }, null, 2));
      if (!output.gates.sourceRowsValidated) process.exitCode = 1;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}

module.exports = { build, fromFile, coveredKeys, OUT };
