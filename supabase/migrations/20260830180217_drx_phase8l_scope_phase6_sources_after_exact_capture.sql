create or replace function public.drx_phase6_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_clinical,drx_variant,drx_dose,drx_raw
as $$
with metrics as (
  select
    (select count(distinct source_key) from drx_clinical.source_documents_v1) clinical_source_keys,
    (select count(distinct source_key) from public.dose_source_snapshots_v3) all_snapshot_source_keys,
    (select count(distinct source_key)
      from public.dose_source_snapshots_v3
      where document_type='official_medicines_registry_product_record') exact_market_registry_source_keys,

    (select count(*) from drx_clinical.source_documents_v1) source_documents,
    (select count(*) from drx_clinical.source_documents_v1
      where evidence_status='CORE_AND_SAFETY_COMPLETE') full_safety_documents,
    (select count(*) from drx_clinical.source_section_evidence_v1) current_section_evidence,
    (select count(*) from drx_clinical.indication_source_claims_v1) indication_source_claims,
    (select count(*) from drx_clinical.safety_source_claims_v1) safety_source_claims,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status='UNIQUE_CANDIDATE') unique_source_identity_candidates,
    (select count(*) from drx_clinical.source_identity_candidates_v1
      where resolution_status='MULTIPLE_CANDIDATES') ambiguous_source_identity_candidates,

    (select count(*) from drx_variant.market_products_v1) market_products,
    (select count(*) from drx_clinical.market_product_classification_v1) classified_market_products,
    (select count(*) from drx_variant.clinical_variants_v1) variants,
    (select count(*) from drx_clinical.variant_classification_v1) classified_variants,
    (select count(*) from drx_clinical.variant_classification_v1
      where atc_status='EXACT') exact_atc_variants,
    (select count(*) from drx_clinical.variant_classification_v1
      where atc_status='CONFLICT') atc_conflict_variants,

    (select count(*) from drx_clinical.source_evidence_integrity_v1
      where not (
        raw_hash_matches
        and section_2_hash_matches
        and section_4_1_hash_matches
        and section_4_2_hash_matches
        and section_4_3_hash_matches
        and section_4_4_hash_matches
        and section_4_5_hash_matches
        and section_4_6_hash_matches
      )) evidence_hash_mismatches,

    (select count(*)
     from drx_clinical.source_documents_v1 d
     join drx_clinical.source_authority_policy_v1 p using(authority_key)
     where d.authority_rank<>p.priority_rank) source_policy_rank_mismatches,

    (select count(*) from drx_clinical.indication_source_claims_v1
      where canonical_name_sq is not null or cardinality(icd10_codes)>0) inferred_indication_semantics,

    (select count(*) from drx_clinical.safety_source_claims_v1
      where structured_payload is not null or high_risk_flag is not null) inferred_safety_semantics,

    (select count(*) from drx_clinical.clinical_review_queue_v1) review_queue_open,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs
)
select jsonb_build_object(
  'source_keys',m.clinical_source_keys,
  'clinical_source_keys',m.clinical_source_keys,
  'all_snapshot_source_keys',m.all_snapshot_source_keys,
  'exact_market_registry_source_keys',m.exact_market_registry_source_keys,
  'current_source_documents',m.source_documents,
  'full_safety_documents',m.full_safety_documents,
  'current_section_evidence',m.current_section_evidence,
  'indication_source_claims',m.indication_source_claims,
  'safety_source_claims',m.safety_source_claims,
  'unique_source_identity_candidates',m.unique_source_identity_candidates,
  'ambiguous_source_identity_candidates',m.ambiguous_source_identity_candidates,
  'market_products',m.market_products,
  'classified_market_products',m.classified_market_products,
  'clinical_variants',m.variants,
  'classified_variants',m.classified_variants,
  'exact_atc_variants',m.exact_atc_variants,
  'atc_conflict_variants',m.atc_conflict_variants,
  'evidence_hash_mismatches',m.evidence_hash_mismatches,
  'source_policy_rank_mismatches',m.source_policy_rank_mismatches,
  'inferred_indication_semantics',m.inferred_indication_semantics,
  'inferred_safety_semantics',m.inferred_safety_semantics,
  'review_queue_open',m.review_queue_open,
  'reconstruction_true_diffs',m.reconstruction_true_diffs,
  'generated_true_diffs',m.generated_true_diffs,
  'variant_source_binding_inferred',false,
  'icd10_inferred_from_free_text',false,
  'safety_semantics_inferred_from_free_text',false,
  'exact_market_registry_evidence_is_clinical_smpc',false,
  'publication_allowed',false,
  'gate_pass',
    m.source_documents=m.clinical_source_keys
    and m.full_safety_documents=m.clinical_source_keys
    and m.indication_source_claims=m.clinical_source_keys
    and m.classified_market_products=m.market_products
    and m.classified_variants=m.variants
    and m.evidence_hash_mismatches=0
    and m.source_policy_rank_mismatches=0
    and m.inferred_indication_semantics=0
    and m.inferred_safety_semantics=0
    and m.reconstruction_true_diffs=0
    and m.generated_true_diffs=0
)
from metrics m;
$$;

revoke all on function public.drx_phase6_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase6_status_v1() to service_role;

comment on function public.drx_phase6_status_v1() is
  'Phase 6 clinical provenance status. Clinical SmPC source keys are scoped separately from later exact-market registry captures.';
