'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const scaffold=fs.readFileSync('supabase/migrations/20260830213146_drx_phase8z_pilot_publication_scaffolding.sql','utf8');
const material=fs.readFileSync('supabase/migrations/20260830213349_drx_phase8za_reviewed_v3_pilot_materialization.sql','utf8');
const shadow=fs.readFileSync('supabase/migrations/20260830213550_drx_phase8zb_reviewed_shadow_exit_gate.sql','utf8');
const fk=fs.readFileSync('supabase/migrations/20260830213647_drx_phase8zc_cover_pilot_foreign_keys.sql','utf8');
const releaseFk=fs.readFileSync('supabase/migrations/20260830213708_drx_phase8zd_cover_pilot_release_fk.sql','utf8');
const history=JSON.parse(fs.readFileSync('supabase/migration-history.json','utf8'));

assert.match(scaffold,/min_weight_inclusive boolean not null default true/i);
assert.match(scaffold,/max_weight_inclusive boolean not null default true/i);
assert.match(scaffold,/NON_EU_REGULATOR[\s\S]*exact_market_product_source_bindings_v1/i);
assert.match(scaffold,/expected_anomaly_codes/i);
assert.match(scaffold,/automatic_global_promotion_allowed boolean not null default false/i);
assert.match(scaffold,/automatic_global_acceptance_allowed boolean not null default false/i);
assert.match(scaffold,/drx_phase8_classify_shadow_diff_v1/);
assert.match(scaffold,/grant execute[\s\S]*to service_role/i);

for(const id of [
 'PROD-COALMACIN-400-57-5ML-PDID149',
 'PROD-PARACETAMOL-ALKALOID-500-PDID1457',
 'RULE-COALMACIN-PED-MILD-25MGKGDAY-BID',
 'RULE-COALMACIN-PED-SEVERE-45MGKGDAY-BID',
 'RULE-PARACETAMOL-ALKALOID-500-13PLUS',
 'RULE-PARACETAMOL-ALKALOID-500-AGE6TO12'
]) assert.ok(material.includes(id),id+' missing');

assert.match(material,/date '2013-09-12'/i);
assert.match(material,/date '2013-04-03'/i);
assert.match(material,/date '2026-01-14'/i);
assert.match(material,/date '2025-09-02'/i);
assert.match(material,/review_status='RESOLVED'/i);
assert.match(material,/V2 unchanged/i);
assert.match(material,/comparison_status='compatible'/i);
assert.match(material,/tablet_split_allowed=false/i);
assert.doesNotMatch(material,/automatic_rule_publication_allowed\s*=\s*true/i);

assert.match(shadow,/classification_audit jsonb/i);
assert.match(shadow,/UNJUSTIFIED/i);
assert.match(shadow,/latest_shadow/i);
assert.match(shadow,/APPROVED_CLINICAL_CORRECTION/i);
assert.match(shadow,/automatic_global_acceptance_allowed/i);
assert.match(shadow,/RESOLVED_CLINICAL_FINDING/i);
assert.match(shadow,/VERIFIED_INDICATION_PROVENANCE/i);
assert.match(shadow,/VERIFIED_CLINICAL_REFERENCE_NORMALIZATION/i);
assert.match(shadow,/drx_phase8_record_pilot_shadow_v1/i);
assert.match(shadow,/grant execute[\s\S]*service_role/i);

for(const token of [
 'drx_phase8_variant_override_exact_binding_idx',
 'drx_phase8_variant_override_clinical_reference_idx',
 'drx_phase8_variant_override_basis_component_idx',
 'drx_phase8_indication_provenance_clinical_ref_idx',
 'drx_phase8_shadow_classification_drug_idx'
]) assert.ok(fk.includes(token),token+' missing');
assert.match(releaseFk,/drx_phase8_variant_override_release_idx/);

for(const [version,name] of [
 ['20260830213146','drx_phase8z_pilot_publication_scaffolding'],
 ['20260830213349','drx_phase8za_reviewed_v3_pilot_materialization'],
 ['20260830213550','drx_phase8zb_reviewed_shadow_exit_gate'],
 ['20260830213647','drx_phase8zc_cover_pilot_foreign_keys'],
 ['20260830213708','drx_phase8zd_cover_pilot_release_fk']
]){
  assert.ok(history.migrations.some(m=>m.version===version && m.name===name),version+' missing');
}

for(const file of [
 'supabase/drx-phase8z-pilot-publication-scaffolding-rollback.sql',
 'supabase/drx-phase8za-reviewed-v3-pilot-materialization-rollback.sql',
 'supabase/drx-phase8zb-reviewed-shadow-exit-gate-rollback.sql',
 'supabase/drx-phase8zc-cover-pilot-foreign-keys-rollback.sql',
 'supabase/drx-phase8zd-cover-pilot-release-fk-rollback.sql'
]){
  const sql=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(sql,/\bcascade\b/i);
}
for(const file of [
 'supabase/drx-phase8z-pilot-publication-scaffolding-rollback.sql',
 'supabase/drx-phase8za-reviewed-v3-pilot-materialization-rollback.sql',
 'supabase/drx-phase8zb-reviewed-shadow-exit-gate-rollback.sql'
]) assert.match(fs.readFileSync(file,'utf8'),/rollback blocked/i);

console.log('DRx Phase 8 reviewed pilot exit contract: PASS');
