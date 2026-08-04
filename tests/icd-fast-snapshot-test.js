'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const FullIcd = require('../lib/icd-full-hierarchy.js');
const Snapshot = require('../lib/icd-hierarchy-snapshot.js');
const Source = require('../lib/icd-public-source.js');
const Base = require('../lib/icd-api-base.js');

const root = path.resolve(__dirname, '..');
for (const file of ['sw.js', 'sw-resilient.js', 'sw-resilient-v3.js']) {
  const worker = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(worker, /const QUERY_DATA_PATHS = new Set\(\['\/api\/drug-search', '\/api\/icd'\]\)/);
  const privatePaths = worker.match(/const PRIVATE_DATA_PATHS = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
  assert.doesNotMatch(privatePaths, /'\/api\/icd'/);
  assert.match(worker, /function queryKey\(url\)[\s\S]*normalized\.searchParams\.sort\(\)/);
}
const treeSource = fs.readFileSync(path.join(root, 'icd-tree.js'), 'utf8');
const sidebarSource = fs.readFileSync(path.join(root, 'icd-sidebar.js'), 'utf8');
assert.match(treeSource, /MedIndexIcdNavPromise/);
assert.match(sidebarSource, /MedIndexIcdNavPromise/);
assert.equal(Source.SOURCE_URLS.every(url => url.endsWith('&range=A:J')), true);
assert.ok(fs.statSync(Snapshot.SNAPSHOT_PATH).size < 1024 * 1024, 'ICD snapshot must stay below 1 MB compressed.');

Snapshot._test.resetForTests();
Source._test.resetForTests();
const originalFetch = global.fetch;
let networkCalls = 0;
global.fetch = async () => {
  networkCalls += 1;
  throw new Error('Cold snapshot path must not touch the network.');
};

(async () => {
  const coldStarted = performance.now();
  const loaded = await Source.load();
  const coldMs = performance.now() - coldStarted;
  assert.equal(networkCalls, 0);
  assert.deepEqual(loaded.data.counts, FullIcd.EXPECTED_COUNTS);
  assert.equal(loaded.data.nodes.length, FullIcd.EXPECTED_COUNTS.total);
  assert.equal(FullIcd.nodeMap(loaded.data).size, FullIcd.EXPECTED_COUNTS.total);
  assert.ok(coldMs < 750, `Cold snapshot/index path was ${coldMs.toFixed(1)}ms.`);

  const warmStarted = performance.now();
  const warm = await Source.load();
  const warmMs = performance.now() - warmStarted;
  assert.strictEqual(warm, loaded);
  assert.equal(networkCalls, 0);
  assert.ok(warmMs < 25, `Warm snapshot path was ${warmMs.toFixed(1)}ms.`);

  const direct = loaded.data.nodes.find(node =>
    node.primaryCareRole === 'URGJENCË NË MF'
    && ['category', 'subcategory'].includes(node.level));
  assert.ok(direct);
  const suggestStarted = performance.now();
  const result = Base._test.fullViewPayload(loaded.data, {
    view:'suggest',
    q:direct.code,
  }, loaded);
  const suggestMs = performance.now() - suggestStarted;
  const suggestBudgetMs = process.env.VERCEL || process.env.CI ? 350 : 120;
  assert.equal(networkCalls, 0);
  assert.ok(result.rows.length > 0);
  assert.ok(result.rows.some(row => row.isDirectUrgency && row.urgencyLevel === 'direct'));
  assert.ok(
    suggestMs < suggestBudgetMs,
    `Snapshot suggestion path was ${suggestMs.toFixed(1)}ms (budget ${suggestBudgetMs}ms).`,
  );

  assert.equal(direct.isUrgent, true);
  assert.equal(direct.isDirectUrgency, true);
  assert.equal(direct.urgencyLevel, 'direct');
  assert.equal(typeof direct.managementSummary, 'string');

  console.log(`ICD snapshot cache-first benchmark passed (cold ${coldMs.toFixed(1)}ms, warm ${warmMs.toFixed(1)}ms, suggest ${suggestMs.toFixed(1)}ms).`);
})().finally(() => {
  global.fetch = originalFetch;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
