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
const bv = read('supabase/migrations/20260831164500_drx_phase11bv_clinical_approval_readiness_gate.sql');
const bw = read('supabase/migrations/20260831165237_drx_phase11bw_review_action_ready_clinical_packet.sql');
const bx = read('supabase/migrations/20260831165355_drx_phase11bx_source_scoped_safety_review_packet.sql');
const by = read('supabase/migrations/20260831170423_drx_phase11by_official_product_source_discovery.sql');
const bz = read('supabase/migrations/20260831170534_drx_phase11bz_source_aware_review_workbench_v3.sql');
const ca = read('supabase/migrations/20260831170726_drx_phase11ca_product_identity_capture_review.sql');
const cb = read('supabase/migrations/20260831171019_drx_phase11cb_product_identity_capture_workbench_v4.sql');
const cc = read('supabase/migrations/20260831171501_drx_phase11cc_gated_draft_product_shell_materializer.sql');
const backend = read('lib/phase11-review.js');
const api = read('api/clinical-editor.js');
const vercel = read('vercel.json');
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

assert.match(bv, /source_regimen_clinical_approval_gate_v1/);
assert.match(bv, /source_regimen_clinical_approval_summary_v1/);
assert.match(bv, /ready_for_clinical_approval/);
assert.match(bv, /EVIDENCE_REVIEW_INCOMPLETE/);
assert.match(bv, /PRESENTATION_REVIEW_INCOMPLETE/);
assert.match(bv, /ADMINISTRATION_REVIEW_INCOMPLETE/);
assert.match(bv, /SAFETY_REVIEW_INCOMPLETE/);
assert.match(bv, /PRIMARY_INDICATION_NOT_PUBLISHED_ICD_VERIFIED/);
assert.match(bv, /auto_approve_allowed/);

assert.match(bw, /drx_phase11_clinical_batch_packet_v2/);
assert.match(bw, /clinicalApprovalGate/);
assert.match(bw, /reviewEvents/);

assert.match(bx, /drx_phase11_clinical_batch_packet_v3/);
assert.match(bx, /source_regimen_applicable_safety_v2/);
assert.match(bx, /applicabilityScope/);
assert.match(bx, /primaryIndication/);

assert.match(by, /product_shell_source_discovery_v2/);
assert.match(by, /EXACT_PRODUCT_CANDIDATE/);
assert.match(by, /PARTIAL_PRODUCT_CANDIDATE/);
assert.match(by, /auto_publish_allowed/);

assert.match(bz, /drx_phase11_review_workbench_v3/);
assert.match(bz, /productSourceDiscovery/);

assert.match(ca, /exact_market_product_identity_captures_v2/);
assert.match(ca, /PRODUCT_IDENTITY_SOURCE_REVIEW_ATTESTED/);
assert.match(ca, /automatic_verification_allowed/);

assert.match(cb, /drx_phase11_review_workbench_v4/);
assert.match(cb, /productIdentityCapture/);

assert.match(cc, /drx_phase11_materialize_verified_product_identity_to_draft_v1/);
assert.match(cc, /capture_status<>'VERIFIED'/);
assert.match(cc, /editorialStatus','draft'/);
assert.match(cc, /clinicalDoseInferred',false/);
assert.match(cc, /conversionEnabled',false/);
assert.match(cc, /ruleBindingsCreated',false/);
assert.match(cc, /autoPublished',false/);

assert.match(backend, /AdminAccess\.requireAdminSession/);
assert.match(backend, /\['GET','POST'\]\.includes\(req\.method\)/);
assert.match(backend, /reviewer = clean\(admin\?\.email\)/);
assert.match(backend, /drx_phase11_clinical_batch_packet_v3/);
assert.match(backend, /identity-batch-apply/);
assert.match(backend, /evidence-review/);
assert.match(backend, /presentation-review/);
assert.match(backend, /administration-review/);
assert.match(backend, /safety-review/);
assert.match(backend, /indication-publish/);
assert.match(backend, /regimen-review/);
assert.match(backend, /IDENTITY_REVIEW_ATTESTED/);
assert.match(backend, /SOURCE_REVIEW_ATTESTED/);
assert.match(backend, /SAFETY_REVIEW_ATTESTED/);
assert.match(backend, /ICD_AND_INDICATION_REVIEW_ATTESTED/);
assert.match(backend, /CLINICAL_REGIMEN_REVIEW_ATTESTED/);
assert.match(backend, /drx_phase11_identity_batch_packet_v2/);
assert.match(api, /Phase11Review\.handle/);
assert.match(api, /queryFlag\(req, 'phase11Review'\)/);
assert.match(api, /queryFlag\(req, 'icdApi'\)/);
assert.match(vercel, /\"source\": \"\/api\/phase11-review\"/);
assert.match(vercel, /\"destination\": \"\/api\/clinical-editor\?phase11Review=1\"/);
assert.match(vercel, /\"source\": \"\/api\/icd\"/);
assert.match(vercel, /\"destination\": \"\/api\/clinical-editor\?icdApi=1\"/);

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
assert.match(ui, /method:'POST'/);
assert.match(ui, /IDENTITY_REVIEW_ATTESTED/);
assert.match(ui, /SOURCE_REVIEW_ATTESTED/);
assert.match(ui, /SAFETY_REVIEW_ATTESTED/);
assert.match(ui, /ICD_AND_INDICATION_REVIEW_ATTESTED/);
assert.match(ui, /CLINICAL_REGIMEN_REVIEW_ATTESTED/);
assert.match(ui, /ready_for_clinical_approval/);
assert.doesNotMatch(ui, /method\s*:\s*['"]PUT['"]/i);
assert.doesNotMatch(ui, /method\s*:\s*['"]PATCH['"]/i);

for (const sql of [bp,bq,br,bs,bt,bu,bv,bw,bx,by,bz,ca,cb,cc]) {
  assert.doesNotMatch(sql, /auto_publish_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_apply_allowed\s*=\s*true/i);
  assert.doesNotMatch(sql, /auto_resolve_allowed\s*=\s*true/i);
}

console.log('DRx Phase 11 admin review workbench contract passed.');
