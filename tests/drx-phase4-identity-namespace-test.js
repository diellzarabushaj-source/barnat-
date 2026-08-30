'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const core = fs.readFileSync(
  'supabase/migrations/20260830154341_drx_phase4_identity_namespace_core.sql','utf8'
);
const preferred = fs.readFileSync(
  'supabase/migrations/20260830154611_drx_phase4_preferred_identity_term_hardening.sql','utf8'
);
const closure = fs.readFileSync(
  'supabase/migrations/20260830155021_drx_phase4_component_identity_closure.sql','utf8'
);
const provenance = fs.readFileSync(
  'supabase/migrations/20260830155203_drx_phase4_component_provenance_hardening.sql','utf8'
);
const workflow = fs.readFileSync(
  '.github/workflows/drx-phase4-identity-gate.yml','utf8'
);
const rollback = fs.readFileSync(
  'docs/DRX-PHASE4-ROLLBACK.md','utf8'
);

assert.match(core,/create schema if not exists drx_identity/i);
assert.match(core,/canonical_concepts_v1/);
assert.match(core,/source_concept_map_v1/);
assert.match(core,/canonical_terms_v1/);
assert.match(core,/relationships_v1/);
assert.match(core,/combination_components_v1/);
assert.match(core,/product_component_strength_v1/);
assert.match(core,/BASE_SALT_EQUIVALENCE/);
assert.match(core,/publication_allowed',false/);

assert.match(preferred,/public_identity_term_resolver_v1/);
assert.match(preferred,/term_type='CANONICAL'/);
assert.match(preferred,/is_preferred=true/);
assert.match(preferred,/search_alias_merges_identity',false/);
assert.match(preferred,/base_equals_salt_auto_merge_enabled',false/);
assert.match(preferred,/similarity_merge_enabled',false/);
assert.match(preferred,/unresolved_combination_components=0/);

assert.match(closure,/component_alias_evidence_v1/);
assert.match(closure,/confidence >= 0\.999/);
assert.match(closure,/cardinality\(evidence_urls\)>0/);
assert.match(closure,/uuid_generate_v5/);
assert.match(closure,/SOURCE_LITERAL_IDENTITY/);
assert.match(closure,/source_literal_identity_claims_equivalence',false/);

assert.match(provenance,/identity_status<>'REVIEW'/);
assert.match(provenance,/SOURCE_LITERAL_IDENTITY/);
assert.match(provenance,/unresolved_combination_components=0/);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase4-status-evidence/);
assert.match(workflow,/drx-phase4-identity-namespace-test\.js/);

assert.match(rollback,/Phase 3/i);
assert.match(rollback,/do not drop/i);
assert.match(rollback,/publication_allowed=false/i);

console.log('DRx Phase 4 identity namespace contract: PASS');
