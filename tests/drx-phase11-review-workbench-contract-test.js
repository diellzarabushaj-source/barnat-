'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

const bp = read('supabase/migrations/20260831162108_drx_phase11bp_admin_review_read_model.sql');
const bq = read('supabase/migrations/20260831162250_drx_phase11bq_detailed_review_packets.sql');
const br = read('supabase/migrations/20260831162751_drx_phase11br_identity_candidate_suggestions.sql');
const bs = read('supabase/migrations/20260831162947_drx_phase11bs_icd_quality_gate_and_workbench_v2.sql');
const bt = read('supabase/migrations/20260831164041_drx_phase11bt_review_provenance_and_item_actions.sql');
const bu = read('supabase/migrations/20260831164124_drx_phase11bu_indication_and_regimen_review_gates.sql');
const backend = read('lib/phase11-review.js');
const api = read('api/phase11-review.js');
const html = read('admin.html');
const ui = read('admin-phase11-review.js');
const dashboard = read('admin-dashboard.js');

assert.match(bp, /drx_phase11_review_workbench_v1/);
assert.match(bp, /drx_phase11_regimen_review_packet_v1/);
assert.match(bp, /drx_phase11_identity_batch_packet_v1/);
assert.match(bp, /security definer/i);
assert.match(bp, /grant execute .* to service_role/is);

assert.match(bq, /drx_phase11_clinical_batch_packet_v1/);
assert.match(bq, /drx_phase11_indication_review_packet_v1/);
assert.match(bq, /grant execute .* to service_role/is);

assert.match(br, /ingredient_identity_term_candidates_v1/);
assert.match(br, /ingredient_identity_review_queue_v2/);
assert.match(br, /EXACT_PHRASE_IN_COMPOSITION/);
assert.match(br, /auto_resolve_allowed/);
assert.match(br, /false::boolean as auto_resolve_allowed/);
assert.doesNotMatch(br, /auto_resolve_allowed\s*=\s*true/i);

assert.match(bs, /indication_icd_review_queue_v2/);
assert.match(bs, /manual_search_required/);
assert.match(bs, /best_match_score >= 0\.65/);
assert.match(bs, /best_match_score >= 0\.45/);
assert.match(bs, /false::boolean as auto_apply_allowed/);

assert.match(bt, /phase11_review_events_v1/);
assert.match(bt, /drx_phase11_review_regimen_evidence_v1/);
assert.match(bt, /drx_phase11_review_regimen_presentation_v1/);
assert.match(bt, /drx_phase11_review_regimen_administration_v1/);
assert.match(bt, /drx_phase11_review_safety_candidate_v1/);
assert.match(bt, /drx_phase11_review_indication_link_v1/);
assert.match(bt, /reviewed_by/);
assert.match(bt, /reviewed_at/);

assert.match(bu, /drx_phase11_publish_indication_v1/);
assert.match(bu, /ICD_AND_INDICATION_REVIEW_ATTESTED/);
assert.match(bu, /drx_phase11_review_regimen_v1/);
assert.match(bu, /CLINICAL_REGIMEN_REVIEW_ATTESTED/);
assert.match(bu, /PRIMARY_EVIDENCE_NOT_VERIFIED/);
assert.match(bu, /SAFETY_REVIEW_INCOMPLETE/);
assert.match(bu, /PRIMARY_INDICATION_NOT_PUBLISHED_ICD_VERIFIED/);

assert.match(backend, /AdminAccess\.requireAdminSession/);
assert.match(backend, /\['GET','POST'\]\.includes\(req\.method\)/);
assert.match(backend, /reviewer = clean\(admin\?\.email\)/);
assert.match(backend, /IDENTITY_REVIEW_ATTESTED/);
assert.match(backend, /SOURCE_REVIEW_ATTESTED/);
assert.match(backend, /SAFETY_REVIEW_ATTESTED/);
assert.match(backend, /ICD_AND_INDICATION_REVIEW_ATTESTED/);
assert.match(backend, /CLINICAL_REGIMEN_REVIEW_ATTESTED/);
assert.match(backend, /drx_phase11_identity_batch_packet_v2/);
assert.match(api, /Phase11Review\.handle/);

assert.match(html, /data-view="phase11"/);
assert.match(html, /data-panel="phase11"/);
assert.match(html, /id="phase11DetailDialog"/);
assert.match(html, /admin-phase11-review\.js/);
assert.match(dashboard, /phase11:\['Dose V3 Review','Phase 11 · review & cutover'\]/);

assert.match(ui, /\/api\/phase11-review/);
assert.match(ui, /identitySignature=/);
assert.match(ui, /clinicalBatchKey=/);
assert.match(ui, /indications=1/);
assert.match(ui, /Canonical suggestions/);
assert.doesNotMatch(ui, /method\s*:\s*['"]POST['"]/i);
assert.doesNotMatch(ui, /method\s*:\s*['"]PUT['"]/i);
assert.doesNotMatch(ui, /method\s*:\s*['"]PATCH['"]/i);

for (const sql of [bp,bq,br,bs,bt,bu]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_resolve_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 admin review workbench contract passed.');
