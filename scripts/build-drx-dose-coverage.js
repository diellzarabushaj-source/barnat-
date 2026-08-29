'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SourceMap = require('../lib/dose-source-map.js');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUTPUT = path.join(DATA, 'drx-dose-coverage-snapshot.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function percent(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function buildCoverage() {
  const sourceMap = SourceMap.loadSourceMap();
  const sourceValidation = SourceMap.validateSourceMap(sourceMap);
  const pilotFiles = fs.readdirSync(DATA)
    .filter(name => /^drx-pilot-.+-v1\.json$/.test(name))
    .sort();
  const pilots = pilotFiles.map(name => ({
    file:name,
    data:readJson(path.join(DATA, name)),
  }));

  const mappedSubstances = Object.keys(sourceMap.substances || {}).length;
  const pilotSubstances = new Set(pilots.map(item => item.data?.canonicalSubstance?.key).filter(Boolean));
  const candidateRules = pilots.reduce((sum, item) =>
    sum + (Array.isArray(item.data?.extractedRuleCandidates) ? item.data.extractedRuleCandidates.length : 0), 0);
  const boundRules = pilots.reduce((sum, item) =>
    sum + (item.data?.extractedRuleCandidates || []).filter(rule =>
      ['bound','verified','published'].includes(String(rule.bindingStatus || '').toLowerCase())
    ).length, 0);
  const publishedRules = pilots.reduce((sum, item) =>
    sum + (item.data?.extractedRuleCandidates || []).filter(rule =>
      String(rule.editorialStatus || '').toLowerCase() === 'published'
    ).length, 0);
  const publicationEnabledPilots = pilots.filter(item => item.data?.publicationAllowed === true).length;

  return {
    schemaVersion:'drx-dose-coverage-snapshot-v1',
    generatedAt:new Date().toISOString(),
    denominatorState:{
      canonicalSubstances:null,
      canonicalProducts:null,
      liveDatabaseAvailable:false,
      reason:'Supabase SQL gateway unavailable; global percentages remain null rather than using stale denominators.',
    },
    discovery:{
      mappedSubstances,
      sourceCandidates:sourceValidation.summary.candidates,
      archiveReadySources:sourceValidation.summary.archiveReady,
      publicationReadySources:sourceValidation.summary.publicationReady,
      publicationReadyPercentOfMappedCandidates:percent(
        sourceValidation.summary.publicationReady,
        sourceValidation.summary.candidates
      ),
    },
    pilots:{
      files:pilotFiles,
      substances:pilotSubstances.size,
      ruleCandidates:candidateRules,
      boundRules,
      publishedRules,
      publicationEnabledPilots,
      bindingPercent:percent(boundRules, candidateRules),
      publicationPercent:percent(publishedRules, candidateRules),
    },
    global:{
      sourcedPercent:null,
      parsedPercent:null,
      verifiedPercent:null,
      publishedPercent:null,
    },
    safety:{
      failClosed:true,
      globalCoverageUnknownIsNotZero:true,
      noStaleDatabaseDenominator:true,
    },
  };
}

const snapshot = buildCoverage();
fs.writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2) + '\n');
console.log(JSON.stringify(snapshot, null, 2));

module.exports = { buildCoverage, percent };
