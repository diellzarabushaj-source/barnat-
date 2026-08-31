'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', name), 'utf8');
}

const bg = read('20260831152824_drx_phase11bg_canonical_rule_targets_and_numeric_strength.sql');
const bh = read('20260831152852_drx_phase11bh_source_regimen_product_inheritance_preview.sql');
const bi = read('20260831152943_drx_phase11bi_gated_rule_target_stager.sql');
const bj = read('20260831153017_drx_phase11bj_product_shell_queue_and_candidate_binder.sql');
const bk = read('20260831153315_drx_phase11bk_split_calculator_text_only_completion.sql');
const bl = read('20260831153909_drx_phase11bl_identity_disposition_and_batch_review.sql');
const bm = read('20260831154148_drx_phase11bm_completion_v3_and_review_workbench.sql');
const bn = read('20260831154455_drx_phase11bn_exact_source_safety_scope.sql');
const bo = read('20260831160114_drx_phase11bo_safety_invariants_and_cutover_guard.sql');

assert.match(bg, /required_strength_value numeric/);
assert.match(bg, /required_strength_unit text/);
assert.match(bg, /dose_moiety_key is not null/);
assert.match(bg, /inherited_rule_matches_v2/);
assert.match(bg, /EXACT_STRENGTH/);

assert.match(bh, /source_regimen_product_inheritance_preview_v1/);
assert.match(bh, /STRICT_CANDIDATE/);
assert.match(bh, /REVIEW_REQUIRED/);
assert.match(bh, /BLOCKED/);
assert.match(bh, /false::boolean as auto_bind_allowed/);

assert.match(bi, /source_regimen_promotion_gate_v4/);
assert.match(bi, /binding_status,verified_by,verified_at/);
assert.match(bi, /'DRAFT'/);
assert.match(bi, /productBindingsCreated',false/);

assert.match(bj, /product_shell_provisioning_queue_v1/);
assert.match(bj, /rule_product_binding_staging_events_v1/);
assert.match(bj, /binding_status.*candidate/s);
assert.match(bj, /conversionEnabled',false/);
assert.match(bj, /autoVerified',false/);
assert.match(bj, /autoPublished',false/);

assert.match(bk, /CALCULATOR_TARGET/);
assert.match(bk, /REVIEWED_TEXT_ONLY_TARGET/);
assert.match(bk, /CALCULATOR_V3/);
assert.match(bk, /TEXT_ONLY_REFERENCE/);
assert.match(bk, /TEXT_ONLY_DISPOSITION/);
assert.match(bk, /PRN_CEILINGS/);

assert.match(bl, /product_identity_disposition_v3/);
assert.match(bl, /SPECIAL_MODEL_ROUTED/);
assert.match(bl, /HOMEOPATHIC_COMPLEX/);
assert.match(bl, /VACCINE_OR_BIOLOGIC/);
assert.match(bl, /PARENTERAL_NUTRITION/);
assert.match(bl, /ingredient_identity_review_batches_v1/);
assert.match(bl, /REVIEWED_BATCH/);
assert.match(bl, /auto_dose_inheritance_allowed/);

assert.match(bm, /PRODUCT_DISPOSITION_COVERAGE/);
assert.match(bm, /STANDARD_IDENTITY_REVIEW_REMAINING/);
assert.match(bm, /phase11_review_workbench_summary_v1/);
assert.match(bm, /auto_approve_allowed/);

assert.match(bn, /source_regimen_applicable_safety_v2/);
assert.match(bn, /a\.source_snapshot_id=r\.source_snapshot_id/);
assert.match(bn, /x\.source_snapshot_id=r\.source_snapshot_id/);
assert.match(bn, /DIRECT_REGIMEN/);
assert.match(bn, /SAME_SOURCE_MOIETY/);
assert.doesNotMatch(bn, /auto_publish_allowed_v6\s*[^,]*true/i);
assert.doesNotMatch(bn, /runtime_ready_v6\s*[^,]*true/i);

assert.match(bo, /phase11_safety_invariant_audit_v1/);
assert.match(bo, /phase11_runtime_cutover_readiness_v1/);
assert.match(bo, /phase11_runtime_approval_v1/);
assert.match(bo, /approved boolean not null default false/);
assert.match(bo, /MANUAL_RUNTIME_APPROVAL_REQUIRED/);
assert.match(bo, /ROLLBACK_TARGET_NOT_V2/);
assert.match(bo, /auto_strict_activation_allowed/);
assert.match(bo, /'autoStrictActivationAllowed',false/);

for (const sql of [bg,bh,bi,bj,bk,bl,bm,bn,bo]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_bind_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_strict_activation_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 finalization contract passed.');
