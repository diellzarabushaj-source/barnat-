'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const STATUS_PATH = path.join(ROOT, 'data/drx-dosierung-master-plan-status.json');
const EXTRACTION_PATH = path.join(ROOT, 'data/drx-batch2-extraction-index-v1.json');
const NORMALIZATION_PATH = path.join(ROOT, 'data/drx-batch2-normalization-index-v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pushUnique(list, value) {
  if (!Array.isArray(list)) return [value];
  if (!list.includes(value)) list.push(value);
  return list;
}

function update(options = {}) {
  const statusPath = options.statusPath || STATUS_PATH;
  const extractionPath = options.extractionPath || EXTRACTION_PATH;
  const normalizationPath = options.normalizationPath || NORMALIZATION_PATH;
  const write = options.write !== false;

  const status = readJson(statusPath);
  const extraction = readJson(extractionPath);
  const normalization = readJson(normalizationPath);
  const phase16 = status.phases.find(phase => phase.id === 16);
  if (!phase16) throw new Error('Phase 16 status row is missing.');

  const extractionComplete = extraction.complete === true
    && extraction.extractedCount === extraction.targetCount
    && extraction.failedCount === 0
    && extraction.rows.every(row =>
      row.section41Present === true
      && row.section42Present === true
      && row.extractionGate?.allowed === true
      && /^[0-9a-f]{64}$/i.test(String(row.rawSha256 || ''))
    );

  const versionedCount = extraction.rows.filter(row => Boolean(row.documentDate)).length;

  phase16.status = extractionComplete
    ? 'LIVE_EXTRACTION_COMPLETE_AWAITING_STRUCTURED_DOSE_RULES'
    : 'IN_PROGRESS_LIVE_EXTRACTION';
  phase16.evidence = pushUnique(phase16.evidence, 'data/drx-batch2-extraction-index-v1.json');
  phase16.evidence = pushUnique(phase16.evidence, 'data/drx-batch2-normalization-index-v1.json');
  phase16.evidence = pushUnique(phase16.evidence, `${extraction.extractedCount}/${extraction.targetCount} live Batch 2 SmPC snapshots extracted`);
  phase16.evidence = pushUnique(phase16.evidence, `${versionedCount}/${extraction.targetCount} live document dates captured`);
  phase16.next = extractionComplete
    ? 'structure clinically faithful dose candidates from section 4.2, validate with normalizer+safety, then exact product binding and clinical review'
    : 'resolve failed live SmPC extractions before any dose structuring';

  status.updatedAt = new Date().toISOString();
  status.currentExecution.phase = 16;
  status.currentExecution.objective = extractionComplete
    ? 'Batch 2 live extraction is complete. Next gate: structure dose candidates from archived evidence without auto-publishing; then normalizer, safety, exact product binding, legacy comparison, confidence and clinical review.'
    : 'Batch 2 live extraction remains incomplete; fail closed until all 25 authoritative SmPC sources pass sections 4.1/4.2 and evidence hash checks.';
  status.currentExecution.batch2ExtractedSources = extraction.extractedCount;
  status.currentExecution.publicationAllowed = false;

  status.databaseBlocker = status.databaseBlocker || {};
  status.databaseBlocker.active = true;
  status.databaseBlocker.system = 'Supabase SQL/MCP database gateway';
  status.databaseBlocker.rule = 'Do not bypass live verification; keep publication closed until Supabase SQL gateway is available and V3 persistence is verified.';

  const summary = {
    phase:16,
    extractionComplete,
    extractedCount:extraction.extractedCount,
    failedCount:extraction.failedCount,
    documentDateCount:versionedCount,
    normalizationGateOpen:normalization.gate?.allowNormalization === true,
    normalizedRuleCount:normalization.normalizedRuleCount,
    publicationAllowed:false,
  };

  if (write) fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n', 'utf8');
  return summary;
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(update(), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { update, STATUS_PATH, EXTRACTION_PATH, NORMALIZATION_PATH };
