-- DRx Phase 8B: candidate source bindings and strict exit-gate hardening.
-- Candidate bindings are review-only; no product/source relationship is verified here.

with unique_sources as (
  select
    d.source_document_id,
    c.candidate_concept_ids[1] public_concept_id
  from drx_clinical.source_documents_v1 d
  join drx_clinical.source_identity_candidates_v1 c using(source_document_id)
  where c.resolution_status='UNIQUE_CANDIDATE'
),
product_concepts as (
  select
    m.product_id drug_id,
    m.clinical_variant_id,
    c.public_concept_id
  from drx_variant.market_products_v1 m
  join drx_stage.product_registry_v1 p on p.drug_id=m.product_id
  join drx_identity.source_concept_map_v1 sm
    on sm.source_namespace='STAGE'
   and sm.source_concept_id=p.substance_concept_id
  join drx_identity.canonical_concepts_v1 c
    on c.concept_id=sm.canonical_concept_id
  where m.binding_status='BOUND'
    and c.public_concept_id is not null
),
candidates as (
  select
    p.drug_id,
    p.clinical_variant_id,
    s.source_document_id
  from product_concepts p
  join unique_sources s on s.public_concept_id=p.public_concept_id
)
insert into drx_dose.product_source_bindings_v1(
  drug_id,clinical_variant_id,source_document_id,binding_status,match_note
)
select
  drug_id,
  clinical_variant_id,
  source_document_id,
  'REVIEW',
  'AUTO_CANDIDATE_EXACT_SOURCE_IDENTITY; NOT_VERIFIED'
from candidates
on conflict (drug_id,source_document_id) do nothing;

create or replace view drx_runtime.legacy_evidence_alignment_v1 as
select
  l.source_document_id,
  l.source_key,
  l.legacy_regimen_id,
  l.drug_id,
  l.editorial_status,
  l.calculation_status,
  l.legacy_source_url,
  l.legacy_source_hash,
  d.source_url current_source_url,
  d.final_url current_final_url,
  d.snapshot_id current_snapshot_id,
  d.section_4_2_sha256 current_section_4_2_sha256,
  (
    nullif(btrim(l.legacy_source_url),'') is not null
    and (
      lower(btrim(l.legacy_source_url))=lower(btrim(d.source_url))
      or lower(btrim(l.legacy_source_url))=lower(btrim(coalesce(d.final_url,'')))
    )
  ) url_exact,
  (
    nullif(btrim(l.legacy_source_hash),'') is not null
    and lower(btrim(l.legacy_source_hash))=lower(d.section_4_2_sha256)
  ) section_hash_exact,
  (
    nullif(btrim(l.legacy_source_hash),'') is not null
    and lower(btrim(l.legacy_source_hash))=lower(d.snapshot_id)
  ) snapshot_hash_exact,
  case
    when
      nullif(btrim(l.legacy_source_url),'') is not null
      and (
        lower(btrim(l.legacy_source_url))=lower(btrim(d.source_url))
        or lower(btrim(l.legacy_source_url))=lower(btrim(coalesce(d.final_url,'')))
      )
      and nullif(btrim(l.legacy_source_hash),'') is not null
      and lower(btrim(l.legacy_source_hash))=lower(d.section_4_2_sha256)
      then 'EXACT_URL_AND_SECTION_HASH'
    when
      nullif(btrim(l.legacy_source_hash),'') is not null
      and lower(btrim(l.legacy_source_hash))=lower(d.section_4_2_sha256)
      then 'EXACT_SECTION_HASH_ONLY'
    when
      nullif(btrim(l.legacy_source_url),'') is not null
      and (
        lower(btrim(l.legacy_source_url))=lower(btrim(d.source_url))
        or lower(btrim(l.legacy_source_url))=lower(btrim(coalesce(d.final_url,'')))
      )
      then 'EXACT_URL_ONLY'
    else 'NO_DIRECT_EVIDENCE_MATCH'
  end alignment_status,
  false::boolean automatic_verification_allowed
from drx_dose.legacy_regimen_candidates_v1 l
join drx_clinical.source_documents_v1 d
  on d.source_document_id=l.source_document_id;

create or replace function public.drx_phase8_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_runtime,drx_dose,drx_raw
as $$
with metrics as (
  select
    (select count(*) from drx_runtime.published_product_read_model_v1) v3_read_model_products,
    (select count(*) from public.dose_products_v3 where editorial_status='published') v3_published_products,
    (select count(*) from public.dose_rules_v3 where editorial_status='published') v3_published_rules,

    (select count(*) from drx_runtime.shadow_comparisons_v1) shadow_comparisons,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='MATCH') shadow_matches,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='DIFF') shadow_diffs,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='V2_ONLY') shadow_v2_only,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='V3_ONLY') shadow_v3_only,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='BOTH_MISSING') shadow_both_missing,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='V3_ERROR') shadow_v3_errors,
    (select count(*) from drx_runtime.shadow_comparisons_v1 where comparison_status='SKIPPED') shadow_skipped,

    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='REVIEW') review_product_source_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='VERIFIED') verified_product_source_bindings,

    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_URL_ONLY') legacy_exact_url_only,
    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_URL_AND_SECTION_HASH') legacy_exact_url_and_section_hash,
    (select count(*) from drx_runtime.legacy_evidence_alignment_v1
      where alignment_status='EXACT_SECTION_HASH_ONLY') legacy_exact_section_hash_only,

    (select count(*) from drx_raw.registry_reconstruction_diff_v1 where differs) reconstruction_true_diffs,
    (select count(*) from drx_raw.registry_generated_projection_diff_v1
      where active_substance_key_differs
         or global_search_text_differs
         or registry_search_text_differs) generated_true_diffs,

    (select count(*) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in (
          'drx_dose_search_v3_shadow_v1',
          'drx_record_dose_shadow_comparison_v1',
          'drx_phase8_status_v1'
        )) phase8_functions
),
gates as (
  select
    m.*,
    (
      m.phase8_functions=3
      and m.reconstruction_true_diffs=0
      and m.generated_true_diffs=0
      and m.review_product_source_bindings>0
    ) implementation_gate_pass,
    (
      m.v3_published_products>0
      and m.v3_published_rules>0
      and m.shadow_comparisons>0
      and m.shadow_matches=m.shadow_comparisons
      and m.shadow_diffs=0
      and m.shadow_v2_only=0
      and m.shadow_v3_only=0
      and m.shadow_both_missing=0
      and m.shadow_v3_errors=0
      and m.shadow_skipped=0
      and m.reconstruction_true_diffs=0
      and m.generated_true_diffs=0
    ) exit_gate_pass
  from metrics m
)
select jsonb_build_object(
  'v3_read_model_products',g.v3_read_model_products,
  'v3_published_products',g.v3_published_products,
  'v3_published_rules',g.v3_published_rules,

  'shadow_comparisons',g.shadow_comparisons,
  'shadow_matches',g.shadow_matches,
  'shadow_diffs',g.shadow_diffs,
  'shadow_v2_only',g.shadow_v2_only,
  'shadow_v3_only',g.shadow_v3_only,
  'shadow_both_missing',g.shadow_both_missing,
  'shadow_v3_errors',g.shadow_v3_errors,
  'shadow_skipped',g.shadow_skipped,

  'review_product_source_bindings',g.review_product_source_bindings,
  'verified_product_source_bindings',g.verified_product_source_bindings,

  'legacy_exact_url_only',g.legacy_exact_url_only,
  'legacy_exact_url_and_section_hash',g.legacy_exact_url_and_section_hash,
  'legacy_exact_section_hash_only',g.legacy_exact_section_hash_only,

  'phase8_functions',g.phase8_functions,
  'reconstruction_true_diffs',g.reconstruction_true_diffs,
  'generated_true_diffs',g.generated_true_diffs,

  'shadow_only',true,
  'v2_runtime_preserved',true,
  'v3_cutover_enabled',false,
  'automatic_legacy_verification_enabled',false,
  'publication_allowed',false,

  'implementation_gate_pass',g.implementation_gate_pass,
  'exit_gate_pass',g.exit_gate_pass,
  'gate_pass',g.exit_gate_pass
)
from gates g;
$$;

revoke all on all tables in schema drx_runtime from public,anon,authenticated;
revoke all on schema drx_runtime from public,anon,authenticated;
revoke all on function public.drx_phase8_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase8_status_v1() to service_role;

comment on view drx_runtime.legacy_evidence_alignment_v1 is
  'Legacy regimen evidence alignment only. Exact URL without exact section hash never auto-verifies.';
