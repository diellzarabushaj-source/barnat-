'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Shadow = require('../lib/dose-v3-shadow.js');

assert.equal(Shadow.shadowEnabled({ DRX_DOSE_V3_SHADOW:'1' }),true);
assert.equal(Shadow.shadowEnabled({ DRX_DOSE_V3_SHADOW:'false' }),false);
assert.match(Shadow.selectorHash({ column:'drug_id',value:'abc' }),/^[0-9a-f]{64}$/);

const baseRule = {
  ruleKey:'r1',indicationKey:'i1',patientGroup:'adult_only',
  calculationMethod:'fixed_dose',doseMinValue:5,doseMaxValue:5,doseUnit:'mg',
  frequencyMode:'times_per_day',timesPerDay:2,route:'PO',prn:false,
  specialistOnly:false,outOfRangeAction:'block'
};
const v2 = {
  schemaVersion:'dose-product-fast-path-v1',
  product:{
    productKey:'p1',drugId:'00000000-0000-0000-0000-000000000001',
    registryNumber:123,pdid:'PD1',patientGroup:'adult_only',
    pharmaceuticalForm:'tablet',route:'PO',numeratorValue:5,numeratorUnit:'mg',
    denominatorValue:1,denominatorUnit:'tablet',rules:[baseRule]
  }
};
const v3Equivalent = {
  schemaVersion:'dose-product-fast-path-v3',
  product:{
    ...v2.product,
    registryNumber:'123',
    rules:[{ ...baseRule,doseMinValue:'5',doseMaxValue:'5',timesPerDay:'2' }]
  }
};

const match = Shadow.comparePayloads(v2,v3Equivalent);
assert.equal(match.status,'MATCH');
assert.deepEqual(match.diffCodes,[]);
assert.equal(match.v2Hash,match.v3Hash);

const changed = JSON.parse(JSON.stringify(v3Equivalent));
changed.product.rules[0].doseMaxValue=10;
const diff = Shadow.comparePayloads(v2,changed);
assert.equal(diff.status,'DIFF');
assert.ok(diff.diffCodes.includes('RULE_SEMANTICS'));

assert.equal(Shadow.comparePayloads(v2,null).status,'V2_ONLY');

assert.deepEqual(
  Shadow.v3Selector({ column:'registry_number',value:'123' },v2),
  { column:'drug_id',value:'00000000-0000-0000-0000-000000000001',publicKey:'00000000-0000-0000-0000-000000000001' }
);

const migration = fs.readFileSync(
  'supabase/migrations/20260830163000_drx_phase8_shadow_read_model_parity_core.sql','utf8'
);
const hardening = fs.readFileSync(
  'supabase/migrations/20260830163913_drx_phase8b_review_candidates_exit_gate_hardening.sql','utf8'
);
const reviewEvidence = fs.readFileSync(
  'supabase/migrations/20260830165007_drx_phase8c_product_source_review_evidence.sql','utf8'
);
const statusHardening = fs.readFileSync(
  'supabase/migrations/20260830165050_drx_phase8d_review_evidence_status_hardening.sql','utf8'
);
const fkIndexes = fs.readFileSync(
  'supabase/migrations/20260830165536_drx_phase8e_cover_drx_foreign_keys.sql','utf8'
);
const exactProductGate = fs.readFileSync(
  'supabase/migrations/20260830170022_drx_phase8f_exact_market_product_review_gate.sql','utf8'
);
const exactProductStatus = fs.readFileSync(
  'supabase/migrations/20260830170127_drx_phase8g_exact_product_status_contract.sql','utf8'
);
const pilotDiscovery = fs.readFileSync(
  'supabase/migrations/20260830171643_drx_phase8h_published_v2_exact_source_discovery.sql','utf8'
);
const pilotStatus = fs.readFileSync(
  'supabase/migrations/20260830171727_drx_phase8i_pilot_comparator_status_contract.sql','utf8'
);
const exactCapture = fs.readFileSync(
  'supabase/migrations/20260830174925_drx_phase8j_exact_source_capture_pipeline.sql','utf8'
);
const captureWorkflow = fs.readFileSync(
  '.github/workflows/drx-phase8-exact-source-capture.yml','utf8'
);
const captureStatusGate = fs.readFileSync(
  'supabase/migrations/20260830175458_drx_phase8k_exact_source_capture_status_gate.sql','utf8'
);
const clinicalReference = fs.readFileSync(
  'supabase/migrations/20260830192720_drx_phase8m_clinical_reference_pipeline.sql','utf8'
);
const exactIdentityReview = fs.readFileSync(
  'supabase/migrations/20260830192855_drx_phase8n_exact_product_identity_review.sql','utf8'
);
const clinicalReferenceWorkflow = fs.readFileSync(
  '.github/workflows/drx-phase8-pilot-clinical-reference.yml','utf8'
);
const searchHardening = fs.readFileSync(
  'supabase/migrations/20260830201638_drx_phase8q_search_index_hardening.sql','utf8'
);
const handler = fs.readFileSync('lib/dose-product-fast-path-handler.js','utf8');
const workflow = fs.readFileSync('.github/workflows/drx-phase8-shadow-gate.yml','utf8');
const rollback = fs.readFileSync('docs/DRX-PHASE8-ROLLBACK.md','utf8');

assert.match(migration,/published_product_read_model_v1/);
assert.match(migration,/drx_dose_search_v3_shadow_v1/);
assert.match(migration,/shadow_comparisons_v1/);
assert.match(migration,/drx_record_dose_shadow_comparison_v1/);
assert.match(migration,/clinical payload content is not persisted/i);
assert.match(migration,/v3_cutover_enabled',false/);
assert.match(migration,/publication_allowed',false/);
assert.match(hardening,/AUTO_CANDIDATE_EXACT_SOURCE_IDENTITY; NOT_VERIFIED/);
assert.match(hardening,/legacy_evidence_alignment_v1/);
assert.match(hardening,/automatic_verification_allowed/);
assert.match(hardening,/implementation_gate_pass/);
assert.match(hardening,/exit_gate_pass/);
assert.match(hardening,/gate_pass',g\.exit_gate_pass/);
assert.doesNotMatch(migration,/grant execute on function public\.drx_phase8_status_v1\(\) to authenticated/i);

assert.match(reviewEvidence,/product_source_review_evidence_v1/);
assert.match(reviewEvidence,/v3_product_candidates_v1/);
assert.match(reviewEvidence,/automatic_verification_allowed/);
assert.match(reviewEvidence,/automatic_insert_allowed/);
assert.match(reviewEvidence,/SUBSTANCE_STRENGTH_ROUTE_FORM/);

assert.match(statusHardening,/unique_source_identities/);
assert.match(statusHardening,/unresolved_source_identities/);
assert.match(statusHardening,/strongest_review_candidates/);
assert.match(statusHardening,/automatic_candidate_insert_enabled',false/);
assert.match(statusHardening,/gate_pass',g\.exit_gate_pass/);

assert.match(fkIndexes,/drx_clinical_indication_claim_source_doc_idx/);
assert.match(fkIndexes,/drx_dose_product_source_binding_variant_idx/);
assert.match(fkIndexes,/drx_identity_canonical_terms_concept_idx/);
assert.match(fkIndexes,/drx_variant_clinical_route_idx/);

assert.match(exactProductGate,/binding_scope/);
assert.match(exactProductGate,/EXACT_MARKET_PRODUCT/);
assert.match(exactProductGate,/product_source_exact_evidence_v1/);
assert.match(exactProductGate,/drx_product_source_binding_verification_guard/);
assert.match(exactProductGate,/no exact-market-product verified source binding/i);
assert.match(exactProductGate,/product_source_review_packet_v1/);
assert.match(exactProductGate,/automatic_verification_allowed/);

assert.match(exactProductStatus,/reference_label_can_verify_market_product',false/);
assert.match(exactProductStatus,/exact_product_guard_triggers/);
assert.match(exactProductStatus,/invalid_verified_product_source_bindings/);
assert.match(exactProductStatus,/exact_market_product_evidence_rows/);
assert.match(exactProductStatus,/gate_pass',g\.exit_gate_pass/);

assert.match(pilotDiscovery,/phase8_exact_source_discovery_v1/);
assert.match(pilotDiscovery,/phase8_published_v2_comparator_v1/);
assert.match(pilotDiscovery,/phase8_pilot_readiness_v1/);
assert.match(pilotDiscovery,/SOURCE_SNAPSHOT_MISSING/);
assert.match(pilotDiscovery,/automatic_publication_allowed/);

assert.match(pilotStatus,/published_v2_comparator_products/);
assert.match(pilotStatus,/exact_source_discovery_candidates/);
assert.match(pilotStatus,/pilot_source_snapshot_missing/);
assert.match(pilotStatus,/pilot_ready_for_v3_build/);
assert.match(pilotStatus,/automatic_exact_source_promotion_enabled',false/);

assert.match(exactCapture,/exact_market_product_source_captures_v1/);
assert.match(exactCapture,/exact_market_product_source_bindings_v1/);
assert.match(exactCapture,/drx_phase8_ingest_exact_source_v1/);
assert.match(exactCapture,/NON_EU_REGULATOR/);
assert.match(exactCapture,/automatic_verification_allowed=false/);
assert.match(captureWorkflow,/SUPABASE_SECRET_KEY/);
assert.doesNotMatch(captureWorkflow,/SUPABASE_DB_URL/);

assert.match(captureStatusGate,/drx_phase8_capture_status_v1/);
assert.match(captureStatusGate,/source_capture_gate_pass/);
assert.match(captureStatusGate,/human_review_required',true/);
assert.match(captureStatusGate,/automatic_verification_enabled',false/);
assert.match(captureStatusGate,/publication_allowed',false/);

assert.match(clinicalReference,/phase8_pilot_clinical_references_v1/);
assert.match(clinicalReference,/CLINICAL_REFERENCE_ONLY/);
assert.match(clinicalReference,/CLINICAL_REFERENCE_SNAPSHOT_MISSING/);
assert.match(clinicalReference,/drx_phase8_register_clinical_reference_v1/);
assert.match(clinicalReference,/automatic_rule_publication_allowed boolean not null default false/);
assert.match(exactIdentityReview,/phase8-explicit-evidence-review/);
assert.match(exactIdentityReview,/does not verify or publish dosing rules/);
assert.match(clinicalReferenceWorkflow,/needs: archive/);

assert.match(searchHardening,/dose_products_v3_published_trade_trgm_idx/);
assert.match(searchHardening,/dose_products_v3_published_substance_trgm_idx/);
assert.match(searchHardening,/least\(coalesce\(p_limit,20\),50\)/);
assert.match(searchHardening,/revoke all on function public\.drx_dose_search_v3_shadow_v1\(text,integer\)/i);
assert.match(searchHardening,/grant execute on function public\.drx_dose_search_v3_shadow_v1\(text,integer\)\s+to service_role/i);

assert.match(handler,/runtime:'v2-shadow'/);
assert.match(handler,/X-DRx-Dose-Shadow/);
assert.match(handler,/Shadow\.comparePayloads/);
assert.match(handler,/Shadow\.record/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase8-status-evidence/);
assert.match(rollback,/V2/i);
assert.match(rollback,/do not drop/i);

console.log('DRx Phase 8 shadow runtime contract: PASS');
