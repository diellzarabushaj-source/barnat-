
-- DRx Phase 11BH: source-regimen -> product inheritance preview.
-- Preview only: no product binding is created and nothing is auto-approved.

create or replace view drx_dose.source_regimen_product_inheritance_preview_v1 as
with base as (
  select
    r.regimen_key,r.indication_label,r.patient_group,r.route_key,r.form_family,
    r.target_kind,r.dose_moiety_key,r.strength_match_mode,
    s.branch_no,s.step_no,
    p.drug_id,p.registry_number,p.trade_name,p.pharmaceutical_form,
    p.form_family as product_form_family,p.release_key as product_release_key,
    p.route_keys,p.population_key,p.strength_parse,p.strict_autoinherit_ready,
    p.ingredient_target_ready,p.variant_binding_status,p.variant_anomaly_codes,
    pr.required_strength_value,pr.required_strength_unit,
    pr.required_form_family,pr.required_route_key,pr.required_release_key,
    pr.presentation_policy,pr.review_status as presentation_review_status,
    pr.auto_bind_allowed as presentation_auto_bind_allowed
  from drx_dose.source_regimen_candidates_v1 r
  join drx_dose.source_regimen_steps_v1 s
    on s.regimen_key=r.regimen_key
  join drx_dose.product_dose_moiety_targets_v1 p
    on p.dose_moiety_key=r.dose_moiety_key
   and p.target_kind=r.target_kind
  left join drx_dose.source_regimen_step_presentation_requirements_v1 pr
    on pr.regimen_key=s.regimen_key
   and pr.branch_no=s.branch_no
   and pr.step_no=s.step_no
),
flags as (
  select b.*,
    (
      b.ingredient_target_ready
      and (
        (b.patient_group='adult_only' and b.population_key in ('ADULT_ONLY','ADULT_AND_PEDIATRIC'))
        or (b.patient_group in ('pediatric_only','age_band') and b.population_key in ('PEDIATRIC_ONLY','ADULT_AND_PEDIATRIC'))
        or (b.patient_group='pediatric_and_adult' and b.population_key='ADULT_AND_PEDIATRIC')
      )
    ) as identity_population_ok,
    (
      coalesce(b.required_route_key,b.route_key) is null
      or coalesce(b.required_route_key,b.route_key)=any(b.route_keys)
    ) as route_ok,
    (
      coalesce(b.required_form_family,b.form_family) is null
      or coalesce(b.required_form_family,b.form_family)=b.product_form_family
    ) as form_ok,
    (
      b.required_release_key is null
      or b.required_release_key=b.product_release_key
    ) as release_ok,
    case
      when b.presentation_policy='EXACT_STRENGTH'
           and lower(coalesce(b.required_strength_unit,''))='mg'
        then
          b.strength_parse->>'status'='PARSED_AMOUNT'
          and lower(coalesce(b.strength_parse->>'unit',''))='mg'
          and (b.strength_parse->>'value')::numeric=b.required_strength_value
      when b.presentation_policy='EXACT_STRENGTH'
           and lower(coalesce(b.required_strength_unit,''))='mg/ml'
        then
          b.strength_parse->>'status'='PARSED_CONCENTRATION'
          and lower(coalesce(b.strength_parse#>>'{numerator,unit}',''))='mg'
          and lower(coalesce(b.strength_parse#>>'{denominator,unit}',''))='ml'
          and (b.strength_parse#>>'{denominator,value}')::numeric > 0
          and (
            (b.strength_parse#>>'{numerator,value}')::numeric
            / (b.strength_parse#>>'{denominator,value}')::numeric
          )=b.required_strength_value
      when b.presentation_policy='EXACT_STRENGTH' then false
      else true
    end as explicit_strength_ok
  from base b
),
classified as (
  select f.*,
    array_remove(array[
      case when not f.identity_population_ok then 'IDENTITY_OR_POPULATION_MISMATCH' end,
      case when not f.route_ok then 'ROUTE_MISMATCH' end,
      case when not f.form_ok then 'FORM_MISMATCH' end,
      case when not f.release_ok then 'RELEASE_MISMATCH' end,
      case when not f.explicit_strength_ok then 'EXACT_STRENGTH_MISMATCH' end
    ],null) as hard_blockers,
    array_remove(array[
      case when f.strength_match_mode='MANUAL_REVIEW' then 'SOURCE_STRENGTH_POLICY_MANUAL_REVIEW' end,
      case
        when f.strength_match_mode='EXACT_COMPONENT_STRENGTH'
         and f.presentation_policy is null
        then 'EXACT_COMPONENT_PRESENTATION_RULE_MISSING'
      end,
      case
        when f.presentation_policy is not null
         and coalesce(f.presentation_review_status,'') not in ('APPROVED','PROMOTED')
        then 'PRESENTATION_REQUIREMENT_REVIEW'
      end,
      case
        when f.presentation_policy='COMPATIBLE_STRENGTH_REVIEW'
        then 'COMPATIBLE_STRENGTH_REVIEW'
      end,
      case
        when coalesce(f.required_form_family,f.form_family) is null
        then 'FORM_APPLICABILITY_REVIEW'
      end,
      case when not f.strict_autoinherit_ready then 'PRODUCT_VARIANT_NOT_STRICT' end
    ],null) as review_reasons
  from flags f
)
select
  *,
  case
    when cardinality(hard_blockers)>0 then 'BLOCKED'
    when cardinality(review_reasons)>0 then 'REVIEW_REQUIRED'
    else 'STRICT_CANDIDATE'
  end as inheritance_status,
  false::boolean as auto_bind_allowed
from classified;

create or replace view drx_dose.source_regimen_product_inheritance_summary_v1 as
select
  regimen_key,
  count(*) as evaluated_product_step_rows,
  count(*) filter (where inheritance_status='STRICT_CANDIDATE') as strict_candidate_rows,
  count(distinct drug_id) filter (where inheritance_status='STRICT_CANDIDATE') as strict_candidate_products,
  count(*) filter (where inheritance_status='REVIEW_REQUIRED') as review_required_rows,
  count(*) filter (where inheritance_status='BLOCKED') as blocked_rows,
  false::boolean as auto_bind_allowed
from drx_dose.source_regimen_product_inheritance_preview_v1
group by regimen_key;

revoke all on drx_dose.source_regimen_product_inheritance_preview_v1 from public,anon,authenticated;
revoke all on drx_dose.source_regimen_product_inheritance_summary_v1 from public,anon,authenticated;
grant select on drx_dose.source_regimen_product_inheritance_preview_v1 to service_role;
grant select on drx_dose.source_regimen_product_inheritance_summary_v1 to service_role;
