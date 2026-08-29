'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Archive = require('../lib/dose-source-archive.js');
const SmPC = require('../lib/smpc-parser.js');

const ROOT = path.resolve(__dirname, '..');
const BATCH_PATH = path.join(ROOT, 'data/drx-dose-batch2-v1.json');
const OUTPUT_PATH = path.join(ROOT, 'data/drx-batch2-extraction-index-v1.json');

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));

async function extractOne(item, options = {}) {
  const snapshot = await Archive.fetchSourceSnapshot(item.url, {
    authoritativeOnly:true,
    fetchImpl:options.fetchImpl,
  });
  const gate = SmPC.publicationExtractionGate(snapshot.parsed);

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
    contentLength:snapshot.contentLength,
    rawSha256:snapshot.rawSha256,
    snapshotId:snapshot.snapshotId,
    parserSchemaVersion:snapshot.parser.schemaVersion,
    presentSections:snapshot.parser.present,
    missingSections:snapshot.parser.missing,
    clinicalSectionCoverage:snapshot.parser.clinicalSectionCoverage,
    section41Present:snapshot.parser.indicationsSectionPresent,
    section42Present:snapshot.parser.doseSectionPresent,
    extractionGate:gate,
  };
}

async function build(options = {}) {
  const rows = [];
  const errors = [];

  for (const item of batch.substances) {
    if (!item.url || !item.sourceKey) {
      errors.push({ canonicalKey:item.canonicalKey, error:'source_missing' });
      continue;
    }
    try {
      rows.push(await extractOne(item, options));
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

if (require.main === module) {
  build().then(output => {
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

module.exports = { extractOne, build, OUTPUT_PATH };
