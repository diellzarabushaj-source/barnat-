
-- DRx Phase 11U: source-backed renal/hepatic adjustment staging.
-- Dose modifications remain review-only and are never auto-applied from text.

create table if not exists drx_dose.source_adjustment_candidates_v1 (
  adjustment_key text primary key,
  regimen_key text
    references drx_dose.source_regimen_candidates_v1(regimen_key) on delete cascade,
  substance_concept_id uuid not null
    references public.substance_concepts_v1(concept_id) on delete restrict,
  adjustment_domain text not null
    check (adjustment_domain in ('RENAL','HEPATIC')),
  measure_type text not null,
  min_value numeric,
  max_value numeric,
  min_inclusive boolean not null default true,
  max_inclusive boolean not null default true,
  accepted_values text[] not null default '{}'::text[],
  action_type text not null
    check (action_type in (
      'NO_CHANGE','REPLACE_DOSE','CONSIDER_REDUCTION','MAX_DAILY_CAP',
      'NOT_RECOMMENDED','CONTRAINDICATED','CAUTION','MONITOR','MANUAL_REVIEW'
    )),
  replacement_dose_min numeric,
  replacement_dose_max numeric,
  replacement_dose_unit text,
  replacement_frequency_mode text,
  replacement_times_per_day numeric,
  max_daily_dose_mg numeric,
  condition_text text,
  source_snapshot_id text not null
    references public.dose_source_snapshots_v3(snapshot_id) on delete restrict,
  source_section_code text not null check (source_section_code in ('4.2','4.3','4.4')),
  source_section_sha256 text not null check (source_section_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (source_url ~ '^https://'),
  review_status text not null default 'PENDING'
    check (review_status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','PROMOTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  auto_apply_allowed boolean not null default false check (auto_apply_allowed=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (
    review_status not in ('APPROVED','PROMOTED')
    or (nullif(btrim(reviewed_by),'') is not null and reviewed_at is not null)
  )
);

create index if not exists source_adjustment_candidates_v1_regimen_idx
  on drx_dose.source_adjustment_candidates_v1(regimen_key,review_status);
create index if not exists source_adjustment_candidates_v1_substance_idx
  on drx_dose.source_adjustment_candidates_v1(substance_concept_id,adjustment_domain,review_status);

with src as (
  select s.snapshot_id,s.source_url,sec.section_sha256
  from public.dose_source_snapshots_v3 s
  join public.dose_source_sections_v3 sec
    on sec.snapshot_id=s.snapshot_id
   and sec.section_code='4.2'
   and sec.extraction_status='extracted'
  where s.source_key='EMC-PRODUCT-101916-SMPC'
  order by s.created_at desc limit 1
),
sub as (
  select concept_id from public.substance_concepts_v1 where canonical_key='rivaroxaban'
)
insert into drx_dose.source_adjustment_candidates_v1(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,review_status
)
select * from (
  select
    'SRC-ADJ-RIVA-NVAF-CRCL-15-49'::text,'SRC-RIVA-NVAF-ADULT',sub.concept_id,
    'RENAL','CrCl_mL_min',15::numeric,49::numeric,true,true,'REPLACE_DOSE',
    15::numeric,15::numeric,'mg','times_per_day',1::numeric,
    'Adult NVAF renal dose for moderate or severe renal impairment within the stated CrCl range.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING'
  from sub cross join src

  union all

  select
    'SRC-ADJ-RIVA-DVTPE-CRCL-15-49-CONSIDER', 'SRC-RIVA-DVTPE-ADULT-SEQUENCE',sub.concept_id,
    'RENAL','CrCl_mL_min',15::numeric,49::numeric,true,true,'CONSIDER_REDUCTION',
    15::numeric,15::numeric,'mg','times_per_day',1::numeric,
    'After the initial 3-week phase, reduction from 20 mg once daily to 15 mg once daily may be considered if assessed bleeding risk outweighs recurrence risk; this requires clinical judgment.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING'
  from sub cross join src

  union all

  select
    'SRC-ADJ-RIVA-PED-GFR-BELOW-50', 'SRC-RIVA-PED-VTE-WEIGHT-BANDS',sub.concept_id,
    'RENAL','eGFR_mL_min_1_73m2',null::numeric,50::numeric,true,false,'NOT_RECOMMENDED',
    null::numeric,null::numeric,null::text,null::text,null::numeric,
    'Paediatric rivaroxaban is not recommended with moderate or severe renal impairment below the stated GFR threshold because clinical data are unavailable.',
    src.snapshot_id,'4.2',src.section_sha256,src.source_url,'PENDING'
  from sub cross join src
) x(
  adjustment_key,regimen_key,substance_concept_id,adjustment_domain,measure_type,
  min_value,max_value,min_inclusive,max_inclusive,action_type,
  replacement_dose_min,replacement_dose_max,replacement_dose_unit,
  replacement_frequency_mode,replacement_times_per_day,
  condition_text,source_snapshot_id,source_section_code,source_section_sha256,source_url,review_status
)
on conflict (adjustment_key) do nothing;

create or replace view drx_dose.source_adjustment_review_queue_v1 as
select
  a.adjustment_key,a.regimen_key,a.substance_concept_id,a.adjustment_domain,a.measure_type,
  a.min_value,a.max_value,a.min_inclusive,a.max_inclusive,a.accepted_values,
  a.action_type,a.replacement_dose_min,a.replacement_dose_max,a.replacement_dose_unit,
  a.replacement_frequency_mode,a.replacement_times_per_day,a.max_daily_dose_mg,
  a.condition_text,a.source_snapshot_id,a.source_section_code,a.source_section_sha256,
  a.source_url,a.review_status,a.auto_apply_allowed
from drx_dose.source_adjustment_candidates_v1 a
where a.review_status in ('PENDING','IN_REVIEW');

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
  'model','product identity -> dose moiety -> source regimen + restrictions + adjustments -> reviewed indication -> reviewed rule -> compatible product'
);
$$;

alter table drx_dose.source_adjustment_candidates_v1 enable row level security;
revoke all on drx_dose.source_adjustment_candidates_v1 from public,anon,authenticated;
revoke all on drx_dose.source_adjustment_review_queue_v1 from public,anon,authenticated;
grant select,insert,update on drx_dose.source_adjustment_candidates_v1 to service_role;
grant select on drx_dose.source_adjustment_review_queue_v1 to service_role;
