-- Synced from Supabase production migration history.
-- version: 20260819123129
-- name: create_medical_content_tables_from_neon

drop table if exists public._migration_drugs_shape_test;

do $$
declare
  t text;
  tables text[] := array[
    'clinical_sources','content_versions','dosage_regimens','dose_indications_v2','dose_products_v2',
    'dose_rule_products_v2','dose_rules_v2','dose_safety_v2','dose_sources_v2','drug_clinical_profiles',
    'drug_indications','drugs','icd_codes','icd_hierarchy_nodes','icd_hierarchy_revisions','lab_categories',
    'lab_tests','medindex_drug_core_map_v1','medindex_product_metadata_verifications_v1','medindex_product_overrides_v1',
    'medindex_registry_audit_v2','medindex_source_gap_resolutions_v1','medindex_value_map_v1'
  ];
begin
  foreach t in array tables loop
    execute format('drop table if exists public.%I cascade', t);
    execute format('create table public.%I (like _migration_neon.%I including all)', t, t);
  end loop;
end $$;
