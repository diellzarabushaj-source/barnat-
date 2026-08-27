-- Synced from Supabase production migration history.
-- version: 20260819124037
-- name: harden_functions_and_add_fk_indexes

alter function public.set_updated_at() set search_path = pg_catalog, public;
alter function public.medindex_numeric_or_null(text) set search_path = pg_catalog, public;
alter function public.medindex_timestamp_or_null(text) set search_path = pg_catalog, public;
alter function public.medindex_sync_drug_pediatric_fields() set search_path = pg_catalog, public;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.medindex_numeric_or_null(text) from public, anon, authenticated;
revoke execute on function public.medindex_timestamp_or_null(text) from public, anon, authenticated;
revoke execute on function public.medindex_sync_drug_pediatric_fields() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index dosage_regimens_indication_id_idx on public.dosage_regimens(indication_id);
create index dose_indications_v2_source_key_idx on public.dose_indications_v2(source_key);
create index dose_products_v2_drug_id_idx on public.dose_products_v2(drug_id);
create index dose_products_v2_source_key_idx on public.dose_products_v2(source_key);
create index dose_rule_products_v2_product_key_idx on public.dose_rule_products_v2(product_key);
create index dose_rules_v2_source_key_idx on public.dose_rules_v2(source_key);
create index dose_safety_v2_indication_key_idx on public.dose_safety_v2(indication_key);
create index dose_safety_v2_source_key_idx on public.dose_safety_v2(source_key);
create index drugs_source_version_id_idx on public.drugs(source_version_id);
create index lab_tests_source_version_id_idx on public.lab_tests(source_version_id);
