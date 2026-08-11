'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Health = require('../api/neon-status.js')._test;
const IcdHealth = require('../lib/icd-health-audit.js');

execFileSync(process.execPath, ['--check', path.join(root, 'api', 'neon-status.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'lib', 'icd-health-audit.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'system-health.js')], { stdio:'pipe' });

const now = Date.parse('2026-07-30T06:00:00.000Z');
assert.equal(Health.sourceState({ enabled:true, last_status:'pending', last_synced_at:null }, now).code, 'setup_required');
assert.equal(Health.sourceState({ enabled:true, last_status:'failed', last_synced_at:null }, now).code, 'error');
assert.equal(Health.sourceState({ enabled:true, last_status:'synced', last_synced_at:'2026-07-30T05:55:00.000Z' }, now).code, 'healthy');
assert.equal(Health.sourceState({ enabled:true, last_status:'synced', last_synced_at:'2026-07-30T05:30:00.000Z' }, now).code, 'stale');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'healthy' }]).code, 'healthy');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'setup_required' }]).code, 'setup_required');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'error' }]).code, 'error');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'warning' }]).code, 'warning');
assert.equal(Health.REQUIRED_DOSAGE_SHEETS.length, 3);
assert.equal(IcdHealth.EXPECTED_COUNTS.total, 12542);
assert.equal(IcdHealth.SEARCH_PROBES.length, 5);

const html = read('sistemi.html');
const css = read('system-health.css');
const client = read('system-health.js');
const shell = read('tailadmin-shell.js');
const shellCore = read('tailadmin-shell-core.js');
const middleware = read('middleware.ts');
const endpoint = read('api/neon-status.js');
const driveSync = read('api/drive-sync.js');
const icdAudit = read('lib/icd-health-audit.js');

for (const marker of [
  'systemOverallState', 'systemSourceList', 'systemEditorEvents', 'systemImportRows',
  'setupMedIndexPerfectSync', '/api/neon-status', 'systemIcdState', 'systemIcdSummary',
  'systemIcdLiveNodes', 'systemIcdRevision', 'systemIcdLoadedAt', 'systemIcdSourceStatus',
  'systemIcdProbeScore', 'systemIcdProbeList', 'system-health-v2',
]) assert.ok(`${html}\n${client}`.includes(marker), `Missing system dashboard marker ${marker}`);

assert.match(css, /system-state\.is-success/);
assert.match(css, /system-icd-metrics/);
assert.match(css, /system-probe\.is-failed/);
assert.match(css, /@media\(max-width:560px\)/);
assert.match(css, /@media\(forced-colors:active\)/);
assert.match(client, /REFRESH_MS = 30000/);
assert.match(client, /credentials:'same-origin'/);
assert.match(client, /function renderIcd/);
assert.match(client, /clinical-ranking-v3/);
assert.match(client, /Cache i fundit i vlefshëm/);
assert.match(shell, /ensureSystemNavItem/);
assert.match(shell, /data-medical-nav=\\?"system/);
assert.match(shellCore, /\/sistemi\.html/);
assert.match(shellCore, /function buildNavigation\(/);
assert.match(middleware, /PUBLIC_SECRET_APIS/);
assert.match(middleware, /'\/api\/drive-sync'/);
assert.doesNotMatch(middleware, /PUBLIC_(?:PATHS|SECRET_APIS)[\s\S]{0,900}'\/api\/neon-status'/);
assert.match(driveSync, /verifiedSecret/);
assert.match(driveSync, /auth_secret_hash/);
assert.match(driveSync, /status\(401\)/);
assert.doesNotMatch(endpoint, /auth_secret_hash/);
assert.match(endpoint, /drive_sync_sources/);
assert.match(endpoint, /audit_logs/);
assert.match(endpoint, /sync_runs/);
assert.match(endpoint, /STALE_AFTER_MS = 15 \* 60 \* 1000/);
assert.match(endpoint, /IcdHealth\.loadHealth\(IcdPublicSource, now\)/);
assert.match(endpoint, /statusVersion:3/);
assert.match(endpoint, /state:dosageState/);
assert.match(endpoint, /overallState\(\[dosageState, icd\.state\]\)/);
assert.match(icdAudit, /auditCache = new WeakMap/);
assert.match(icdAudit, /clinical-ranking-v3/);
assert.match(icdAudit, /diagnosticDecision:false/);
assert.match(icdAudit, /dhimbje gjoksi/);
assert.ok(!fs.existsSync(path.join(root, 'api', 'icd-health.js')), 'ICD health must reuse the existing private system endpoint.');

console.log('System health, canonical shell navigation, private status, ICD observability and secret-authenticated sync gateway passed.');
