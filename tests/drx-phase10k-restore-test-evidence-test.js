'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const evidence=require('../data/drx-phase10k-restore-test-evidence-v1.json');

const migration=fs.readFileSync('supabase/migrations/20260831060712_drx_phase10k_restore_test_evidence.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/drx-phase10-cutover-gate.yml','utf8');

assert.equal(evidence.status,'PASS');
assert.equal(evidence.restoreVerified,true);
assert.equal(evidence.sourceRestoreParity,true);
assert.equal(evidence.credentialMode,'db_url');
assert.equal(evidence.workflowRunId,33362564597);
assert.equal(evidence.artifactId,9747261797);
assert.match(evidence.artifactDigest,/^sha256:[0-9a-f]{64}$/);
assert.deepEqual(evidence.sourceManifest,evidence.restoredManifest);
assert.equal(evidence.sourceManifest.drugs_count,4015);
assert.equal(evidence.sourceManifest.dosage_regimens_count,8104);
assert.equal(evidence.sourceManifest.v3_products_count,2);
assert.equal(evidence.sourceManifest.v3_rules_count,4);
assert.equal(evidence.sourceManifest.v3_bindings_count,4);
assert.equal(evidence.sourceManifest.published_rules_count,4);

assert.match(migration,/'RESTORE_TEST_PASS'/);
assert.match(migration,/'GITHUB_ACTION'/);
assert.match(migration,/33362564597/);
assert.match(migration,/9747261797/);
assert.match(migration,/f3493a6bc7d59a417d799747f68471a8d30d66f6a3cbfcd8582f21f4d6c27b48/);
assert.match(migration,/v_products<>2 or v_rules<>4 or v_bindings<>4/);
assert.match(migration,/on conflict \(gate_key,evidence_sha256\) do nothing/);
assert.match(workflow,/Phase 10K current restore test evidence/);
assert.match(workflow,/node tests\/drx-phase10k-restore-test-evidence-test\.js/);

console.log('DRx Phase 10K current logical backup/restore evidence: PASS');
