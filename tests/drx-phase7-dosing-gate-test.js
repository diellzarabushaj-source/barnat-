'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20260830162033_drx_phase7a_dosing_evidence_publication_guards.sql',
  'utf8'
);
const workflow = fs.readFileSync(
  '.github/workflows/drx-phase7-dosing-gate.yml',
  'utf8'
);
const rollback = fs.readFileSync(
  'docs/DRX-PHASE7-ROLLBACK.md',
  'utf8'
);

assert.match(migration,/create schema if not exists drx_dose/i);
assert.match(migration,/source_posology_claims_v1/);
assert.match(migration,/product_source_bindings_v1/);
assert.match(migration,/legacy_regimen_candidates_v1/);
assert.match(migration,/phase7_review_queue_v1/);

assert.match(migration,/structured_rule_payload is null/);
assert.match(migration,/automatic_migration_allowed=false/);
assert.match(migration,/publication_eligible=false/);

assert.match(migration,/guard_v3_product_publication_v1/);
assert.match(migration,/guard_v3_rule_publication_v1/);
assert.match(migration,/guard_v3_binding_verification_v1/);
assert.match(migration,/drx_v3_product_publication_guard/);
assert.match(migration,/drx_v3_rule_publication_guard/);
assert.match(migration,/drx_v3_binding_verification_guard/);

assert.match(migration,/source_section_sha256/);
assert.match(migration,/section_4_2_sha256/);
assert.match(migration,/candidate_count=1/);
assert.match(migration,/safety_validation_status<>'passed'/);
assert.match(migration,/no verified product-source binding/i);
assert.match(migration,/drx_phase7_status_v1/);
assert.match(migration,/free_text_rule_inference_enabled',false/);
assert.match(migration,/legacy_auto_migration_enabled',false/);
assert.match(migration,/publication_allowed',false/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase7-status-evidence/);
assert.match(workflow,/drx-phase7-dosing-gate-test\.js/);

assert.match(rollback,/Phase 6/i);
assert.match(rollback,/do not drop/i);
assert.match(rollback,/publication_allowed=false/i);

console.log('DRx Phase 7 dosing publication gate contract: PASS');
