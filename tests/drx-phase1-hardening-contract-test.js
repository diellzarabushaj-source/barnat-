'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const migration=fs.readFileSync(path.join(ROOT,'supabase/migrations/20260830123219_drx_phase1_rpc_metadata_and_stage_hardening.sql'),'utf8');
const rollback=fs.readFileSync(path.join(ROOT,'supabase/drx-phase1-rpc-metadata-rollback.sql'),'utf8');
const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/drx-safety-gate.yml'),'utf8');
const releaseTest=fs.readFileSync(path.join(ROOT,'tests/drx-production-release-readiness-test.js'),'utf8');
const history=require('../supabase/migration-history.json');
const baseline=require('../data/drx-phase1-baseline-v1.json');

assert.match(migration,/grant select \(snapshot_id, source_key, source_tier, document_version, document_date\)[\s\S]*dose_source_snapshots_v3 to anon, authenticated/);
assert.match(migration,/grant select \(snapshot_id, section_code, section_sha256, extraction_status\)[\s\S]*dose_source_sections_v3 to anon, authenticated/);
assert.match(migration,/dose_source_snapshots_v3_rpc_metadata_read/);
assert.match(migration,/dose_source_sections_v3_rpc_metadata_read/);
assert.doesNotMatch(migration,/grant select \([^)]*section_text[^)]*\)/i);
assert.doesNotMatch(migration,/grant select \([^)]*extracted_json[^)]*\)/i);
assert.match(migration,/revoke all on schema drx_stage from public, anon, authenticated/);
assert.doesNotMatch(migration,/alter table drx_stage\.[a-z0-9_]+ enable row level security/i);

assert.match(rollback,/drop policy if exists dose_source_sections_v3_rpc_metadata_read/);
assert.match(rollback,/revoke select \([^)]+section_sha256[^)]+\)\s+on public\.dose_source_sections_v3 from anon, authenticated/s);

assert.match(workflow,/"api\/\*dosage\*\.js"/);
assert.match(workflow,/"api\/\*\*\/\*dosage\*\.js"/);
assert.match(workflow,/"supabase\/\*\.sql"/);
assert.match(workflow,/"supabase\/\*\*\/\*\.sql"/);
assert.match(workflow,/node --check api\/dosage\.js/);

assert.match(releaseTest,/r\.releaseReady,r\.blockers\.length===0/);
assert.doesNotMatch(releaseTest,/assert\.equal\(r\.releaseReady,false\)/);

assert.equal(baseline.supabase.postPhase1.migrationCount,84);
assert.ok(history.migrations.length >= baseline.supabase.postPhase1.migrationCount);
assert.deepEqual(
  history.migrations.at(baseline.supabase.postPhase1.migrationCount - 1),
  {
    version:'20260830123219',
    name:'drx_phase1_rpc_metadata_and_stage_hardening'
  }
);
assert.equal(baseline.supabase.postPhase1.sourceSnapshots,100);
assert.equal(baseline.supabase.postPhase1.sourceSections,575);
assert.equal(baseline.supabase.postPhase1.clientWriteGrantLeaks,0);
assert.equal(baseline.supabase.postPhase1.sectionTextClientReadable,false);
assert.equal(baseline.publicationAllowed,false);
console.log('DRx strict Phase 1 hardening contract passed.');
