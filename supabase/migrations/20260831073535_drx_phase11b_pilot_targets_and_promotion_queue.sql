-- DRx Phase 11B: reconcile pilot targets and expose the fill/review queue.
-- Existing reviewed V3 pilots remain constrained to exact strength while variant anomalies are open.
-- No inherited rule is served unless the product passes strict compatibility.

insert into drx_dose.rule_targets_v1 (
  rule_id,target_kind,substance_concept_id,ingredient_set_id,ingredient_concept_ids,
  dose_basis_component_concept_id,form_family,release_key,route_keys,
  required_clinical_variant_id,required_strength_hash,strength_match_mode,
  binding_status,verified_by,verified_at
)
select distinct
  r.rule_id,
  case when s.ingredient_count=1 then 'SUBSTANCE' else 'INGREDIENT_SET' end,
  case when s.ingredient_count=1 then s.concept_ids[1] end,
  case when s.ingredient_count>1 then s.ingredient_set_id end,
  coalesce(s.concept_ids,'{}'::uuid[]),
  r.dose_basis_component_concept_id,
  n.form_family,
  n.normalized_release_key,
  case when r.route is null or btrim(r.route)='' then '{}'::text[] else array[upper(btrim(r.route))] end,
  m.clinical_variant_id,
  m.strength_hash,
  case
    when m.clinical_variant_id is not null then 'EXACT_VARIANT'
    when nullif(btrim(m.strength_hash),'') is not null then 'EXACT_STRENGTH'
    else 'MANUAL_REVIEW'
  end,
  case
    when m.clinical_variant_id is not null or nullif(btrim(m.strength_hash),'') is not null
      then 'VERIFIED'
    else 'IN_REVIEW'
  end,
  case
    when m.clinical_variant_id is not null or nullif(btrim(m.strength_hash),'') is not null
      then coalesce(r.verified_by,rp.verified_by,'system:phase11b-pilot-reconcile')
    else null
  end,
  case
    when m.clinical_variant_id is not null or nullif(btrim(m.strength_hash),'') is not null
      then coalesce(r.verified_at,rp.verified_at,now())
    else null
  end
from public.dose_rules_v3 r
join public.dose_rule_products_v3 rp
  on rp.rule_id=r.rule_id
 and rp.binding_status='verified'
join public.dose_products_v3 dp
  on dp.product_id=rp.product_id
join public.medindex_product_ingredient_sets_v1 s
  on s.source_drug_id=dp.drug_id
left join drx_norm.product_normalization_v1 n
  on n.drug_id=dp.drug_id
left join drx_variant.market_products_v1 m
  on m.product_id=dp.drug_id
where r.editorial_status in ('verified','published')
  and s.ingredient_count>=1
on conflict do nothing;

create or replace view drx_dose.rule_candidate_promotion_queue_v1 as
with source_match as (
  select
    c.candidate_id,
    count(s.snapshot_id)::integer as matching_snapshot_count,
    min(s.snapshot_id) as single_snapshot_id
  from drx_dose.rule_candidate_extractions_v1 c
  left join public.dose_source_snapshots_v3 s
    on s.source_url=c.source_url or s.final_url=c.source_url
  group by c.candidate_id
),
indication_match as (
  select
    c.candidate_id,
    count(distinct t.indication_id)::integer as matching_indication_count,
    min(t.indication_id::text)::uuid as single_indication_id
  from drx_dose.rule_candidate_extractions_v1 c
  left join public.dose_indication_terms_v3 t
    on lower(regexp_replace(btrim(t.term),'[[:space:]]+',' ','g'))
       = lower(regexp_replace(btrim(c.indication_text),'[[:space:]]+',' ','g'))
  group by c.candidate_id
)
select
  c.candidate_id,
  c.legacy_regimen_id,
  c.drug_id,
  c.registry_number,
  c.trade_name,
  c.target_kind,
  c.substance_concept_id,
  c.ingredient_set_id,
  c.ingredient_concept_ids,
  c.patient_group,
  c.normalized_route_keys,
  c.form_family,
  c.release_key,
  c.indication_text,
  c.dose_text,
  c.source_url,
  c.parser_status,
  c.parser_confidence,
  c.parsed_rule_payload,
  c.reason_codes,
  sm.matching_snapshot_count,
  sm.single_snapshot_id,
  im.matching_indication_count,
  im.single_indication_id,
  array_remove(array[
    case when c.target_kind='UNRESOLVED' then 'INGREDIENT_IDENTITY' end,
    case when cardinality(c.normalized_route_keys)=0 then 'ROUTE_NORMALIZATION' end,
    case when c.parser_status<>'STRUCTURED_CANDIDATE' then 'STRUCTURED_DOSE_RULE' end,
    case when cardinality(c.reason_codes)>0 then 'PARSER_COMPLEXITY_REVIEW' end,
    case when sm.matching_snapshot_count<>1 then 'EXACT_SOURCE_SNAPSHOT' end,
    case when im.matching_indication_count<>1 then 'INDICATION_CONCEPT' end,
    case when c.review_status<>'APPROVED' then 'CLINICAL_REVIEW' end
  ],null) as promotion_blockers,
  (
    c.target_kind<>'UNRESOLVED'
    and cardinality(c.normalized_route_keys)>0
    and c.parser_status='STRUCTURED_CANDIDATE'
    and cardinality(c.reason_codes)=0
    and sm.matching_snapshot_count=1
    and im.matching_indication_count=1
    and c.review_status='APPROVED'
  ) as promotion_ready,
  false::boolean as auto_publish_allowed
from drx_dose.rule_candidate_extractions_v1 c
join source_match sm on sm.candidate_id=c.candidate_id
join indication_match im on im.candidate_id=c.candidate_id;

create or replace view drx_dose.phase11_review_queue_v1 as
select
  'PRODUCT_INGREDIENT_IDENTITY'::text as issue_type,
  p.drug_id as entity_id,
  p.registry_number::text as issue_key,
  array['Resolve ingredient identity before rule inheritance']::text[] as details
from drx_dose.product_rule_targets_v1 p
where not p.ingredient_target_ready

union all

select
  'PRODUCT_COMPATIBILITY',
  p.drug_id,
  p.registry_number::text,
  array_remove(array[
    case when p.route_status<>'EXACT' then 'route='||coalesce(p.route_status,'NULL') end,
    case when p.population_status<>'EXACT' then 'population='||coalesce(p.population_status,'NULL') end,
    case when p.variant_binding_status<>'BOUND' then 'variant='||coalesce(p.variant_binding_status,'NULL') end,
    case when cardinality(p.variant_anomaly_codes)>0 then 'anomalies='||array_to_string(p.variant_anomaly_codes,',') end
  ],null)
from drx_dose.product_rule_targets_v1 p
where p.ingredient_target_ready and not p.strict_autoinherit_ready

union all

select
  'DOSE_CANDIDATE',
  q.candidate_id,
  q.registry_number::text||':'||q.patient_group,
  q.promotion_blockers
from drx_dose.rule_candidate_promotion_queue_v1 q
where not q.promotion_ready;

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
  'legacyPublishedRegimensAll',(select count(*) from public.product_dosage_regimens where editorial_status='published'),
  'legacyRegimensExcludedBecauseProductNotPublished',(
    select count(*)
    from public.product_dosage_regimens r
    left join public.drugs d on d.id=r.drug_id
    where r.editorial_status='published'
      and (d.id is null or d.is_published is distinct from true or d.editorial_status<>'published')
  ),
  'ruleTargets',(select count(*) from drx_dose.rule_targets_v1),
  'verifiedRuleTargets',(select count(*) from drx_dose.rule_targets_v1 where binding_status='VERIFIED'),
  'candidateRows',(select count(*) from drx_dose.rule_candidate_extractions_v1),
  'candidateContexts',(select count(*) from drx_dose.rule_candidate_contexts_v1),
  'structuredCandidates',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='STRUCTURED_CANDIDATE'),
  'textOnly',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='TEXT_ONLY'),
  'blocked',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='BLOCKED'),
  'needsReview',(select count(*) from drx_dose.rule_candidate_extractions_v1 where parser_status='NEEDS_REVIEW'),
  'promotionReady',(select count(*) from drx_dose.rule_candidate_promotion_queue_v1 where promotion_ready),
  'inheritedRuleMatches',(select count(*) from drx_dose.inherited_rule_matches_v1),
  'reviewQueueItems',(select count(*) from drx_dose.phase11_review_queue_v1),
  'autoPublishAllowed',false,
  'runtimeServeEnabled',false,
  'model','substance_or_ingredient_set -> verified_rule -> compatible_product'
);
$$;

revoke all on drx_dose.rule_candidate_promotion_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_review_queue_v1 from public,anon,authenticated;
grant select on drx_dose.rule_candidate_promotion_queue_v1 to service_role;
grant select on drx_dose.phase11_review_queue_v1 to service_role;
