create index if not exists drx_phase8_variant_override_exact_binding_idx
  on drx_dose.phase8_pilot_variant_overrides_v1(exact_binding_id);

create index if not exists drx_phase8_variant_override_clinical_reference_idx
  on drx_dose.phase8_pilot_variant_overrides_v1(clinical_reference_id);

create index if not exists drx_phase8_variant_override_basis_component_idx
  on drx_dose.phase8_pilot_variant_overrides_v1(dose_basis_component_concept_id)
  where dose_basis_component_concept_id is not null;

create index if not exists drx_phase8_indication_provenance_clinical_ref_idx
  on drx_dose.phase8_pilot_indication_provenance_v1(clinical_reference_id);

create index if not exists drx_phase8_shadow_classification_drug_idx
  on drx_runtime.shadow_diff_classifications_v1(drug_id);
