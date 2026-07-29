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

assert.match(api, /pull_editor_updates/);
assert.match(api, /source=eq\.clinical_editor/);
assert.match(api, /action=eq\.editor_update/);
assert.match(api, /drugs/);
assert.match(api, /dosage_cards/);
assert.match(api, /auth_secret_hash/);
assert.doesNotMatch(api, /MEDINDEX_DRIVE_SYNC_SECRET\s*=\s*['"][^'"]+['"]/);

for (const marker of [
  'setupMedIndexBidirectionalSync',
  'medIndexEditorPull',
  'everyMinutes(MEDINDEX_EDITOR_PULL_INTERVAL_MINUTES)',
  "action:'pull_editor_updates'",
  'LockService',
  'upsertMedIndexState_',
]) assert.ok(appsScript.includes(marker), `Missing ${marker}`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'medindex-bidirectional-'));
try {
  const checkPath = path.join(temp, 'apps-script.js');
  fs.writeFileSync(checkPath, appsScript);
  execFileSync(process.execPath, ['--check', checkPath], { stdio:'pipe' });
} finally {
  fs.rmSync(temp, { recursive:true, force:true });
}

console.log('Bidirectional Google Sheet and Neon sync contract passed.');
