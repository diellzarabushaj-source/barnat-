-- Synced from Supabase production migration history.
-- version: 20260819123640
-- name: restore_medindex_views_from_neon

do $$
declare
  v text;
  def text;
  ordered_views text[] := array[
    'dose_calculator_catalog_v2',
    'generic_dosage_regimen_templates',
    'icd_hierarchy_active',
    'medindex_drug_products_v1',
    'medindex_registry_audit_dashboard_v2',
    'product_dosage_regimens',
    'medindex_drug_presentations_v1',
    'medindex_registry_dashboard_v1',
    'medindex_source_gap_queue_v1',
    'medindex_substance_concepts_v1',
    'medindex_dose_product_alignment_v1',
    'medindex_drug_presentations_public_v1',
    'medindex_drug_registry_public_v1',
    'medindex_drug_search_v1',
    'medindex_non_atc_products_public_v1',
    'medindex_reference_drugs_public_v2',
    'medindex_source_gap_queue_v2',
    'medindex_all_drugs_public_v2',
    'medindex_dose_calculator_public',
    'medindex_dose_rule_readiness_v1',
    'medindex_source_gap_queue_v3',
    'medindex_all_drug_search_v2',
    'medindex_all_products_public_v3',
    'medindex_dose_health_v1',
    'medindex_dose_review_queue_v1',
    'medindex_source_recovery_dashboard_v1',
    'medindex_source_recovery_health_v1',
    'medindex_all_product_search_v3',
    'medindex_all_products_public_v4',
    'medindex_catalog_stats_v1',
    'medindex_dose_link_candidates_v1',
    'medindex_dose_source_candidates_v1',
    'medindex_product_categories_v1',
    'medindex_all_product_search_v4',
    'medindex_catalog_public',
    'medindex_catalog_stats_v2',
    'medindex_dose_review_dashboard_v1',
    'medindex_non_atc_types_v1',
    'medindex_product_categories_v2',
    'medindex_product_types_v1',
    'medindex_catalog_categories',
    'medindex_catalog_health_v1',
    'medindex_catalog_non_atc_types',
    'medindex_catalog_product_types',
    'medindex_catalog_search',
    'medindex_catalog_stats',
    'medindex_catalog_health'
  ];
begin
  foreach v in array ordered_views loop
    select definition::text into def
    from _migration_neon.pg_views_remote
    where schemaname::text='public' and viewname::text=v;

    if def is null then
      raise exception 'Missing Neon view definition for %', v;
    end if;

    def := regexp_replace(def, ';[[:space:]]*$', '');
    execute format('create or replace view public.%I with (security_invoker=true) as %s', v, def);
  end loop;
end $$;
