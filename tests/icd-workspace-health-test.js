'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const runtime = read('icd-workspace-health.js');
const polish = read('icd-tree-polish.css');
const advanced = read('icd-advanced-search.js');
const apiBase = read('lib/icd-api-base.js');

for (const marker of [
  'id="icdSourceHealth"', 'id="icdSourceStatus"', 'id="icdSourceHealthDetail"',
  'id="icdSourceHealthRefresh"', 'role="status"', 'aria-atomic="true"', 'aria-busy="true"',
  'icd-workspace-health.js?v=icd-workspace-health-v2', 'icd-tree-polish.css?v=icd-tree-polish-v5',
  'icd-advanced-search.js?v=sq-clinical-search-v3-ui1', 'icd-terminology-detail.js?v=icd-terminology-detail-v1',
  'icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1',
]) assert.ok(html.includes(marker), `ICD workspace health surface missing ${marker}`);

assert.ok(
  html.indexOf('icd-search-race-guard-v2.js?v=icd-race-guard-v5')
    < html.indexOf('icd-workspace-health.js?v=icd-workspace-health-v2'),
  'Workspace health must load after the search race guard.',
);
assert.ok(
  html.indexOf('icd-workspace-health.js?v=icd-workspace-health-v2')
    < html.indexOf('icd-prescription-roundtrip.js?v=icd-rx-roundtrip-v1'),
  'Workspace health must preserve the prescription round-trip layer.',
);

for (const marker of [
  "const API = '/api/icd?view=meta'", 'MedIndexNativeFetch', 'RETRYABLE_STATUS',
  'retryDelay', 'requestMeta', 'medindex_icd_workspace_health_v2',
  'medindex:icd-workspace-source-health', 'navigator.onLine',
  "window.addEventListener('online'", "window.addEventListener('offline'",
  'Promise.allSettled', 'MedIndexIcdWorkspaceHealth', 'performance.measure',
  'reloadTree:true', 'MutationObserver', 'aria-busy', 'cache lokal',
  'for (let attempt = 0; attempt < 2; attempt += 1)',
  "url.searchParams.set('attempt', String(attempt + 1))",
  "'X-MedIndex-ICD-Workspace':'health-v2'",
]) assert.ok(runtime.includes(marker), `ICD workspace health runtime missing ${marker}`);

for (const marker of [
  '.icd-source-health', '.icd-source-health-detail', '.icd-source-health-refresh',
  'data-source-status="live"', 'data-source-status="stale"', 'data-source-status="cached"',
  'data-source-status="offline"', 'data-state="error"',
  '@media(prefers-reduced-motion:reduce)', '@media(forced-colors:active)', 'html[data-theme="dark"]',
]) assert.ok(polish.includes(marker), `ICD workspace health styling missing ${marker}`);

for (const marker of ['loadSourceStatus', 'renderSourceStatus', 'id="icdSourceStatus"', 'Burimi: live']) {
  const source = marker === 'id="icdSourceStatus"' ? html : advanced;
  assert.ok(source.includes(marker), `Existing ICD source integration missing ${marker}`);
}
for (const marker of ['source:IcdPublicSource.sourceMeta(loaded)', "view === 'meta'", 'X-MedIndex-ICD-Source-State']) {
  assert.ok(apiBase.includes(marker), `ICD meta API missing ${marker}`);
}

assert.ok(!fs.existsSync(path.join(root, 'api/icd-workspace-health.js')), 'Workspace health must reuse the existing ICD API function.');
assert.doesNotMatch(runtime, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(polish, /https?:\/\//);
new Function(runtime);
console.log('ICD workspace live, stale, cached, offline, deterministic retry and accessible refresh contracts passed.');
