'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Normalizer = require('../lib/dose-rule-normalizer.js');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data/drx-batch2-extraction-index-v1.json');
const OUTPUT = path.join(ROOT, 'data/drx-batch2-normalization-index-v1.json');

function validSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ''));
}

function candidateFromExtraction(row) {
  return {
    canonicalKey:row.canonicalKey,
    sourceKey:row.sourceKey,
    sourceSnapshotId:row.snapshotId,
    sourceEvidenceHash:row.rawSha256,
    sourceSection:'4.2',
    sourceSectionSha256:row.section42Sha256 || row.sectionSha256?.['4.2'] || null,
    extractionReady:Boolean(
      row.section41Present
      && row.section42Present
      && row.extractionGate?.allowed
      && validSha256(row.section42Sha256 || row.sectionSha256?.['4.2'])
    ),
    normalizationStatus:'requires_structured_dose_candidate',
    publicationAllowed:false,
  };
}

function build(options = {}) {
  const inputPath = options.inputPath || INPUT;
  const write = options.write !== false;
  const extraction = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const rows = extraction.rows.map(candidateFromExtraction);
  const output = {
    schemaVersion:'drx-batch2-normalization-index-v1',
    generatedAt:new Date().toISOString(),
    extractionSchemaVersion:extraction.schemaVersion,
    targetCount:extraction.targetCount,
    extractionComplete:extraction.complete === true,
    readyForStructuredDoseCandidateCount:rows.filter(x => x.extractionReady).length,
    normalizedRuleCount:0,
    publicationAllowed:false,
    rows,
    gate:{
      allowNormalization:extraction.complete === true
        && extraction.failedCount === 0
        && rows.length === extraction.targetCount
        && rows.every(x => x.extractionReady),
      requireClinicalDoseStructuring:true,
      requireNormalizerValidation:true,
      requireSafetyValidation:true,
      requireExactProductBinding:true,
      requireClinicalReview:true,
    },
  };

  if (write) fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
  return output;
}

function validateStructuredRule(input) {
  return Normalizer.validateRule(input);
}

if (require.main === module) {
  try {
    const output = build();
    console.log(JSON.stringify({
      schemaVersion:output.schemaVersion,
      targetCount:output.targetCount,
      readyForStructuredDoseCandidateCount:output.readyForStructuredDoseCandidateCount,
      normalizedRuleCount:output.normalizedRuleCount,
      allowNormalization:output.gate.allowNormalization,
    }, null, 2));
    if (!output.gate.allowNormalization) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { candidateFromExtraction, build, validateStructuredRule, INPUT, OUTPUT, _test:{ validSha256 } };
