'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const Health = require('../api/neon-status.js')._test;

execFileSync(process.execPath, ['--check', path.join(root, 'api', 'neon-status.js')], { stdio:'pipe' });
execFileSync(process.execPath, ['--check', path.join(root, 'system-health.js')], { stdio:'pipe' });

const now = Date.parse('2026-07-30T06:00:00.000Z');
assert.equal(Health.sourceState({ enabled:true, last_status:'pending', last_synced_at:null }, now).code, 'setup_required');
assert.equal(Health.sourceState({ enabled:true, last_status:'failed', last_synced_at:null }, now).code, 'error');
assert.equal(Health.sourceState({ enabled:true, last_status:'synced', last_synced_at:'2026-07-30T05:55:00.000Z' }, now).code, 'healthy');
assert.equal(Health.sourceState({ enabled:true, last_status:'synced', last_synced_at:'2026-07-30T05:30:00.000Z' }, now).code, 'stale');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'healthy' }]).code, 'healthy');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'setup_required' }]).code, 'setup_required');
assert.equal(Health.overallState([{ code:'healthy' }, { code:'error' }]).code, 'error');
assert.equal(Health.REQUIRED_DOSAGE_SHEETS.length, 3);

const html = read('sistemi.html');
const css = read('system-health.css');
const client = read('system-health.js');
const shell = read('tailadmin-shell.js');
const legacyShell = read('tailadmin-shell-legacy.js');
const middleware = read('middleware.ts');
const endpoint = read('api/neon-status.js');

for (const marker of [
  'systemOverallState', 'systemSourceList', 'systemEditorEvents', 'systemImportRows',
  'setupMedIndexPerfectSync', '/api/neon-status',
]) assert.ok(`${html}\n${client}`.includes(marker), `Missing system dashboard marker ${marker}`);

assert.match(css, /system-state\.is-success/);
assert.match(css, /@media\(max-width:560px\)/);
assert.match(client, /REFRESH_MS = 30000/);
assert.match(client, /credentials:'same-origin'/);
assert.match(shell, /ensureSystemNavItem/);
assert.match(shell, /data-medical-nav=\\?"system/);
assert.match(legacyShell, /\/sistemi\.html/);
assert.doesNotMatch(middleware, /PUBLIC_PATHS[\s\S]{0,800}'\/api\/neon-status'/);
assert.doesNotMatch(endpoint, /auth_secret_hash/);
assert.match(endpoint, /drive_sync_sources/);
assert.match(endpoint, /audit_logs/);
assert.match(endpoint, /sync_runs/);
assert.match(endpoint, /STALE_AFTER_MS = 15 \* 60 \* 1000/);

console.log('System health, private status and synchronization dashboard passed.');
