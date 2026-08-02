'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('icd.html');
const health = read('icd-workspace-health.js');
const polish = read('icd-tree-polish.css');
const apiBase = read('lib/icd-api-base.js');

for (const marker of [
  'id="icdSourceHealth"', 'id="icdSourceHealthLabel"', 'id="icdSourceHealthDetail"',
  'id="icdSourceHealthRefresh"', 'role="status"', 'aria-atomic="true"', 'aria-busy="true"',
  'icd-workspace-health.js?v=icd-workspace-health-v1', 'icd-tree-polish.css?v=icd-tree-polish-v3',
  'icd-terminology-detail.js?v=icd-terminology-detail-v1',
]) assert.ok(html.includes(marker), `ICD workspace source UI missing ${marker}`);

for (const marker of [
  "const API = '/api/icd?view=meta'", 'RETRYABLE_STATUS', 'retryDelay', 'requestMeta',
  'medindex_icd_workspace_health_v1', 'medindex:icd-workspace-source-health', 'navigator.onLine',
  "window.addEventListener('online'", "window.addEventListener('offline'", 'Promise.allSettled',
  'MedIndexIcdWorkspaceHealth', 'performance.measure', 'reloadTree:true', 'aria-busy',
]) assert.ok(health.includes(marker), `ICD workspace health runtime missing ${marker}`);

for (const marker of [
  '.icd-source-health', '[data-state="live"]', '[data-state="stale"]',
  '[data-state="offline"]', '[data-state="error"]', '@media(prefers-reduced-motion:reduce)',
  '@media(forced-colors:active)', 'html[data-theme="dark"]',
]) assert.ok(polish.includes(marker), `ICD workspace source styling missing ${marker}`);

for (const marker of ['source:IcdPublicSource.sourceMeta(loaded)', "view === 'meta'", 'X-MedIndex-ICD-Source-State']) {
  assert.ok(apiBase.includes(marker), `ICD meta API missing ${marker}`);
}

assert.ok(!fs.existsSync(path.join(root, 'api/icd-workspace-health.js')), 'Workspace source health must reuse the existing ICD API function.');
assert.doesNotMatch(health, /eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(polish, /https?:\/\//);
new Function(health);
console.log('ICD workspace live, stale, cached and offline source status contracts passed.');
