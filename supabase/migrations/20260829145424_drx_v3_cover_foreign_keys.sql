-- Cover V3 foreign keys used by provenance, review and audit lookups.
-- Additive only: no table, policy, trigger or data mutation.

create index if not exists dose_hepatic_adjustments_v3_source_snapshot_idx
  on public.dose_hepatic_adjustments_v3 (source_snapshot_id);

create index if not exists dose_legacy_comparisons_v3_product_idx
  on public.dose_legacy_comparisons_v3 (product_id);

create index if not exists dose_products_v3_source_snapshot_idx
  on public.dose_products_v3 (source_snapshot_id);

create index if not exists dose_publication_events_v3_product_idx
  on public.dose_publication_events_v3 (product_id);

create index if not exists dose_renal_adjustments_v3_source_snapshot_idx
  on public.dose_renal_adjustments_v3 (source_snapshot_id);

create index if not exists dose_review_queue_v3_product_idx
  on public.dose_review_queue_v3 (product_id);

create index if not exists dose_rules_v3_basis_component_idx
  on public.dose_rules_v3 (dose_basis_component_concept_id);
