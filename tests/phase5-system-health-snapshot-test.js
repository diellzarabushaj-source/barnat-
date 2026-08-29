'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const snapshot = read('lib/system-health-snapshot.js');
const dataApi = read('lib/medindex-data-api.js');
const endpoint = read('api/neon-status.js');
const client = read('system-health.js');
const editor = read('lib/clinical-editor.js');
const adminDrugs = read('lib/admin-drugs.js');
const driveSync = read('api/drive-sync.js');
const publish = read('scripts/publish-neon-registry.js');
const migration = read('supabase/migrations/20260829012500_phase5_system_health_snapshot.sql');

assert.match(migration, /create table if not exists public\.medindex_system_health_snapshot_v1/i);
assert.match(migration, /alter table public\.medindex_system_health_snapshot_v1 enable row level security/i);
assert.match(migration, /revoke all on table public\.medindex_system_health_snapshot_v1[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant select on table public\.medindex_system_health_snapshot_v1[\s\S]*to service_role/i);
assert.match(migration, /create or replace function private\.medindex_mark_system_health_snapshot_dirty_v1\(\)/i);
assert.match(migration, /for each statement execute function private\.medindex_mark_system_health_snapshot_dirty_v1\(\)/i);
for (const relation of [
  'drugs','dosage_regimens','icd_codes','lab_tests',
  'drive_sync_sources','audit_logs','sync_runs','sync_outbox',
]) assert.ok(migration.includes(`'${relation}'`), `Missing dirty trigger source ${relation}`);
assert.match(migration, /dirty_revision = public\.medindex_system_health_snapshot_v1\.dirty_revision \+ 1/i);
assert.match(migration, /create or replace function public\.medindex_refresh_system_health_snapshot_v1\(\)/i);
assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog, public, private/i);
assert.match(migration, /refreshed_revision = target_revision/i);
assert.match(migration, /revoke all on function public\.medindex_refresh_system_health_snapshot_v1\(\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.medindex_refresh_system_health_snapshot_v1\(\)[\s\S]*to service_role/i);
assert.match(migration, /select public\.medindex_refresh_system_health_snapshot_v1\(\)/i);

assert.match(snapshot, /SNAPSHOT_RELATION = 'medindex_system_health_snapshot_v1'/);
assert.match(snapshot, /SNAPSHOT_RPC = 'rpc\/medindex_refresh_system_health_snapshot_v1'/);
assert.match(snapshot, /dirtyRevision > snapshot\.refreshedRevision/);
assert.match(snapshot, /async function getFresh\(\)/);
assert.match(snapshot, /async function refreshBestEffort/);

assert.match(dataApi, /'medindex_system_health_snapshot_v1'/);
const privateSet = dataApi.slice(
  dataApi.indexOf('const PRIVATE_SERVER_RELATIONS'),
  dataApi.indexOf('];', dataApi.indexOf('const PRIVATE_SERVER_RELATIONS')) + 2
);
assert.match(privateSet, /medindex_system_health_snapshot_v1/);

assert.match(endpoint, /SystemHealthSnapshot = require\('\.\.\/lib\/system-health-snapshot\.js'\)/);
assert.match(endpoint, /async function liveDatabaseHealth\(\)/);
assert.match(endpoint, /async function databaseHealth\(options = \{\}\)/);
assert.match(endpoint, /options\.forceSnapshot === true[\s\S]*SystemHealthSnapshot\.refresh\(\)/);
assert.match(endpoint, /SystemHealthSnapshot\.getFresh\(\)/);
assert.match(endpoint, /statusVersion:5/);
assert.match(endpoint, /databaseSnapshot:/);

const healthStart = endpoint.indexOf('async function healthPayload');
const healthEnd = endpoint.indexOf('\nfunction exportInteger', healthStart);
assert(healthStart >= 0 && healthEnd > healthStart, 'healthPayload bounds must exist');
const hotPath = endpoint.slice(healthStart, healthEnd);
assert.doesNotMatch(hotPath, /tableCount\(/, 'Normal health payload must not run table counts directly.');
assert.doesNotMatch(hotPath, /SyncOutbox\.stats\(/, 'Normal health payload must not scan outbox directly.');
assert.doesNotMatch(hotPath, /drive_sync_sources\?select=/, 'Normal health payload must not query sync sources directly.');

assert.match(client, /async function load\(forceSnapshot = false\)/);
assert.match(client, /forceSnapshot \? '\/api\/neon-status\?refresh=1' : '\/api\/neon-status'/);
assert.match(client, /addEventListener\('click', \(\) => load\(true\)\)/);
assert.match(client, /REFRESH_MS = 30000/);

assert.match(editor, /SystemHealthSnapshot\.refreshBestEffort\('clinical-editor'\)/);
assert.match(adminDrugs, /SystemHealthSnapshot\.refreshBestEffort\('admin-drug-create'\)/);
assert.match(driveSync, /SystemHealthSnapshot\.refreshBestEffort\('drive-sync-complete'\)/);
assert.match(driveSync, /SystemHealthSnapshot\.refreshBestEffort\('drive-sync-ack'\)/);
assert.match(driveSync, /SystemHealthSnapshot\.refreshBestEffort\('drive-sync-fail'\)/);
assert.match(publish, /SystemHealthSnapshot\.refreshBestEffort\('registry-publish'\)/);

console.log('Phase 5 system health snapshot runtime contract passed.');
