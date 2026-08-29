'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname,'..');
const wave = JSON.parse(fs.readFileSync(path.join(ROOT,'data/drx-batch2-live-evidence-wave2-v1.json'),'utf8'));

assert.equal(wave.sourceCount,5);
assert.equal(wave.sources.length,5);
assert.equal(wave.publicationAllowed,false);
assert.ok(wave.sources.every(x => x.section41Present && x.section42Present));
assert.ok(wave.sources.every(x => x.archiveHashStatus === 'pending'));
assert.equal(wave.completionGate.archiveHashesComplete,false);
const cipro = wave.sources.find(x => x.canonicalKey === 'ciprofloxacin');
assert.ok(cipro.reviewFlags.includes('high_risk_antimicrobial'));
assert.ok(cipro.reviewFlags.includes('renal_adjustment_required'));
const furo = wave.sources.find(x => x.canonicalKey === 'furosemide');
assert.ok(furo.reviewFlags.includes('infusion_rate_required'));
const cet = wave.sources.find(x => x.canonicalKey === 'cetirizine');
assert.ok(cet.reviewFlags.includes('renal_metric_mapping_requires_review'));
console.log('DRx Batch 2 live evidence wave 2 guards passed.');
