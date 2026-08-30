'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const a = fs.readFileSync(
  'supabase/migrations/20260830161215_drx_phase6a_regulatory_provenance_core.sql','utf8'
);
const b = fs.readFileSync(
  'supabase/migrations/20260830161241_drx_phase6b_atc_variant_classification.sql','utf8'
);
const c = fs.readFileSync(
  'supabase/migrations/20260830161329_drx_phase6c_indication_safety_gate.sql','utf8'
);
const workflow = fs.readFileSync(
  '.github/workflows/drx-phase6-clinical-gate.yml','utf8'
);
const rollback = fs.readFileSync(
  'docs/DRX-PHASE6-ROLLBACK.md','utf8'
);

assert.match(a,/create schema if not exists drx_clinical/i);
assert.match(a,/source_authority_policy_v1/);
assert.match(a,/source_documents_v1/);
assert.match(a,/source_section_evidence_v1/);
assert.match(a,/source_identity_candidates_v1/);
assert.match(a,/EMA/);
assert.match(a,/EMC/);
assert.match(a,/AEMPS_CIMA/);
assert.match(a,/variant_binding_allowed boolean not null default false/);

assert.match(b,/market_product_classification_v1/);
assert.match(b,/variant_classification_v1/);
assert.match(b,/atc_status in \('EXACT','CONFLICT','MISSING'\)/);
assert.match(b,/source_class_values/);
assert.match(b,/publication_eligible=false/);

assert.match(c,/indication_source_claims_v1/);
assert.match(c,/safety_source_claims_v1/);
assert.match(c,/canonical_name_sq is null/);
assert.match(c,/cardinality\(icd10_codes\)=0/);
assert.match(c,/structured_payload is null/);
assert.match(c,/clinical_review_queue_v1/);
assert.match(c,/source_evidence_integrity_v1/);
assert.match(c,/drx_phase6_status_v1/);
assert.match(c,/variant_source_binding_inferred',false/);
assert.match(c,/icd10_inferred_from_free_text',false/);
assert.match(c,/safety_semantics_inferred_from_free_text',false/);
assert.match(c,/publication_allowed',false/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase6-status-evidence/);
assert.match(workflow,/drx-phase6-clinical-provenance-test\.js/);

assert.match(rollback,/Phase 5/i);
assert.match(rollback,/do not drop/i);
assert.match(rollback,/publication_allowed=false/i);

console.log('DRx Phase 6 clinical provenance contract: PASS');
