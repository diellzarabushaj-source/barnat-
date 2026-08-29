'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const wave = JSON.parse(fs.readFileSync(path.join(ROOT,'data/drx-batch2-live-evidence-wave1-v1.json'),'utf8'));

assert.equal(wave.schemaVersion,'drx-batch2-live-evidence-wave1-v1');
assert.equal(wave.sourceCount,5);
assert.equal(wave.sources.length,5);
assert.equal(wave.publicationAllowed,false);
assert.equal(wave.completionGate.liveWebEvidenceComplete,true);
assert.equal(wave.completionGate.archiveHashesComplete,false);
assert.equal(wave.completionGate.exactProductBindingComplete,false);
assert.equal(wave.completionGate.normalizedRulesComplete,false);
assert.equal(wave.completionGate.clinicalReviewComplete,false);
assert.ok(wave.sources.every(x => x.section41Present && x.section42Present));
assert.ok(wave.sources.every(x => x.archiveHashStatus === 'pending'));
const bisoprolol = wave.sources.find(x => x.canonicalKey === 'bisoprolol');
assert.ok(bisoprolol.reviewFlags.includes('section41_section42_indication_mismatch'));
assert.equal(bisoprolol.normalizationStatus,'blocked_clinical_review');
const pantoprazole = wave.sources.find(x => x.canonicalKey === 'pantoprazole');
assert.ok(pantoprazole.reviewFlags.includes('do_not_auto_publish_antibiotic_components'));
console.log('DRx Batch 2 live evidence wave 1 guards passed.');
