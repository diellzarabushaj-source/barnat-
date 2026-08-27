-- Synced from Supabase production migration history.
-- version: 20260819123844
-- name: secure_medical_content_rls

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
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all privileges on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('drop policy if exists medical_content_read on public.%I', t);
    execute format('create policy medical_content_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
