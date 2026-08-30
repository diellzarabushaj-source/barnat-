-- DRx Phase 8E: cover all DRx foreign keys reported as unindexed.
-- Additive indexes only; no data or access-control changes.

create index if not exists drx_clinical_indication_claim_source_doc_idx
  on drx_clinical.indication_source_claims_v1(source_document_id);

create index if not exists drx_clinical_source_documents_authority_idx
  on drx_clinical.source_documents_v1(authority_key);

create index if not exists drx_clinical_source_identity_resolution_concept_idx
  on drx_clinical.source_identity_resolution_evidence_v1(resolved_concept_id);

create index if not exists drx_dose_product_source_binding_variant_idx
  on drx_dose.product_source_bindings_v1(clinical_variant_id);

create index if not exists drx_dose_product_source_binding_source_doc_idx
  on drx_dose.product_source_bindings_v1(source_document_id);

create index if not exists drx_identity_canonical_terms_concept_idx
  on drx_identity.canonical_terms_v1(canonical_concept_id);

create index if not exists drx_identity_combination_components_component_idx
  on drx_identity.combination_components_v1(component_concept_id);

create index if not exists drx_identity_component_alias_concept_idx
  on drx_identity.component_alias_evidence_v1(canonical_concept_id);

create index if not exists drx_identity_product_component_strength_concept_idx
  on drx_identity.product_component_strength_v1(canonical_concept_id);

create index if not exists drx_identity_relationships_target_idx
  on drx_identity.relationships_v1(target_concept_id);

create index if not exists drx_identity_source_map_canonical_idx
  on drx_identity.source_concept_map_v1(canonical_concept_id);

create index if not exists drx_norm_form_alias_form_idx
  on drx_norm.form_alias_v1(form_key);

create index if not exists drx_norm_release_alias_release_idx
  on drx_norm.release_alias_v1(release_key);

create index if not exists drx_raw_registry_corrections_source_row_idx
  on drx_raw.registry_corrections_v1(source_row_id);

create index if not exists drx_variant_clinical_composition_idx
  on drx_variant.clinical_variants_v1(composition_concept_id);

create index if not exists drx_variant_clinical_form_idx
  on drx_variant.clinical_variants_v1(form_key);

create index if not exists drx_variant_clinical_release_idx
  on drx_variant.clinical_variants_v1(release_key);

create index if not exists drx_variant_clinical_route_idx
  on drx_variant.clinical_variants_v1(route_key);
