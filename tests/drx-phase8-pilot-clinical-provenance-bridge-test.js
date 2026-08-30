'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const sql=fs.readFileSync(
  'supabase/migrations/20260830210058_drx_phase8w_pilot_clinical_provenance_bridge.sql','utf8'
);
const rollback=fs.readFileSync(
  'supabase/drx-phase8w-pilot-clinical-provenance-bridge-rollback.sql','utf8'
);

assert.match(sql,/emc-10038-phase8-clinical-ref/);
assert.match(sql,/emc-13494-phase8-clinical-ref/);
assert.match(sql,/drx_clinical\.source_documents_v1/);
assert.match(sql,/drx_clinical\.source_section_evidence_v1/);
assert.match(sql,/drx_clinical\.source_identity_candidates_v1/);
assert.match(sql,/extensions\.uuid_generate_v5/);
assert.match(sql,/publication_eligible=false/);
assert.match(sql,/variant_binding_allowed=false/);
assert.match(sql,/SECTION2_BOUNDARY_AWARE_PREFERRED_CANONICAL_TERM_MATCH/);
assert.doesNotMatch(sql,/evidence_review_status\s*=\s*'VERIFIED'/i);
assert.doesNotMatch(sql,/editorial_status\s*=\s*'published'/i);

assert.match(rollback,/rollback blocked: modeled pilot provenance is already referenced by V3 evidence/i);
assert.doesNotMatch(rollback,/dose_source_snapshots_v3/i);
assert.doesNotMatch(rollback,/dose_source_sections_v3/i);
assert.doesNotMatch(rollback,/\bcascade\b/i);

console.log('DRx Phase 8W pilot clinical provenance bridge: PASS');
