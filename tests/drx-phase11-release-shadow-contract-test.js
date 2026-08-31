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

for (const sql of [ck,cn,co,cp,cq]) {
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

assert.match(html, /id="p11LoadPublication"/);
assert.match(html, /id="p11LoadShadow"/);
assert.match(ui, /publication=1/);
assert.match(ui, /shadow=1/);
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
]) {
  assert.ok(
    migrations.some(row => String(row.version) === expected[0] && row.name === expected[1]),
    `migration history missing ${expected[0]} ${expected[1]}`
  );
}

console.log('DRx Phase 11 release + shadow contract passed.');
