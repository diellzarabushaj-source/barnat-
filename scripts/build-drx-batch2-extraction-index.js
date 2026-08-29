'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Archive = require('../lib/dose-source-archive.js');
const SmPC = require('../lib/smpc-parser.js');

const ROOT = path.resolve(__dirname, '..');
const BATCH_PATH = path.join(ROOT, 'data/drx-dose-batch2-v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/drx-batch2-extraction-index-v1.json');

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isRetryable(error) {
  const status = Number(error?.status || 0);
  if (status === 429 || status >= 500) return true;
  if (error?.code === 'DOSE_SOURCE_FETCH_FAILED') return status === 0 || status === 429 || status >= 500;
  return /fetch failed|network|socket|timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(String(error?.message || ''));
}

async function extractOne(item, options = {}) {
  const snapshot = await Archive.fetchSourceSnapshot(item.url, {
    authoritativeOnly:true,
    fetchImpl:options.fetchImpl,
  });
  const gate = SmPC.publicationExtractionGate(snapshot.parsed);
  let archiveFiles = null;
  if (options.archiveDirectory) {
    archiveFiles = Archive.writeSnapshot(snapshot, options.archiveDirectory);
  }

  return {
    canonicalKey:item.canonicalKey,
    canonicalName:item.canonicalName,
    sourceKey:item.sourceKey,
    requestedUrl:item.url,
    finalUrl:snapshot.finalUrl,
    sourceTier:snapshot.sourceTier,
    authority:snapshot.authority,
    jurisdiction:snapshot.jurisdiction,
    fetchedAt:snapshot.fetchedAt,
    etag:snapshot.etag || null,
    lastModified:snapshot.lastModified || null,
    documentDate:snapshot.sourceDocument?.documentDate || null,
    productName:snapshot.sourceDocument?.productName || null,
    contentLength:snapshot.contentLength,
    rawSha256:snapshot.rawSha256,
    snapshotId:snapshot.snapshotId,
    parserSchemaVersion:snapshot.parser.schemaVersion,
    presentSections:snapshot.parser.present,
    missingSections:snapshot.parser.missing,
    clinicalSectionCoverage:snapshot.parser.clinicalSectionCoverage,
    section41Present:snapshot.parser.indicationsSectionPresent,
    section42Present:snapshot.parser.doseSectionPresent,
    sectionSha256:snapshot.sectionSha256 || {},
    section41Sha256:snapshot.sectionSha256?.['4.1'] || null,
    section42Sha256:snapshot.sectionSha256?.['4.2'] || null,
    extractionGate:gate,
    archiveFiles:archiveFiles ? {
      rawPath:path.relative(ROOT, archiveFiles.rawPath),
      metaPath:path.relative(ROOT, archiveFiles.metaPath),
    } : null,
  };
}

async function extractWithRetry(item, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
  const baseDelayMs = Math.max(0, Number(options.retryBaseDelayMs) || 750);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const row = await extractOne(item, options);
      return { ...row, fetchAttempt:attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryable(error)) break;
      await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

async function build(options = {}) {
  const rows = [];
  const errors = [];
  const interRequestDelayMs = Math.max(0, Number(options.interRequestDelayMs) || 350);

  for (let index = 0; index < batch.substances.length; index += 1) {
    const item = batch.substances[index];
    if (index > 0 && interRequestDelayMs > 0) await sleep(interRequestDelayMs);
    if (!item.url || !item.sourceKey) {
      errors.push({ canonicalKey:item.canonicalKey, error:'source_missing' });
      continue;
    }
    try {
      rows.push(await extractWithRetry(item, options));
    } catch (error) {
      errors.push({
        canonicalKey:item.canonicalKey,
        sourceKey:item.sourceKey,
        error:error?.code || error?.message || 'unknown_error',
      });
    }
  }

  const complete = rows.length === batch.targetCount
    && errors.length === 0
    && rows.every(row => row.section41Present && row.section42Present);

  const output = {
    schemaVersion:'drx-batch2-extraction-index-v1',
    generatedAt:new Date().toISOString(),
    batchSchemaVersion:batch.schemaVersion,
    targetCount:batch.targetCount,
    extractedCount:rows.length,
    failedCount:errors.length,
    complete,
    publicationAllowed:false,
    rows,
    errors,
  };

  if (options.write !== false) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  }
  return output;
}

function archiveDirectoryFromEnvironment(env = process.env) {
  const configured = String(env?.DRX_ARCHIVE_DIR || '').trim();
  if (!configured) return null;
  return path.resolve(ROOT, configured);
}

if (require.main === module) {
  const archiveDirectory = archiveDirectoryFromEnvironment();
  build({ archiveDirectory:archiveDirectory || undefined }).then(output => {
    console.log(JSON.stringify({
      schemaVersion:output.schemaVersion,
      targetCount:output.targetCount,
      extractedCount:output.extractedCount,
      failedCount:output.failedCount,
      complete:output.complete,
    }, null, 2));
    if (!output.complete) process.exitCode = 1;
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { extractOne, extractWithRetry, build, OUTPUT_PATH, _test:{ sleep, isRetryable, archiveDirectoryFromEnvironment } };
