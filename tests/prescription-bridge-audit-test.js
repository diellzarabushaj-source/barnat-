const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const bridgePath = path.join(ROOT, 'prescription-bridge.js');
assert.ok(fs.existsSync(bridgePath), 'Prescription context bridge is missing');
execFileSync(process.execPath, ['--check', bridgePath], { stdio:'pipe' });

const bridge = fs.readFileSync(bridgePath, 'utf8');
[
  /medindex_rx_autodraft_v1/,
  /medindex_rx_diagnosis_v1/,
  /DRAFT_MAX_AGE/,
  /rxComposer/,
  /rxDiagnosis/,
  /pendingDiagnosis/,
  /dispatchEvent\(new Event\('input'/,
  /medindex:clinical-workflow-ready/,
  /medindex:prescription-context-ready/,
].forEach(pattern => assert.match(bridge, pattern, `Prescription bridge missing ${pattern}`));

const html = fs.readFileSync(path.join(ROOT, 'recetat.html'), 'utf8');
assert.equal((html.match(/prescription-bridge\.js/gi) || []).length, 1, 'Prescription bridge must load exactly once');
assert.match(html, /prescription-bridge\.js\?v=clinical-audit-v2/, 'Prescription bridge cache version is stale');
assert.ok(html.indexOf('auth-client.js') < html.indexOf('prescription-bridge.js'), 'Auth must initialize before the prescription bridge');
assert.ok(html.indexOf('prescription-bridge.js') < html.indexOf('recetat.js'), 'Prescription bridge must listen before prescription initialization');

console.log('ICD-to-prescription draft continuity audit passed.');
