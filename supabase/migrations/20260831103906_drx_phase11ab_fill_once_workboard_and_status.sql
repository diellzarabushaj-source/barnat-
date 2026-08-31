
-- DRx Phase 11AB: consolidated fill-once workboard and extended status.
-- Pure prioritization/read model. No clinical data publication.

create or replace view drx_dose.dose_target_fill_priority_v1 as
with ctx as (
  select
    q.dose_moiety_key,
    count(*) as context_count,
    sum(q.product_count) as context_product_rows,
    sum(q.strict_ready_product_count) as strict_ready_context_product_rows,
    sum(q.legacy_candidate_rows) as legacy_candidate_rows,
    sum(q.structured_candidate_rows) as structured_candidate_rows,
    sum(q.exact_42_candidate_rows) as exact_42_candidate_rows,
    sum(q.source_regimen_candidate_count) as source_regimen_context_matches
  from drx_dose.dose_target_context_queue_v1 q
  group by q.dose_moiety_key
)
select
  t.dose_moiety_key,
  t.dose_moiety_concept_ids,
  t.dose_moiety_names,
  t.product_count,
  t.strict_ready_product_count,
  t.raw_ingredient_set_count,
  t.source_regimen_candidate_count,
  t.verified_rule_target_count,
  coalesce(c.context_count,0) as context_count,
  coalesce(c.legacy_candidate_rows,0) as legacy_candidate_rows,
  coalesce(c.structured_candidate_rows,0) as structured_candidate_rows,
  coalesce(c.exact_42_candidate_rows,0) as exact_42_candidate_rows,
  (
    t.product_count * 20
    + coalesce(c.exact_42_candidate_rows,0) * 150
    + coalesce(c.structured_candidate_rows,0) * 25
    + t.strict_ready_product_count * 5
  )::integer as priority_score,
  case
    when t.verified_rule_target_count>0 then 'VERIFY_PRODUCT_INHERITANCE'
    when t.source_regimen_candidate_count>0 then 'REVIEW_SOURCE_REGIMENS'
    when coalesce(c.exact_42_candidate_rows,0)>0 then 'STRUCTURE_EXACT_SOURCE_EVIDENCE'
    when coalesce(c.structured_candidate_rows,0)>0 then 'VERIFY_LEGACY_CANDIDATES_AGAINST_SOURCE'
    else 'FIND_OFFICIAL_SOURCE'
  end as next_action
from drx_dose.dose_target_catalog_v1 t
left join ctx c on c.dose_moiety_key=t.dose_moiety_key;

create or replace view drx_dose.phase11_workboard_v1 as
select
  'DOSE_TARGET'::text as work_type,
  p.dose_moiety_key as work_key,
  p.priority_score,
  p.next_action,
  jsonb_build_object(
    'names',p.dose_moiety_names,
    'products',p.product_count,
    'contexts',p.context_count,
    'strictReadyProducts',p.strict_ready_product_count,
    'sourceRegimenCandidates',p.source_regimen_candidate_count,
    'verifiedRuleTargets',p.verified_rule_target_count,
    'exact42CandidateRows',p.exact_42_candidate_rows,
    'structuredLegacyRows',p.structured_candidate_rows
  ) as metadata
from drx_dose.dose_target_fill_priority_v1 p

union all

select
  'UNRESOLVED_PRODUCT',
  coalesce(p.registry_number::text,p.drug_id::text),
  (
    case when p.review_ready then 2000 else 200 end
    + p.source_component_count*10
  )::integer,
  case when p.review_ready then 'IDENTITY_REPAIR_REVIEW'
       else 'RESOLVE_COMPONENT_IDENTITIES' end,
  jsonb_build_object(
    'tradeName',p.trade_name,
    'sourceExpression',p.source_expression,
    'proposedTargetKind',p.proposed_target_kind,
    'proposedConcepts',p.proposed_public_concept_ids,
    'blockers',p.blocker_codes,
    'reviewReady',p.review_ready
  )
from drx_dose.identity_repair_proposals_v1 p
where p.review_status='PENDING'

union all

select
  'STAGE_PUBLIC_LINK',
  p.stage_concept_id::text,
  case when p.review_ready then 1800 else 100 end,
  case when p.review_ready then 'STAGE_PUBLIC_LINK_REVIEW'
       else 'FIND_PUBLIC_IDENTITY_EVIDENCE' end,
  jsonb_build_object(
    'stageName',p.stage_name,
    'candidatePublicNames',p.candidate_public_names,
    'exactMatchCount',p.exact_match_count,
    'matchMethod',p.match_method,
    'blockers',p.blocker_codes,
    'reviewReady',p.review_ready
  )
from drx_dose.stage_public_identity_link_proposals_v1 p
where p.review_status='PENDING';

create or replace function public.drx_phase11_status_v1()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select
jsonb_build_object(
  'publishedProducts',(select count(*) from public.drugs where is_published and editorial_status='published'),
  'productsRepresentedByDoseTarget',(select coalesce(sum(product_count),0) from drx_dose.dose_target_catalog_v1),
  'unresolvedTargetProducts',(select count(*) from drx_dose.unresolved_product_disposition_queue_v1),
  'uniqueDoseTargets',(select count(*) from drx_dose.dose_target_catalog_v1),
  'uniqueDoseTargetContexts',(select count(*) from drx_dose.dose_target_context_queue_v1),
  'targetIdentityCoveragePct',(select target_identity_coverage_pct from drx_dose.dose_target_coverage_summary_v1),
  'doseTargetsWithVerifiedRules',(select count(*) from drx_dose.dose_target_catalog_v1 where verified_rule_target_count>0),
  'doseTargetsWithSourceRegimens',(select count(*) from drx_dose.dose_target_catalog_v1 where source_regimen_candidate_count>0),
  'doseContextsWithExact42Evidence',(select count(*) from drx_dose.dose_target_context_queue_v1 where exact_42_candidate_rows>0),
  'doseContextsWithLegacyCandidates',(select count(*) from drx_dose.dose_target_context_queue_v1 where structured_candidate_rows>0),
  'identityRepairProposalRows',(select count(*) from drx_dose.identity_repair_proposals_v1),
  'identityRepairReviewReady',(select count(*) from drx_dose.identity_repair_proposals_v1 where review_status='PENDING' and review_ready),
  'stagePublicLinkProposalRows',(select count(*) from drx_dose.stage_public_identity_link_proposals_v1),
  'stagePublicLinkReviewReady',(select count(*) from drx_dose.stage_public_identity_link_proposals_v1 where review_status='PENDING' and review_ready),
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
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW')
)
||
jsonb_build_object(
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
  'identityAutoApplyAllowed',false,
  'runtimeServeEnabled',false,
  'model','fill once per dose-moiety target/context; products inherit only through reviewed compatibility gates'
);
$$;

revoke all on drx_dose.dose_target_fill_priority_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_workboard_v1 from public,anon,authenticated;
grant select on drx_dose.dose_target_fill_priority_v1 to service_role;
grant select on drx_dose.phase11_workboard_v1 to service_role;
