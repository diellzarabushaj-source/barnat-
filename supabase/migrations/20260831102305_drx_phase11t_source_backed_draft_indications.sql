
-- DRx Phase 11T: materialize source-backed indication concepts as DRAFT only.
-- This creates the objects needed to attach rules to indications without
-- pretending that semantic/ICD review has already happened.

alter table drx_dose.source_regimen_candidates_v1
  add column if not exists indication_id uuid
  references public.dose_indication_concepts_v3(indication_id) on delete restrict;

with src as (
  select distinct on (r.indication_key_candidate)
    r.indication_key_candidate,
    r.indication_label,
    r.source_snapshot_id
  from drx_dose.source_regimen_candidates_v1 r
  order by r.indication_key_candidate,r.created_at
)
insert into public.dose_indication_concepts_v3(
  indication_id,indication_key,canonical_name,icd10_codes,
  icd_verification_status,editorial_status
)
select
  gen_random_uuid(),
  s.indication_key_candidate,
  s.indication_label,
  '{}'::text[],
  'unverified',
  'draft'
from src s
where not exists (
  select 1 from public.dose_indication_concepts_v3 i
  where i.indication_key=s.indication_key_candidate
);

-- Add a canonical draft term for navigation/review. verified_at stays NULL.
with src as (
  select distinct on (r.indication_key_candidate)
    r.indication_key_candidate,
    r.indication_label,
    r.source_snapshot_id
  from drx_dose.source_regimen_candidates_v1 r
  order by r.indication_key_candidate,r.created_at
),
resolved as (
  select s.*,i.indication_id
  from src s
  join public.dose_indication_concepts_v3 i
    on i.indication_key=s.indication_key_candidate
)
insert into public.dose_indication_terms_v3(
  term_key,indication_id,term,language,term_type,source_snapshot_id,verified_at
)
select
  'TERM-SRC-'||md5(r.indication_key_candidate),
  r.indication_id,
  r.indication_label,
  'en',
  'canonical',
  r.source_snapshot_id,
  null
from resolved r
on conflict (term_key) do nothing;

update drx_dose.source_regimen_candidates_v1 r
set indication_id=i.indication_id,updated_at=now()
from public.dose_indication_concepts_v3 i
where i.indication_key=r.indication_key_candidate
  and r.indication_id is distinct from i.indication_id;

create or replace view drx_dose.source_indication_review_queue_v1 as
select
  i.indication_id,
  i.indication_key,
  i.canonical_name,
  i.icd10_codes,
  i.icd_verification_status,
  i.editorial_status,
  count(distinct r.regimen_key) as regimen_candidate_count,
  array_agg(distinct r.source_snapshot_id order by r.source_snapshot_id) as source_snapshot_ids,
  array_agg(distinct r.source_url order by r.source_url) as source_urls,
  array_agg(distinct r.patient_group order by r.patient_group) as patient_groups
from public.dose_indication_concepts_v3 i
join drx_dose.source_regimen_candidates_v1 r on r.indication_id=i.indication_id
where i.editorial_status in ('draft','in_review')
group by i.indication_id,i.indication_key,i.canonical_name,i.icd10_codes,i.icd_verification_status,i.editorial_status;

create or replace view drx_dose.source_regimen_promotion_queue_v1 as
select
  r.regimen_key,
  r.substance_concept_id,
  r.indication_id,
  r.indication_key_candidate,
  r.indication_label,
  r.patient_group,
  r.route_key,
  r.form_family,
  r.regimen_kind,
  ready.step_count,
  ready.structurally_complete,
  i.editorial_status as indication_editorial_status,
  i.icd_verification_status,
  r.review_status,
  array_remove(array[
    case when not ready.structurally_complete then 'REGIMEN_STRUCTURE' end,
    case when r.indication_id is null then 'INDICATION_OBJECT' end,
    case when i.editorial_status<>'published' then 'INDICATION_REVIEW_PUBLICATION' end,
    case when r.review_status<>'APPROVED' then 'CLINICAL_REGIMEN_REVIEW' end
  ],null) as promotion_blockers,
  false::boolean as promotion_ready,
  false::boolean as auto_publish_allowed,
  false::boolean as runtime_ready
from drx_dose.source_regimen_candidates_v1 r
join drx_dose.source_regimen_candidate_readiness_v1 ready on ready.regimen_key=r.regimen_key
left join public.dose_indication_concepts_v3 i on i.indication_id=r.indication_id;

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
  'sourceRegimenCandidates',(select count(*) from drx_dose.source_regimen_candidates_v1),
  'sourceRegimenStructurallyComplete',(select count(*) from drx_dose.source_regimen_candidate_readiness_v1 where structurally_complete),
  'sourceRestrictionCandidates',(select count(*) from drx_dose.source_restriction_candidates_v1),
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
  'model','product ingredient identity -> evidence-backed dose moiety -> source regimen -> reviewed indication -> reviewed rule -> compatible product'
);
$$;

revoke all on drx_dose.source_indication_review_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_promotion_queue_v1 from public,anon,authenticated;
grant select on drx_dose.source_indication_review_queue_v1 to service_role;
grant select on drx_dose.source_regimen_promotion_queue_v1 to service_role;
