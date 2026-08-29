'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Status = require('../scripts/update-drx-phase16-live-status.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'drx-phase16-status-'));
const statusPath = path.join(temp, 'status.json');
const extractionPath = path.join(temp, 'extraction.json');
const normalizationPath = path.join(temp, 'normalization.json');
const hash = 'b'.repeat(64);

fs.writeFileSync(statusPath, JSON.stringify({
  phases:[{id:16,status:'IN_PROGRESS',evidence:[],next:''}],
  currentExecution:{phase:16,publicationAllowed:false},
  databaseBlocker:{active:true},
}));
fs.writeFileSync(extractionPath, JSON.stringify({
  targetCount:2,
  extractedCount:2,
  failedCount:0,
  complete:true,
  rows:[
    {section41Present:true,section42Present:true,extractionGate:{allowed:true},rawSha256:hash,documentDate:'2026-04-20'},
    {section41Present:true,section42Present:true,extractionGate:{allowed:true},rawSha256:hash,documentDate:null},
  ],
}));
fs.writeFileSync(normalizationPath, JSON.stringify({
  gate:{allowNormalization:true},
  normalizedRuleCount:0,
  publicationAllowed:false,
}));

const summary = Status.update({statusPath, extractionPath, normalizationPath});
const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

assert.equal(summary.extractionComplete, true);
assert.equal(summary.documentDateCount, 1);
assert.equal(summary.normalizedRuleCount, 0);
assert.equal(summary.publicationAllowed, false);
assert.equal(updated.phases[0].status, 'LIVE_EXTRACTION_COMPLETE_AWAITING_STRUCTURED_DOSE_RULES');
assert.equal(updated.currentExecution.batch2ExtractedSources, 2);
assert.equal(updated.currentExecution.publicationAllowed, false);
assert.equal(updated.databaseBlocker.active, true);

console.log('DRx Phase 16 live status contract passed.');
