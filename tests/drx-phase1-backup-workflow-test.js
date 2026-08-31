'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/drx-phase1-backup-restore.yml'),'utf8');
const baseline=require('../data/drx-phase1-baseline-v1.json');
const evidence=require('../data/drx-phase1-backup-restore-evidence-v1.json');

assert.match(workflow,/secrets\.SUPABASE_DB_URL/);
assert.match(workflow,/supabase\/setup-cli@v1/);
assert.match(workflow,/version: 2\.116\.0/);
assert.match(workflow,/supabase db dump --db-url "\$SUPABASE_DB_URL"/);
assert.match(workflow,/--role-only/);
assert.match(workflow,/--use-copy --data-only/);
assert.match(workflow,/--schema supabase_migrations/);
assert.match(workflow,/supabase start/);
assert.match(workflow,/postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/);
assert.match(workflow,/Capture source restore manifest/);
assert.match(workflow,/drugs_count=/);
assert.match(workflow,/dosage_regimens_count=/);
assert.match(workflow,/source_snapshots_count=/);
assert.match(workflow,/source_sections_count=/);
assert.match(workflow,/v3_products_count=/);
assert.match(workflow,/v3_rules_count=/);
assert.match(workflow,/v3_bindings_count=/);
assert.match(workflow,/fingerprint=/);
assert.match(workflow,/diff -u "\$RUNNER_TEMP\/drx-source-manifest\.txt" "\$RUNNER_TEMP\/drx-restore-manifest\.txt"/);
assert.match(workflow,/Require independent source manifest/);
assert.doesNotMatch(workflow,/grep -qx 'v3_products=0'/);
assert.match(workflow,/runner_ephemeral_only_no_database_payload_uploaded/);
assert.doesNotMatch(workflow,/path:\s*[|>]?[\s\S]{0,120}(roles\.sql|schema\.sql|data\.sql)/);

const sources=baseline.googleSourceSnapshots;
assert.equal(sources.length,4);
for(const source of sources){
  assert.match(source.sha256,/^[0-9a-f]{64}$/);
  assert.ok(source.hashKind);
}
assert.equal(baseline.googleSnapshotGate.status,'PASS');
assert.equal(baseline.publicationAllowed,false);
assert.equal(baseline.backupAndRestore.gateStatus,'PASS');
assert.equal(baseline.backupAndRestore.restoreVerified,true);
assert.equal(baseline.phase1ExitGate.status,'PASS');
assert.equal(evidence.status,'PASS');
assert.equal(evidence.backupCreated,true);
assert.equal(evidence.restoreVerified,true);
if(evidence.schemaVersion==='drx-phase1-backup-restore-evidence-v2'){
  assert.equal(evidence.sourceRestoreParity,true);
  assert.deepEqual(evidence.sourceManifest,evidence.restoredManifest);
  assert.ok(Number.isInteger(evidence.restoredManifest.drugs_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.dosage_regimens_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.source_snapshots_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.source_sections_count));
} else {
  assert.equal(evidence.restoredCounts.drugs,4015);
  assert.equal(evidence.restoredCounts.dosage_regimens,8104);
  assert.equal(evidence.restoredCounts.source_snapshots,100);
  assert.equal(evidence.restoredCounts.source_sections,575);
}
assert.equal(evidence.publicationAllowed,false);

console.log('DRx Phase 1 backup/restore workflow and Google snapshot hash contract passed.');
