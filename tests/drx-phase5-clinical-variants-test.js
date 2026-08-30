'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20260830160106_drx_phase5_clinical_variants_market_products.sql',
  'utf8'
);
const workflow = fs.readFileSync(
  '.github/workflows/drx-phase5-clinical-variants-gate.yml',
  'utf8'
);
const rollback = fs.readFileSync(
  'docs/DRX-PHASE5-ROLLBACK.md',
  'utf8'
);

assert.match(migration,/create schema if not exists drx_variant/i);
assert.match(migration,/clinical_variants_v1/);
assert.match(migration,/market_products_v1/);
assert.match(migration,/product_anomaly_queue_v1/);
assert.match(migration,/variant_product_binding_v1/);
assert.match(migration,/binding_mismatches_v1/);
assert.match(migration,/drx_phase5_refresh_v1/);
assert.match(migration,/drx_phase5_status_v1/);

assert.match(migration,/composition_concept_id::text \|\| '\\|' \|\|/);
assert.match(migration,/strength_hash/);
assert.match(migration,/form_key/);
assert.match(migration,/release_key/);
assert.match(migration,/route_key/);

assert.match(migration,/i\.drug_id,/);
assert.match(migration,/invented_market_product_ids/);
assert.match(migration,/duplicate_variant_signatures/);
assert.match(migration,/orphan_product_bindings/);
assert.match(migration,/binding_mismatches/);
assert.match(migration,/publication_allowed',false/);

assert.match(migration,/PDID_INVALID/);
assert.match(migration,/ROUTE_UNRESOLVED/);
assert.match(migration,/RELEASE_UNRESOLVED/);
assert.match(migration,/COMBINATION_STRENGTH_UNALIGNED/);
assert.match(migration,/COMPOSITION_REVIEW_COMPONENT/);

assert.match(migration,/grant execute on function public\.drx_phase5_status_v1\(\) to service_role/i);
assert.doesNotMatch(migration,/grant execute on function public\.drx_phase5_status_v1\(\) to authenticated/i);

assert.match(workflow,/SUPABASE_SECRET_KEY/);
assert.match(workflow,/drx-phase5-status-evidence/);
assert.match(workflow,/drx-phase5-clinical-variants-test\.js/);

assert.match(rollback,/Phase 4/i);
assert.match(rollback,/do not drop/i);
assert.match(rollback,/publication_allowed=false/i);

console.log('DRx Phase 5 clinical variants contract: PASS');
