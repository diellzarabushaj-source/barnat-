insert into drx_clinical.indication_source_claims_v1(
  indication_claim_id,source_document_id,candidate_concept_ids,source_text,
  source_section_sha256,canonical_name_sq,icd10_codes,population_key,
  approval_status,specialist_only,semantic_status,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/indication-source-claim/' || d.snapshot_id
  ),
  d.source_document_id,
  c.candidate_concept_ids,
  e.section_text,
  e.section_sha256,
  null,'{}'::text[],null,'APPROVED_SOURCE_SECTION',null,'REVIEW_REQUIRED',false
from drx_clinical.source_documents_v1 d
join drx_clinical.source_section_evidence_v1 e
  on e.source_document_id=d.source_document_id and e.section_key='therapeutic_indications'
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id
where d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref')
on conflict (indication_claim_id) do update set
  candidate_concept_ids=excluded.candidate_concept_ids,
  source_text=excluded.source_text,
  source_section_sha256=excluded.source_section_sha256,
  canonical_name_sq=null,icd10_codes='{}'::text[],population_key=null,
  approval_status='APPROVED_SOURCE_SECTION',specialist_only=null,
  semantic_status='REVIEW_REQUIRED',publication_eligible=false;

insert into drx_clinical.safety_source_claims_v1(
  safety_claim_id,source_document_id,candidate_concept_ids,safety_category,
  source_section_key,source_text,source_section_sha256,structured_payload,
  semantic_status,high_risk_flag,publication_eligible
)
select
  extensions.uuid_generate_v5(
    extensions.uuid_ns_url(),
    'https://drx.local/safety-source-claim/' || d.snapshot_id || '/' || e.section_key
  ),
  d.source_document_id,c.candidate_concept_ids,
  case e.section_key
    when 'contraindications' then 'CONTRAINDICATIONS'
    when 'special_warnings_and_precautions' then 'WARNINGS_PRECAUTIONS'
    when 'interactions' then 'INTERACTIONS'
    when 'fertility_pregnancy_lactation' then 'PREGNANCY_LACTATION'
    when 'undesirable_effects' then 'UNDESIRABLE_EFFECTS'
    when 'overdose' then 'OVERDOSE'
  end,
  e.section_key,e.section_text,e.section_sha256,null,'REVIEW_REQUIRED',null,false
from drx_clinical.source_documents_v1 d
join drx_clinical.source_section_evidence_v1 e
  on e.source_document_id=d.source_document_id
 and e.section_key in (
   'contraindications','special_warnings_and_precautions','interactions',
   'fertility_pregnancy_lactation','undesirable_effects','overdose'
 )
join drx_clinical.source_identity_candidates_v1 c
  on c.source_document_id=d.source_document_id
where d.source_key in ('emc-10038-phase8-clinical-ref','emc-13494-phase8-clinical-ref')
on conflict (source_document_id,safety_category) do update set
  candidate_concept_ids=excluded.candidate_concept_ids,
  source_section_key=excluded.source_section_key,
  source_text=excluded.source_text,
  source_section_sha256=excluded.source_section_sha256,
  structured_payload=null,semantic_status='REVIEW_REQUIRED',
  high_risk_flag=null,publication_eligible=false;

create or replace view drx_dose.phase8_source_identity_resolution_v1 as
with refs as (
  select
    cr.drug_id,
    cr.exact_discovery_id,
    d.source_document_id,
    c.resolution_status raw_resolution_status,
    c.candidate_concept_ids,
    mp.composition_concept_id,
    exists (
      select 1
      from drx_dose.exact_market_product_source_bindings_v1 b
      where b.discovery_id=cr.exact_discovery_id
        and b.drug_id=cr.drug_id
        and b.binding_status='VERIFIED'
    ) exact_product_identity_verified,
    cr.source_status='INGESTED'
      and cr.presentation_match_status='MATCHED' clinical_reference_ready
  from drx_dose.phase8_pilot_clinical_references_v1 cr
  join drx_clinical.source_documents_v1 d
    on d.snapshot_id=cr.source_snapshot_id and d.source_key=cr.source_key
  join drx_clinical.source_identity_candidates_v1 c
    on c.source_document_id=d.source_document_id
  join drx_variant.market_products_v1 mp
    on mp.product_id=cr.drug_id
),
component_coverage as (
  select
    r.*,
    count(cc.component_concept_id) component_count,
    count(cc.component_concept_id) filter (
      where cc.component_concept_id=any(r.candidate_concept_ids)
    ) matched_component_count
  from refs r
  left join drx_identity.combination_components_v1 cc
    on cc.combination_concept_id=r.composition_concept_id
   and cc.resolution_status='EXACT'
  group by
    r.drug_id,r.exact_discovery_id,r.source_document_id,r.raw_resolution_status,
    r.candidate_concept_ids,r.composition_concept_id,
    r.exact_product_identity_verified,r.clinical_reference_ready
)
select
  drug_id,source_document_id,composition_concept_id,
  raw_resolution_status,candidate_concept_ids,
  component_count,matched_component_count,
  case
    when raw_resolution_status='UNIQUE_CANDIDATE' then 'UNIQUE_CANDIDATE'
    when exact_product_identity_verified
      and clinical_reference_ready
      and component_count>=2
      and matched_component_count=component_count
      then 'EXACT_PRODUCT_COMBINATION_COMPONENTS'
    else 'UNRESOLVED'
  end resolution_status,
  false::boolean automatic_publication_allowed
from component_coverage;

revoke all on drx_dose.phase8_source_identity_resolution_v1
  from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.drx_phase8_status_v1()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'drx_runtime', 'drx_dose', 'drx_clinical', 'drx_raw'
AS $function$
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

    (
      (select count(*) from drx_clinical.source_identity_candidates_v1
        where resolution_status='UNIQUE_CANDIDATE')
      +
      (select count(*) from drx_dose.phase8_source_identity_resolution_v1
        where resolution_status='EXACT_PRODUCT_COMBINATION_COMPONENTS')
    ) unique_source_identities,
    (select count(*)
       from drx_clinical.source_identity_candidates_v1 c
      where c.resolution_status<>'UNIQUE_CANDIDATE'
        and not exists (
          select 1
          from drx_dose.phase8_source_identity_resolution_v1 r
          where r.source_document_id=c.source_document_id
            and r.resolution_status='EXACT_PRODUCT_COMBINATION_COMPONENTS'
        )
    ) unresolved_source_identities,

    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='REVIEW') review_product_source_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1 where binding_status='VERIFIED') verified_product_source_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1
      where binding_scope='REFERENCE_SUBSTANCE_LABEL') reference_label_bindings,
    (select count(*) from drx_dose.product_source_bindings_v1
      where binding_scope='EXACT_MARKET_PRODUCT') exact_market_product_bindings,
    (select count(*) from drx_dose.product_source_exact_evidence_v1) exact_market_product_evidence_rows,

    (select count(*) from drx_dose.v3_product_candidates_v1) v3_product_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where evidence_tier='SUBSTANCE_STRENGTH_ROUTE_FORM') strongest_review_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where strength_literal_match) strength_literal_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where route_literal_match) route_literal_candidates,
    (select count(*) from drx_dose.v3_product_candidates_v1
      where form_literal_match) form_literal_candidates,

    (select count(*) from drx_dose.phase8_published_v2_comparator_v1) published_v2_comparator_products,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where identity_match_status='EXACT_PRODUCT_CANDIDATE') exact_source_discovery_candidates,
    (select count(*) from drx_dose.phase8_exact_source_discovery_v1
      where snapshot_status='INGESTED') exact_source_snapshot_ready,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='SOURCE_SNAPSHOT_MISSING') pilot_source_snapshot_missing,
    (select count(*) from drx_dose.phase8_pilot_readiness_v1
      where pilot_status='READY_FOR_V3_BUILD') pilot_ready_for_v3_build,

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
        )) phase8_functions,

    (select count(*) from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal
        and (
          (n.nspname='drx_dose'
           and c.relname='product_source_bindings_v1'
           and t.tgname='drx_product_source_binding_verification_guard')
          or
          (n.nspname='drx_dose'
           and c.relname='product_source_exact_evidence_v1'
           and t.tgname='drx_exact_product_evidence_guard')
        )
    ) exact_product_guard_triggers,

    (select count(*)
     from drx_dose.product_source_bindings_v1 b
     where b.binding_status='VERIFIED'
       and (
         b.binding_scope<>'EXACT_MARKET_PRODUCT'
         or not exists (
           select 1
           from drx_dose.product_source_exact_evidence_v1 e
           where e.binding_id=b.binding_id
         )
       )
    ) invalid_verified_product_source_bindings
),
gates as (
  select
    m.*,
    (
      m.phase8_functions=3
      and m.exact_product_guard_triggers=2
      and m.invalid_verified_product_source_bindings=0
      and m.unresolved_source_identities=0
      and m.v3_product_candidates=m.review_product_source_bindings
      and m.review_product_source_bindings>0
      and m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.reconstruction_true_diffs=0
      and m.generated_true_diffs=0
    ) implementation_gate_pass,
    (
      m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.pilot_ready_for_v3_build>0
    ) pilot_preparation_gate_pass,
    (
      m.phase8_functions=3
      and m.exact_product_guard_triggers=2
      and m.invalid_verified_product_source_bindings=0
      and m.unresolved_source_identities=0
      and m.v3_product_candidates=m.review_product_source_bindings
      and m.review_product_source_bindings>0
      and m.published_v2_comparator_products>0
      and m.exact_source_discovery_candidates>0
      and m.v3_published_products>0
      and m.v3_published_rules>0
      and m.verified_product_source_bindings>0
      and m.exact_market_product_evidence_rows>=m.verified_product_source_bindings
      and m.pilot_ready_for_v3_build>0
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

  'unique_source_identities',g.unique_source_identities,
  'unresolved_source_identities',g.unresolved_source_identities,

  'review_product_source_bindings',g.review_product_source_bindings,
  'verified_product_source_bindings',g.verified_product_source_bindings,
  'reference_label_bindings',g.reference_label_bindings,
  'exact_market_product_bindings',g.exact_market_product_bindings,
  'exact_market_product_evidence_rows',g.exact_market_product_evidence_rows,
  'invalid_verified_product_source_bindings',g.invalid_verified_product_source_bindings,
  'exact_product_guard_triggers',g.exact_product_guard_triggers,

  'v3_product_candidates',g.v3_product_candidates,
  'strongest_review_candidates',g.strongest_review_candidates,
  'strength_literal_candidates',g.strength_literal_candidates,
  'route_literal_candidates',g.route_literal_candidates,
  'form_literal_candidates',g.form_literal_candidates,

  'published_v2_comparator_products',g.published_v2_comparator_products,
  'exact_source_discovery_candidates',g.exact_source_discovery_candidates,
  'exact_source_snapshot_ready',g.exact_source_snapshot_ready,
  'pilot_source_snapshot_missing',g.pilot_source_snapshot_missing,
  'pilot_ready_for_v3_build',g.pilot_ready_for_v3_build,

  'legacy_exact_url_only',g.legacy_exact_url_only,
  'legacy_exact_url_and_section_hash',g.legacy_exact_url_and_section_hash,
  'legacy_exact_section_hash_only',g.legacy_exact_section_hash_only,

  'phase8_functions',g.phase8_functions,
  'reconstruction_true_diffs',g.reconstruction_true_diffs,
  'generated_true_diffs',g.generated_true_diffs,

  'shadow_only',true,
  'v2_runtime_preserved',true,
  'v3_cutover_enabled',false,
  'reference_label_can_verify_market_product',false,
  'automatic_candidate_insert_enabled',false,
  'automatic_product_source_verification_enabled',false,
  'automatic_legacy_verification_enabled',false,
  'automatic_exact_source_promotion_enabled',false,
  'publication_allowed',false,

  'implementation_gate_pass',g.implementation_gate_pass,
  'pilot_preparation_gate_pass',g.pilot_preparation_gate_pass,
  'exit_gate_pass',g.exit_gate_pass,
  'gate_pass',g.exit_gate_pass
)
from gates g;
$function$
;
