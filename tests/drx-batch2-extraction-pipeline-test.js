'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const batch = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/drx-dose-batch2-v1.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/drx-dose-source-map-v1.json'), 'utf8'));
const builder = require('../scripts/build-drx-batch2-extraction-index.js');

assert.equal(batch.targetCount, 25);
assert.equal(batch.substances.length, 25);

for (const item of batch.substances) {
  const mapped = map.substances[item.canonicalKey];
  assert.ok(mapped, item.canonicalKey + ' must exist in canonical source map');
  const candidate = mapped.candidates.find(x => x.sourceKey === item.sourceKey);
  assert.ok(candidate, item.canonicalKey + ' sourceKey must match canonical source map');
  assert.equal(candidate.url, item.url, item.canonicalKey + ' URL must match canonical source map');
  assert.equal(candidate.tier, 'EMC');
  assert.equal(candidate.hasDoseSection, true);
}

const sampleHtml = `
<h2>4.1 Therapeutic indications</h2>
<p>Example indication.</p>
<h2>4.2 Posology and method of administration</h2>
<p>Example dose.</p>
<h2>4.3 Contraindications</h2><p>Example.</p>
<h2>4.4 Special warnings and precautions</h2><p>Example.</p>
<h2>4.5 Interaction with other medicinal products</h2><p>Example.</p>
<h2>4.6 Fertility, pregnancy and lactation</h2><p>Example.</p>
<h2>4.7 Effects on ability to drive and use machines</h2><p>Example.</p>
<h2>4.8 Undesirable effects</h2><p>Example.</p>
<h2>4.9 Overdose</h2><p>Example.</p>
<h2>5. Pharmacological properties</h2>
`;

const fakeHeaders = { get(name) {
  const key = String(name).toLowerCase();
  if (key === 'content-type') return 'text/html; charset=utf-8';
  if (key === 'etag') return '"test-etag"';
  if (key === 'last-modified') return 'Sat, 29 Aug 2026 00:00:00 GMT';
  return null;
}};

const fakeFetch = async url => ({
  ok:true,
  status:200,
  url,
  headers:fakeHeaders,
  arrayBuffer:async () => Buffer.from(sampleHtml, 'utf8'),
});

(async () => {
  const result = await builder.extractOne(batch.substances[0], { fetchImpl:fakeFetch });
  assert.equal(result.sourceTier, 'EMC');
  assert.equal(result.section41Present, true);
  assert.equal(result.section42Present, true);
  assert.equal(result.extractionGate.allowed, true);
  assert.equal(result.presentSections.length, 9);
  assert.equal(result.missingSections.length, 0);
  assert.match(result.rawSha256, /^[0-9a-f]{64}$/);
  console.log('DRx Batch 2 extraction pipeline contract passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
