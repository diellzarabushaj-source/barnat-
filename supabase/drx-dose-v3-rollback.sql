-- DRx Dosierung V3 shadow rollback
-- STATUS: PREPARED_NOT_EXECUTED
-- Scope: removes only V3 shadow objects created by drx-dose-v3-additive-candidate.sql.
-- Deliberately no CASCADE and no DROP SCHEMA private: unexpected dependencies must fail closed.

begin;

drop function if exists public.medindex_dose_product_fast_path_v3(text, uuid);

drop trigger if exists dose_source_snapshots_v3_provenance_lock
on public.dose_source_snapshots_v3;
drop trigger if exists dose_source_sections_v3_provenance_lock
on public.dose_source_sections_v3;

drop trigger if exists dose_products_v3_publication_guard
on public.dose_products_v3;
drop trigger if exists dose_rules_v3_publication_guard
on public.dose_rules_v3;

drop function if exists private.drx_lock_source_snapshot_v3();
drop function if exists private.drx_lock_source_section_v3();
drop function if exists private.drx_enforce_product_publication_v3();
drop function if exists private.drx_enforce_rule_publication_v3();

drop table if exists public.dose_publication_events_v3;
drop table if exists public.dose_review_queue_v3;
drop table if exists public.dose_legacy_comparisons_v3;
drop table if exists public.dose_rule_products_v3;
drop table if exists public.dose_renal_adjustments_v3;
drop table if exists public.dose_hepatic_adjustments_v3;
drop table if exists public.dose_rules_v3;
drop table if exists public.dose_products_v3;
drop table if exists public.dose_indication_terms_v3;
drop table if exists public.dose_indication_concepts_v3;
drop table if exists public.dose_source_sections_v3;
drop table if exists public.dose_source_snapshots_v3;

commit;
