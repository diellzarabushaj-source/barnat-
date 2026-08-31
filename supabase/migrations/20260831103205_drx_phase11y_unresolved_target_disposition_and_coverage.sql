
-- DRx Phase 11Y: explicit disposition queue for products not yet representable
-- by a dose-moiety target. This is review-only; no identity is auto-resolved.

create or replace view drx_dose.unresolved_product_disposition_queue_v1 as
select
  p.drug_id,
  p.registry_number,
  p.pdid,
  p.trade_name,
  p.active_substance,
  p.atc_code,
  p.pharmaceutical_form,
  p.ingredient_resolution_status,
  p.form_status,
  p.route_status,
  p.population_status,
  p.variant_binding_status,
  p.variant_anomaly_codes,
  case
    when coalesce(p.atc_code,'') like 'J07%'
      or lower(coalesce(p.active_substance,'')) ~ '(vaccine|virus|toxoid|antigen|papillomavirus|influenza)'
      then 'VACCINE_OR_BIOLOGIC_SPECIAL_MODEL'
    when coalesce(p.atc_code,'') like 'B05BA%'
      or lower(coalesce(p.trade_name,'')) ~ '(nutriflex|aminoplasmal)'
      then 'PARENTERAL_NUTRITION_COMPLEX'
    when lower(coalesce(p.active_substance,'')) ~ '(^|[ ;])[^;]+[[:space:]]d[0-9]+'
      or lower(coalesce(p.atc_code,'')) in ('v03ax','n05hh20','m09ah20','r05xh20')
      then 'HOMEOPATHIC_COMPLEX_SPECIAL_MODEL'
    when lower(coalesce(p.active_substance,'')) ~ '(equivalent|eqv\.|eqv |equ to|corresponding to|used as| as )'
      then 'EQUIVALENCE_TEXT_IDENTITY_REVIEW'
    when position(';' in coalesce(p.active_substance,''))>0
      or position('+' in coalesce(p.active_substance,''))>0
      then 'COMBINATION_COMPONENT_REVIEW'
    when p.ingredient_resolution_status='EXCLUDED'
      then 'EXCLUDED_OR_NONSTANDARD_PRODUCT_REVIEW'
    else 'OTHER_IDENTITY_REVIEW'
  end as suggested_disposition,
  case
    when p.route_status='UNRESOLVED' then true else false end as route_review_required,
  case
    when p.variant_binding_status='ANOMALY' then true else false end as variant_review_required,
  false::boolean as auto_resolve_allowed
from drx_dose.product_rule_targets_v1 p
where p.target_kind='UNRESOLVED';

create or replace view drx_dose.unresolved_product_disposition_summary_v1 as
select
  suggested_disposition,
  count(*) as product_count,
  count(*) filter (where route_review_required) as route_review_count,
  count(*) filter (where variant_review_required) as variant_review_count,
  false::boolean as auto_resolve_allowed
from drx_dose.unresolved_product_disposition_queue_v1
group by suggested_disposition;

create or replace view drx_dose.dose_target_coverage_summary_v1 as
select
  (select count(*) from public.drugs where is_published and editorial_status='published') as published_products,
  (select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1) as products_represented_by_dose_target,
  (select count(*) from drx_dose.unresolved_product_disposition_queue_v1) as unresolved_target_products,
  (select count(*) from drx_dose.dose_target_catalog_v1) as unique_dose_targets,
  (select count(*) from drx_dose.dose_target_context_queue_v1) as unique_target_contexts,
  round(
    100.0 * (select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1)
    / nullif((select count(*) from public.drugs where is_published and editorial_status='published'),0),
    2
  ) as target_identity_coverage_pct,
  round(
    (select count(*) from public.drugs where is_published and editorial_status='published')::numeric
    / nullif((select count(*) from drx_dose.dose_target_catalog_v1),0),
    2
  ) as products_per_unique_dose_target,
  false::boolean as unresolved_auto_resolve_allowed;

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
  'productsRepresentedByDoseTarget',(select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1),
  'unresolvedTargetProducts',(select count(*) from drx_dose.unresolved_product_disposition_queue_v1),
  'uniqueDoseTargets',(select count(*) from drx_dose.dose_target_catalog_v1),
  'uniqueDoseTargetContexts',(select count(*) from drx_dose.dose_target_context_queue_v1),
  'targetIdentityCoveragePct',(select target_identity_coverage_pct from drx_dose.dose_target_coverage_summary_v1),
  'productTargets',(select count(*) from drx_dose.product_rule_targets_v1),
  'ingredientTargetReady',(select count(*) from drx_dose.product_rule_targets_v1 where ingredient_target_ready),
  'strictAutoInheritReady',(select count(*) from drx_dose.product_rule_targets_v1 where strict_autoinherit_ready),
  'doseMoietyMappings',(select count(*) from drx_dose.component_moiety_map_v1 where mapping_status='VERIFIED'),
  'doseMoietyReuseGroups',(select count(*) from drx_dose.dose_moiety_reuse_groups_v1),
  'doseMoietyGroupsCollapsingRawSets',(select count(*) from drx_dose.dose_moiety_reuse_groups_v1 where raw_ingredient_set_count>1),
  'legacyPublishedRegimensAll',(select count(*) from public.product_dosage_regimens where editorial_status='published'),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'presentationSpecific',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['PRODUCT_PRESENTATION_SPECIFIC']::text[]),
  'restrictionOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where reason_codes @> array['RESTRICTION_ONLY_NO_DOSE_RULE']::text[]),
  'sourceRegimenCandidates',(select count(*) from drx_dose.source_regimen_candidates_v1),
  'sourceRegimenStructurallyComplete',(select count(*) from drx_dose.source_regimen_candidate_readiness_v1 where structurally_complete),
  'sourceRestrictionCandidates',(select count(*) from drx_dose.source_restriction_candidates_v1),
  'sourceAdjustmentCandidates',(select count(*) from drx_dose.source_adjustment_candidates_v1),
  'sourceDraftIndications',(select count(*) from drx_dose.source_indication_review_queue_v1),
  'sourceRegimenPromotionReady',(select count(*) from drx_dose.source_regimen_promotion_queue_v1 where promotion_ready),
  'indicationPhraseCandidates',(select count(*) from drx_dose.indication_phrase_candidates_v1),
  'verifiedIndicationTextBindings',(select count(*) from drx_dose.indication_text_bindings_v1 where binding_status='VERIFIED'),
  'verifiedCandidateSourceOverrides',(select count(*) from drx_dose.candidate_source_overrides_v1 where override_status='VERIFIED'),
  'candidatesWithExact42Evidence',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where matching_snapshot_count=1 and single_section_sha256 is not null),
  'promotionReady',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where promotion_ready),
  'sourceUrlsQueued',(select count(*) from drx_dose.source_ingestion_queue_v1),
  'sourceUrlsIneligible',(select count(*) from drx_dose.source_url_classification_v1 where classification_status='VERIFIED' and dose_source_eligible=false),
  'sourceReplacementRows',(select coalesce(sum(regimen_count),0) from drx_dose.source_replacement_queue_v1),
  'sourceDiscoveryRows',(select count(*) from drx_dose.source_discovery_queue_v1),
  'indicationsQueued',(select count(*) from drx_dose.indication_normalization_queue_v1),
  'contextConflicts',(select count(*) from drx_dose.rule_candidate_context_conflicts_v1),
  'coverageProducts',(select count(*) from drx_dose.product_calculator_coverage_v1),
  'inheritedRuleMatches',(select count(*) from drx_dose.inherited_rule_matches_v1),
  'reviewQueueItems',(select count(*) from drx_dose.phase11_review_queue_v1),
  'autoPublishAllowed',false,
  'runtimeServeEnabled',false,
  'model','fill once per dose-moiety target/context; products inherit only through reviewed compatibility gates'
);
$$;

revoke all on drx_dose.unresolved_product_disposition_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.unresolved_product_disposition_summary_v1 from public,anon,authenticated;
revoke all on drx_dose.dose_target_coverage_summary_v1 from public,anon,authenticated;
grant select on drx_dose.unresolved_product_disposition_queue_v1 to service_role;
grant select on drx_dose.unresolved_product_disposition_summary_v1 to service_role;
grant select on drx_dose.dose_target_coverage_summary_v1 to service_role;
