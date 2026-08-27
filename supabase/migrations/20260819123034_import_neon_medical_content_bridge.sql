-- Synced from Supabase production migration history.
-- version: 20260819123034
-- name: import_neon_medical_content_bridge

drop schema if exists _migration_neon cascade;
create schema _migration_neon;
import foreign schema public limit to (
  clinical_sources,
  content_versions,
  dosage_regimens,
  dose_indications_v2,
  dose_products_v2,
  dose_rule_products_v2,
  dose_rules_v2,
  dose_safety_v2,
  dose_sources_v2,
  drug_clinical_profiles,
  drug_indications,
  drugs,
  icd_codes,
  icd_hierarchy_nodes,
  icd_hierarchy_revisions,
  lab_categories,
  lab_tests,
  medindex_drug_core_map_v1,
  medindex_product_metadata_verifications_v1,
  medindex_product_overrides_v1,
  medindex_registry_audit_v2,
  medindex_source_gap_resolutions_v1,
  medindex_value_map_v1
) from server medindex_neon_test into _migration_neon options (import_default 'true', import_not_null 'true');
