'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const manifest = JSON.parse(read('data/phase6-index-rationalization.json'));

assert.equal(manifest.version, 'phase6-index-rationalization-v1');
assert.equal(manifest.policy.destructiveDropAllowed, false);
for (const item of manifest.policy.requiredEvidence) {
  assert.equal(typeof item, 'string');
  assert.ok(item.length > 3);
}

const byName = new Map(manifest.indexes.map(item => [item.name, item]));
assert.equal(byName.size, manifest.indexes.length, 'Index manifest contains duplicate names.');

const protectedIndexes = [
  'drugs_published_active_substance_registry_idx',
  'drugs_published_strength_registry_idx',
  'user_notes_drug_idx',
  'user_notes_user_live_updated_idx',
  'verification_documents_reviewed_by_idx',
  'profiles_status_created_idx',
];
for (const name of protectedIndexes) {
  assert.equal(byName.get(name)?.status, 'KEEP', `${name} must remain KEEP until explicit evidence changes.`);
}

const expectedCandidates = [
  'drugs_search_idx',
  'sync_outbox_entity_idx',
  'sync_outbox_processing_idx',
  'drive_sheet_rows_hash_idx',
  'drive_sheet_rows_payload_gin_idx',
  'drive_sheet_rows_source_row_idx',
];
for (const name of expectedCandidates) {
  assert.equal(byName.get(name)?.status, 'DROP_CANDIDATE', `${name} must stay a candidate, not an automatic drop.`);
}

const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
const phase6Start = '20260829012500';
const futureMigrations = fs.readdirSync(migrationsDir)
  .filter(name => name.endsWith('.sql') && name.slice(0, 14) > phase6Start)
  .sort();

const forbiddenDrop = protectedIndexes.map(name => new RegExp(
  String.raw`drop\\s+index(?:\\s+concurrently)?(?:\\s+if\\s+exists)?(?:\\s+public\\.)?${name}\\b`,
  'i'
));

for (const file of futureMigrations) {
  const sql = read(path.join('supabase', 'migrations', file));
  for (let i = 0; i < protectedIndexes.length; i += 1) {
    assert.doesNotMatch(sql, forbiddenDrop[i], `${file} must not drop protected index ${protectedIndexes[i]}.`);
  }
}

assert.ok(
  manifest.indexes.some(item => item.status === 'DEFER'),
  'Phase 6 must preserve a DEFER class for clinically meaningful indexes without enough evidence.'
);

console.log('Phase 6 index rationalization safety contract passed.');
