'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const api = read('api/drive-sync.js');
const appsScript = read('google-apps-script/medindex-neon-editor-pull.gs');
const currentSync = read('google-apps-script/medindex-current-dosage-sync.gs');

assert.match(api, /pull_editor_updates/);
assert.match(api, /source=eq\.clinical_editor/);
assert.match(api, /action=eq\.editor_update/);
assert.match(api, /drugs/);
assert.match(api, /dosage_cards/);
assert.match(api, /auth_secret_hash/);
assert.match(api, /CURRENT_DOSAGE_SPREADSHEET_ID/);
assert.match(api, /canonicalPayload/);
assert.match(api, /Kategoria e administrimit/);
assert.match(api, /Rrugët e lejuara/);
assert.doesNotMatch(api, /MEDINDEX_DRIVE_SYNC_SECRET\s*=\s*['"][^'"]+['"]/);

for (const marker of [
  'setupMedIndexBidirectionalSync',
  'medIndexEditorPull',
  'everyMinutes(MEDINDEX_EDITOR_PULL_INTERVAL_MINUTES)',
  "action:'pull_editor_updates'",
  'LockService',
  'upsertMedIndexState_',
]) assert.ok(appsScript.includes(marker), `Missing ${marker}`);

for (const marker of [
  'setupMedIndexCurrentDosageBidirectionalSync',
  'medIndexCurrentDosageOnEdit',
  'medIndexCurrentDosageReconcile',
  'medIndexCurrentDosageEditorPull',
  'everyMinutes(5)',
  'everyMinutes(1)',
  'NEON_SYNC_STATE_CURRENT',
  '1T7XsfkXLQfEomFL4DmXoA8PheiR6s3Qmu36hTqklOMo',
  'KARTELA_BARNAVE',
  'DOZA_TE_RRITUR',
  'DOZA_PEDIATRIKE',
]) assert.ok(currentSync.includes(marker), `Missing current sync marker ${marker}`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-bidirectional-'));
try {
  const editorCheck = path.join(temp, 'editor-pull.js');
  const currentCheck = path.join(temp, 'current-sync.js');
  fs.writeFileSync(editorCheck, appsScript);
  fs.writeFileSync(currentCheck, currentSync);
  execFileSync(process.execPath, ['--check', editorCheck], { stdio:'pipe' });
  execFileSync(process.execPath, ['--check', currentCheck], { stdio:'pipe' });
} finally {
  fs.rmSync(temp, { recursive:true, force:true });
}

console.log('Bidirectional Google Sheet and Neon sync contract passed.');
