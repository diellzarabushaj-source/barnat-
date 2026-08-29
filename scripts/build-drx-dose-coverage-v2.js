'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function build() {
  const batch1 = readJson('data/drx-dose-batch1-v1.json');
  const batch2 = readJson('data/drx-dose-batch2-v1.json');

  let batch2Extraction = null;
  if (exists('data/drx-batch2-extraction-index-v1.json')) {
    batch2Extraction = readJson('data/drx-batch2-extraction-index-v1.json');
  }

  let batch2Normalization = null;
  if (exists('data/drx-batch2-normalization-index-v1.json')) {
    batch2Normalization = readJson('data/drx-batch2-normalization-index-v1.json');
  }

  const mapped = batch1.substances.length + batch2.substances.length;
  const extracted = batch1.gates?.representativeExtractionCompleteForBatch
    ? batch1.substances.length + Number(batch2Extraction?.extractedCount || 0)
    : Number(batch2Extraction?.extractedCount || 0);
  const normalized = batch1.gates?.structuralNormalizationCheckedForNewPilots
    ? batch1.substances.length + Number(batch2Normalization?.normalizedRuleCount || 0)
    : Number(batch2Normalization?.normalizedRuleCount || 0);

  return {
    schemaVersion:'drx-dose-coverage-snapshot-v2',
    generatedAt:new Date().toISOString(),
    publicationAllowed:false,
    counts:{
      batch1Substances:batch1.substances.length,
      batch2Substances:batch2.substances.length,
      mappedSources:mapped,
      extractedSubstances:extracted,
      normalizedSubstances:normalized,
      exactProductBound:0,
      legacyCompared:0,
      clinicallyReviewed:0,
      published:0,
    },
    gates:{
      supabaseLiveAvailable:false,
      batch2ExtractionArtifactPresent:Boolean(batch2Extraction),
      batch2NormalizationArtifactPresent:Boolean(batch2Normalization),
      publicationBlocked:true,
    },
    next:"increase each count only from persisted evidence; never infer completion from planned work",
  };
}

if (require.main === module) {
  const output = build();
  const target = path.join(ROOT, 'data/drx-dose-coverage-snapshot-v2.json');
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(output, null, 2));
}

module.exports = { build };
