'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

const ck = read('supabase/migrations/20260831180622_drx_phase11ck_adjustment_projection_and_publication_guard.sql');
const cn = read('supabase/migrations/20260831184114_drx_phase11cn_legacy_parity_and_release_gate.sql');
const co = read('supabase/migrations/20260831184612_drx_phase11co_shadow_evidence_and_cutover_guard.sql');
const cp = read('supabase/migrations/20260831190001_drx_phase11cp_controlled_percent_bypass_guard.sql');
const cq = read('supabase/migrations/20260831191319_drx_phase11cq_evidence_integrity_precheck.sql');
const cr = read('supabase/migrations/20260831191800_drx_phase11cr_safety_integrity_precheck.sql');
const cs = read('supabase/migrations/20260831193039_drx_phase11cs_indication_icd_integrity_and_publication_guard.sql');
const ct = read('supabase/migrations/20260831194123_drx_phase11ct_step_requirement_integrity_prechecks.sql');
const cu = read('supabase/migrations/20260831194503_drx_phase11cu_clinical_review_preflight.sql');
const cv = read('supabase/migrations/20260831194750_drx_phase11cv_clinical_preflight_workbench.sql');
const cw = read('supabase/migrations/20260831195207_drx_phase11cw_evidence_source_review_batches.sql');
const cx = read('supabase/migrations/20260831195625_drx_phase11cx_evidence_batch_drilldown.sql');
const cy = read('supabase/migrations/20260831201723_drx_phase11cy_safety_source_review_batches.sql');
const backend = read('lib/phase11-review.js');
const html = read('admin.html');
const ui = read('admin-phase11-review.js');
const history = JSON.parse(read('supabase/migration-history.json'));

assert.match(ck, /phase11_adjustment_materialization_preview_v1/);
assert.match(ck, /V3_ADJUSTMENT_MATERIALIZATION_ATTESTED/);
assert.match(ck, /guard_phase11_adjustment_publication_v1/);
assert.match(ck, /auto_materialize_allowed/);
assert.match(ck, /auto_publish_allowed/);

assert.match(cn, /phase11_legacy_candidate_rows_v1/);
assert.match(cn, /phase11_legacy_comparison_review_queue_v1/);
assert.match(cn, /LEGACY_COMPARISON_REVIEW_ATTESTED/);
assert.match(cn, /PHASE11_RULE_RELEASE_ATTESTED/);
assert.match(cn, /phase11_rule_release_readiness_v1/);
assert.match(cn, /drx_phase11_publish_verified_rule_release_v1/);
assert.match(cn, /if not v_ready\.ready_for_release then/);
assert.match(cn, /automaticPublication',false/);
assert.match(cn, /dose_rules_v3_phase11_legacy_publication_guard/);
assert.match(cn, /revoke all .* from public,anon,authenticated/is);
assert.match(cn, /grant execute .* to service_role/is);

assert.match(co, /phase11_shadow_evidence_v1/);
assert.match(co, /PHASE11_SHADOW_DIFF_REVIEW_ATTESTED/);
assert.match(co, /EXPLAINED_BY_REVIEWED_V3_CHANGE/);
assert.match(co, /EXPECTED_V3_ONLY/);
assert.match(co, /all_published_rules_legacy_reviewed/);
assert.match(co, /all_published_rules_new_rule_confirmed/);
assert.match(co, /phase11_runtime_cutover_readiness_v2/);
assert.match(co, /PHASE11_PUBLICATION_INCOMPLETE/);
assert.match(co, /PHASE11_SHADOW_EVIDENCE_INCOMPLETE/);
assert.match(co, /auto_strict_activation_allowed_v2/);
assert.match(co, /false::boolean as auto_strict_activation_allowed_v2/);
assert.match(co, /new\.mode='CONTROLLED'[\s\S]*new\.controlled_percent=10/);
assert.match(co, /new\.mode='STRICT'/);
assert.match(co, /phase10_phase11_cutover_guard/);
assert.match(co, /revoke all .* from public,anon,authenticated/is);
assert.match(co, /grant execute .* to service_role/is);

assert.match(cp, /new\.mode='CONTROLLED'/);
assert.match(cp, /new\.controlled_percent>5/);
assert.match(cp, /new\.controlled_percent>old\.controlled_percent/);
assert.match(cp, /old\.mode='SHADOW'/);
assert.match(cp, /new\.mode='STRICT'/);
assert.match(cp, /ready_for_controlled_cutover_v2/);
assert.match(cp, /cutover_blockers_v2/);
assert.match(cp, /revoke all on function drx_dose\.guard_phase10_phase11_cutover_v1\(\)/);

assert.match(cq, /phase11_evidence_integrity_precheck_v1/);
assert.match(cq, /phase11_evidence_integrity_summary_v1/);
assert.match(cq, /AUTO_PROMOTE_MUST_BE_FALSE/);
assert.match(cq, /false::boolean as auto_verify_allowed/);
assert.match(cq, /false::boolean as auto_promote_allowed/);
assert.match(cq, /revoke all on drx_dose\.phase11_evidence_integrity_precheck_v1/);
assert.doesNotMatch(cq, /update\s+drx_dose\.source_regimen_supporting_evidence_v1/i);

assert.match(cr, /phase11_safety_integrity_precheck_v1/);
assert.match(cr, /phase11_safety_integrity_summary_v1/);
assert.match(cr, /DIRECT_REGIMEN_SCOPE_DRIFT/);
assert.match(cr, /SAME_SOURCE_SCOPE_DRIFT/);
assert.match(cr, /AUTO_APPLY_MUST_BE_FALSE/);
assert.match(cr, /false::boolean as auto_approve_allowed/);
assert.match(cr, /false::boolean as auto_apply_allowed/);
assert.match(cr, /revoke all on drx_dose\.phase11_safety_integrity_precheck_v1/);
assert.doesNotMatch(cr, /update\s+drx_dose\.source_(?:adjustment|restriction)_candidates_v1/i);

assert.match(cs, /guard_indication_publication_integrity_v1/);
assert.match(cs, /dose_indication_concepts_v3_publication_integrity_guard/);
assert.match(cs, /Verified indication requires at least one ICD-10 code/);
assert.match(cs, /Published indication requires verified ICD codes and named review provenance/);
assert.match(cs, /phase11_indication_icd_integrity_precheck_v1/);
assert.match(cs, /phase11_indication_icd_integrity_summary_v1/);
assert.match(cs, /REGIMEN_USES_PUBLISHED_UNVERIFIED/);
assert.match(cs, /false::boolean as auto_verify_allowed/);
assert.match(cs, /false::boolean as auto_publish_allowed/);
assert.doesNotMatch(cs, /set\s+icd_verification_status='verified'/i);

assert.match(ct, /phase11_presentation_integrity_precheck_v1/);
assert.match(ct, /phase11_administration_integrity_precheck_v1/);
assert.match(ct, /phase11_step_requirement_integrity_summary_v1/);
assert.match(ct, /SOURCE_NOT_PRIMARY_OR_SUPPORTING/);
assert.match(ct, /SOURCE_SECTION_NOT_4_2/);
assert.match(ct, /false::boolean as auto_verify_allowed/);
assert.match(ct, /false::boolean as auto_bind_or_apply_allowed/);
assert.doesNotMatch(ct, /set\s+review_status='VERIFIED'/i);

assert.match(cu, /phase11_clinical_review_preflight_v1/);
assert.match(cu, /phase11_clinical_review_preflight_summary_v1/);
assert.match(cu, /technical_integrity_blockers/);
assert.match(cu, /upstream_human_review_blockers/);
assert.match(cu, /ready_for_human_clinical_attestation/);
assert.match(cu, /false::boolean as auto_approve_allowed/);
assert.doesNotMatch(cu, /update\s+drx_dose\.source_regimen_candidates_v1/i);

assert.match(cv, /drx_phase11_clinical_preflight_workbench_v1/);
assert.match(cv, /technicalBlocked/);
assert.match(cv, /humanBlockerCounts/);
assert.match(cv, /readyForAttestation/);
assert.match(cv, /autoApproveAllowed',false/);
assert.match(cv, /revoke all on function public\.drx_phase11_clinical_preflight_workbench_v1/);
assert.match(cv, /grant execute on function public\.drx_phase11_clinical_preflight_workbench_v1/);

assert.match(cw, /phase11_evidence_source_review_batches_v1/);
assert.match(cw, /phase11_evidence_source_review_batch_summary_v1/);
assert.match(cw, /source_batch_key/);
assert.match(cw, /evidenceSourceBatches/);
assert.match(cw, /autoVerifyEvidenceAllowed',false/);
assert.match(cw, /false::boolean as auto_verify_allowed/);
assert.doesNotMatch(cw, /update\s+drx_dose\.source_regimen_supporting_evidence_v1/i);

assert.match(cx, /sourceSnapshotId/);
assert.match(cx, /sourceSectionSha256/);
assert.match(cx, /evidenceSourceBatches/);
assert.match(cx, /autoVerifyEvidenceAllowed',false/);
assert.doesNotMatch(cx, /update\s+drx_dose\.source_regimen_supporting_evidence_v1/i);

assert.match(cy, /phase11_safety_source_review_batches_v1/);
assert.match(cy, /phase11_safety_source_review_batch_summary_v1/);
assert.match(cy, /safetyBatchSummary/);
assert.match(cy, /safetySourceBatches/);
assert.match(cy, /autoApproveSafetyAllowed',false/);
assert.match(cy, /autoApplySafetyAllowed',false/);
assert.match(cy, /false::boolean as auto_approve_allowed/);
assert.match(cy, /false::boolean as auto_apply_allowed/);
assert.doesNotMatch(cy, /update\s+drx_dose\.source_(?:adjustment|restriction)_candidates_v1/i);

for (const sql of [ck,cn,co,cp,cq,cr,cs,ct,cu,cv,cw,cx,cy]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_cutover_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_strict_activation_allowed(?:_v2)?\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_materialize_allowed\s*=\s*true/i);
}

assert.match(backend, /shadow-diff-review/);
assert.match(backend, /PHASE11_SHADOW_DIFF_REVIEW_ATTESTED/);
assert.match(backend, /legacy-comparison-review/);
assert.match(backend, /LEGACY_COMPARISON_REVIEW_ATTESTED/);
assert.match(backend, /publish-rule-release/);
assert.match(backend, /PHASE11_RULE_RELEASE_ATTESTED/);
assert.match(backend, /publication === '1'/);
assert.match(backend, /shadow === '1'/);
assert.match(backend, /preflight === '1'/);
assert.match(backend, /drx_phase11_clinical_preflight_workbench_v1/);

assert.match(html, /id="p11LoadPublication"/);
assert.match(html, /id="p11LoadShadow"/);
assert.match(html, /id="p11LoadPreflight"/);
assert.match(ui, /publication=1/);
assert.match(ui, /shadow=1/);
assert.match(ui, /preflight=1/);
assert.match(ui, /evidenceSourceBatches/);
assert.match(ui, /Exact source batches/);
assert.match(ui, /data-p11-evidence-batch/);
assert.match(ui, /data-p11-preflight-batch/);
assert.match(ui, /function openEvidenceBatch/);
assert.match(ui, /function openSafetyBatch/);
assert.match(ui, /data-p11-safety-batch/);
assert.match(ui, /safetySourceBatches/);
assert.match(ui, /data-p11-legacy-review/);
assert.match(ui, /data-p11-rule-release/);
assert.match(ui, /data-p11-shadow-review/);
assert.match(ui, /LEGACY_COMPARISON_REVIEW_ATTESTED/);
assert.match(ui, /PHASE11_RULE_RELEASE_ATTESTED/);
assert.match(ui, /PHASE11_SHADOW_DIFF_REVIEW_ATTESTED/);

const migrations = Array.isArray(history.migrations) ? history.migrations : [];
for (const expected of [
  ['20260831180622','drx_phase11ck_adjustment_projection_and_publication_guard'],
  ['20260831184114','drx_phase11cn_legacy_parity_and_release_gate'],
  ['20260831184612','drx_phase11co_shadow_evidence_and_cutover_guard'],
  ['20260831190001','drx_phase11cp_controlled_percent_bypass_guard'],
  ['20260831191319','drx_phase11cq_evidence_integrity_precheck'],
  ['20260831191800','drx_phase11cr_safety_integrity_precheck'],
  ['20260831193039','drx_phase11cs_indication_icd_integrity_and_publication_guard'],
  ['20260831194123','drx_phase11ct_step_requirement_integrity_prechecks'],
  ['20260831194503','drx_phase11cu_clinical_review_preflight'],
  ['20260831194750','drx_phase11cv_clinical_preflight_workbench'],
  ['20260831195207','drx_phase11cw_evidence_source_review_batches'],
  ['20260831195625','drx_phase11cx_evidence_batch_drilldown'],
  ['20260831201723','drx_phase11cy_safety_source_review_batches'],
]) {
  assert.ok(
    migrations.some(row => String(row.version) === expected[0] && row.name === expected[1]),
    `migration history missing ${expected[0]} ${expected[1]}`
  );
}

console.log('DRx Phase 11 release + shadow contract passed.');
