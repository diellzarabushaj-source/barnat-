-- Phase 8ZC FK index rollback.
drop index if exists drx_dose.drx_phase8_variant_override_exact_binding_idx;
drop index if exists drx_dose.drx_phase8_variant_override_clinical_reference_idx;
drop index if exists drx_dose.drx_phase8_variant_override_basis_component_idx;
drop index if exists drx_dose.drx_phase8_indication_provenance_clinical_ref_idx;
drop index if exists drx_runtime.drx_phase8_shadow_classification_drug_idx;
