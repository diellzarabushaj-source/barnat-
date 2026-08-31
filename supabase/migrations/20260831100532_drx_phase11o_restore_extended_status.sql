
-- DRx Phase 11O: restore/extend Phase 11 status after exact-source override rollout.

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
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
  'model','product ingredient identity -> evidence-backed dose moiety -> reviewed verified rule -> compatible product'
);
$$;

revoke all on function public.drx_phase11_status_v1() from public,anon,authenticated;
grant execute on function public.drx_phase11_status_v1() to service_role;
