'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const finality=fs.readFileSync('supabase/migrations/20260830210940_drx_phase8x_clinical_reference_finality_guard.sql','utf8');
const refresh=fs.readFileSync('supabase/migrations/20260830211016_drx_phase8y_clinical_provenance_refresh.sql','utf8');
const scope=fs.readFileSync('supabase/migrations/20260830211052_drx_phase8x_provenance_scope_repair.sql','utf8');
const rbFinality=fs.readFileSync('supabase/drx-phase8x-clinical-reference-finality-guard-rollback.sql','utf8');
const rbRefresh=fs.readFileSync('supabase/drx-phase8y-clinical-provenance-refresh-rollback.sql','utf8');
const rbScope=fs.readFileSync('supabase/drx-phase8x-provenance-scope-repair-rollback.sql','utf8');
const status=fs.readFileSync('scripts/drx-phase8-status.js','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(finality,/reviewed evidence is immutable/i);
assert.match(finality,/reviewPreserved/);
assert.match(finality,/revoke all on function public\.drx_phase8_register_clinical_reference_v1\(jsonb\)[\s\S]*from public,anon,authenticated/i);
assert.match(finality,/grant execute[\s\S]*to service_role/i);

assert.match(refresh,/drx_phase8_refresh_pilot_clinical_provenance_v1/);
assert.match(refresh,/reviewed source snapshot is immutable/i);
assert.match(refresh,/prior modeled evidence is referenced or identity-resolved/i);
assert.match(refresh,/publicationAllowed',false/i);
assert.match(refresh,/automaticReviewAllowed',false/i);
assert.match(refresh,/grant execute[\s\S]*to service_role/i);

assert.match(scope,/indication_source_claims_v1/);
assert.match(scope,/safety_source_claims_v1/);
assert.match(scope,/phase8_source_identity_resolution_v1/);
assert.match(scope,/EXACT_PRODUCT_COMBINATION_COMPONENTS/);
assert.match(scope,/exact_product_identity_verified/);
assert.match(scope,/matched_component_count=component_count/);
assert.match(scope,/automatic_publication_allowed/);
assert.match(scope,/m\.phase8_functions=3[\s\S]*m\.v3_published_products>0/);

assert.match(status,/drx_phase6_status_v1/);
assert.match(status,/phase6Status\.gate_pass,true/);
assert.match(status,/status\.unique_source_identities,phase6Status\.clinical_source_keys/);
assert.doesNotMatch(status,/status\.unique_source_identities,25/);

for(const [version,name] of [
  ['20260830210940','drx_phase8x_clinical_reference_finality_guard'],
  ['20260830211016','drx_phase8y_clinical_provenance_refresh'],
  ['20260830211052','drx_phase8x_provenance_scope_repair']
]){
  assert.ok(history.migrations.some(m=>m.version===version && m.name===name),version+' missing from migration history');
}

for(const rollback of [rbFinality,rbRefresh,rbScope]){
  assert.doesNotMatch(rollback,/\bcascade\b/i);
}
assert.match(rbFinality,/rollback blocked/i);
assert.match(rbScope,/rollback blocked/i);

console.log('DRx Phase 8 live migration reconciliation: PASS');
