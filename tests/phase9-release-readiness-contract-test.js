'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const pkg = JSON.parse(read('package.json'));
const fullTest = String(pkg.scripts?.test || '');

for (const required of [
  'phase1-public-security-contract-test.js',
  'phase2-shallow-registry-read-model-test.js',
  'phase3-ranked-registry-search-test.js',
  'phase4-incremental-ingredient-refresh-test.js',
  'phase5-system-health-snapshot-test.js',
  'phase6-index-rationalization-guard-test.js',
  'phase6-index-audit-contract-test.js',
  'phase7-supabase-sync-cutover-test.js',
  'phase7-supabase-maintenance-script-test.js',
  'phase7-sync-staging-validation-test.js',
  'phase8-auth-storage-identity-test.js',
  'phase8-identity-rekey-audit-contract-test.js',
]) {
  assert.ok(fullTest.includes(required), 'Full test suite is missing release guard: ' + required);
}

// Temporary Phase 5 migration bypasses must never become permanent surfaces.
assert.equal(exists('.github/workflows/phase5-apply-system-health-snapshot.yml'), false);
assert.equal(exists('api/phase5-migrate-once.js'), false);

// Canonical runtime transports must be Supabase named; legacy names are wrappers only.
assert.match(read('lib/neon-data-api.js'), /module\.exports\s*=\s*require\('\.\/medindex-data-api\.js'\)/);
assert.match(read('lib/drive-neon-sync.js'), /module\.exports\s*=\s*require\('\.\/drive-supabase-sync\.js'\)/);

const medindexTransport = read('lib/medindex-data-api.js');
assert.match(medindexTransport, /return 'supabase'/);
assert.match(medindexTransport, /return supabaseRequest\(path, options, \{ privileged \}\)/);

// Phase 6 remains non-destructive until live evidence has been collected.
const phase6 = JSON.parse(read('data/phase6-index-rationalization.json'));
assert.equal(phase6.policy.destructiveDropAllowed, false);
assert.equal(phase6.indexes.filter(item => item.status === 'DROP_CANDIDATE').length, 6);

// Phase 6 and 8 live evidence packs must remain read-only.
for (const audit of [
  'sql/phase6-index-audit.sql',
  'sql/phase8-identity-rekey-audit.sql',
]) {
  const sql = read(audit);
  assert.match(sql, /begin\s+read\s+only/i);
  assert.match(sql, /rollback\s*;/i);
  assert.doesNotMatch(sql, /\b(drop|create|alter)\s+(table|index|view|function|schema)\b/i);
  assert.doesNotMatch(sql, /\b(insert\s+into|delete\s+from|update\s+[a-z_"][a-z0-9_".]*\s+set)\b/i);
}

// Auth and storage identities must remain distinct in runtime code.
const identity = read('lib/user-identity.js');
assert.match(identity, /Never fall back to session\.uid/);
assert.match(identity, /SUPABASE_AUTH_UUID_REQUIRED/);
assert.match(read('lib/user-library.js'), /storageUidFromUser\(user\)/);
assert.match(read('lib/user-library.js'), /user_id:authUid/);

// Drive sync must stage first and fail closed before marking a source synced.
const drive = read('lib/drive-supabase-sync.js');
const mirrorAt = drive.indexOf('const mirrored = await mirrorRows');
const publishAt = drive.indexOf('const normalized = await syncNormalized');
const syncedAt = drive.indexOf("await setSourceStatus(source.id, 'synced')");
assert.ok(mirrorAt >= 0 && publishAt > mirrorAt && syncedAt > publishAt);
assert.match(drive, /validateSourceConfig\(source, config\)/);
assert.match(drive, /requireMappedRow/);
assert.match(drive, /sourceHash:rowHash\(values\)/);

// Keep the existing deep security gates part of the release suite.
for (const securityGate of [
  'api-security-deep-audit-test.js',
  'supabase-write-cutover-test.js',
  'supabase-auth-guards-test.js',
]) {
  assert.ok(fullTest.includes(securityGate), 'Security gate missing from full suite: ' + securityGate);
}

console.log('Phase 9 static release readiness contract passed.');
