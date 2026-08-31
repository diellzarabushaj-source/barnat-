
-- DRx Phase 11BG: canonical combination rule targets + explicit numeric strength matching.
-- This keeps old targets valid while allowing a rule to belong to a canonical dose-moiety
-- combination instead of an arbitrary raw salt ingredient_set.

alter table drx_dose.rule_targets_v1
  add column if not exists required_strength_value numeric,
  add column if not exists required_strength_unit text,
  add column if not exists presentation_policy text;

alter table drx_dose.rule_targets_v1
  drop constraint if exists rule_targets_v1_check,
  add constraint rule_targets_v1_check check (
    (
      target_kind='SUBSTANCE'
      and substance_concept_id is not null
    )
    or
    (
      target_kind='INGREDIENT_SET'
      and dose_moiety_key is not null
      and cardinality(coalesce(dose_moiety_concept_ids,'{}'::uuid[])) >= 2
    )
  ),
  drop constraint if exists rule_targets_v1_check3,
  add constraint rule_targets_v1_check3 check (
    strength_match_mode <> 'EXACT_STRENGTH'
    or nullif(btrim(required_strength_hash),'') is not null
    or (
      required_strength_value is not null
      and required_strength_value > 0
      and nullif(btrim(required_strength_unit),'') is not null
    )
  ),
  drop constraint if exists rule_targets_v1_required_strength_value_check,
  add constraint rule_targets_v1_required_strength_value_check check (
    required_strength_value is null or required_strength_value > 0
  );

create or replace function drx_dose.set_rule_target_moiety_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_ids uuid[];
begin
  if new.target_kind='SUBSTANCE' then
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(array[new.substance_concept_id]);
  elsif cardinality(coalesce(new.ingredient_concept_ids,'{}'::uuid[])) >= 2 then
    v_ids := drx_dose.resolve_dose_moiety_ids_v1(new.ingredient_concept_ids);
  elsif cardinality(coalesce(new.dose_moiety_concept_ids,'{}'::uuid[])) >= 2 then
    select array_agg(x order by x::text)
      into v_ids
    from (
      select distinct unnest(new.dose_moiety_concept_ids) x
    ) q;
  else
    v_ids := '{}'::uuid[];
  end if;

  new.dose_moiety_concept_ids := coalesce(v_ids,'{}'::uuid[]);
  new.dose_moiety_key := case
    when cardinality(new.dose_moiety_concept_ids)>0
      then md5(array_to_string(new.dose_moiety_concept_ids::text[],'|'))
    else null
  end;
  return new;
end;
$$;

create or replace view drx_dose.inherited_rule_matches_v2 as
with candidates as (
  select
    p.drug_id,p.registry_number,p.trade_name,p.target_kind as product_target_kind,
    p.form_family,p.release_key,p.route_keys,p.population_key,p.strength_parse,
    p.clinical_variant_id,p.strength_hash,p.dose_moiety_key,p.dose_moiety_concept_ids,
    t.rule_target_id,t.rule_id,t.target_kind,t.strength_match_mode,
    t.required_clinical_variant_id,t.required_strength_hash,
    t.required_strength_value,t.required_strength_unit,t.presentation_policy,
    t.form_family as target_form_family,t.release_key as target_release_key,
    t.route_keys as target_route_keys,
    r.rule_key,r.patient_group,r.indication_id,r.route as rule_route,
    r.pharmaceutical_form as rule_pharmaceutical_form
  from drx_dose.product_dose_moiety_targets_v1 p
  join drx_dose.rule_targets_v1 t
    on t.binding_status='VERIFIED'
   and t.target_kind=p.target_kind
   and t.dose_moiety_key is not null
   and t.dose_moiety_key=p.dose_moiety_key
  join public.dose_rules_v3 r
    on r.rule_id=t.rule_id
   and r.editorial_status='published'
  where p.strict_autoinherit_ready
    and (cardinality(t.route_keys)=0 or t.route_keys && p.route_keys)
    and (t.form_family is null or t.form_family=p.form_family)
    and (t.release_key is null or t.release_key=p.release_key)
    and (
      (r.patient_group='adult_only' and p.population_key in ('ADULT_ONLY','ADULT_AND_PEDIATRIC'))
      or (r.patient_group in ('pediatric_only','age_band') and p.population_key in ('PEDIATRIC_ONLY','ADULT_AND_PEDIATRIC'))
      or (r.patient_group='pediatric_and_adult' and p.population_key='ADULT_AND_PEDIATRIC')
    )
),
matched as (
  select c.*,
    case
      when c.strength_match_mode='ANY_COMPATIBLE' then true
      when c.strength_match_mode='EXACT_VARIANT'
        then c.required_clinical_variant_id=c.clinical_variant_id
      when c.strength_match_mode='EXACT_STRENGTH' and nullif(btrim(c.required_strength_hash),'') is not null
        then c.required_strength_hash=c.strength_hash
      when c.strength_match_mode='EXACT_STRENGTH'
           and c.required_strength_value is not null
           and lower(c.required_strength_unit)='mg'
        then
          c.strength_parse->>'status'='PARSED_AMOUNT'
          and lower(coalesce(c.strength_parse->>'unit',''))='mg'
          and (c.strength_parse->>'value')::numeric=c.required_strength_value
      when c.strength_match_mode='EXACT_STRENGTH'
           and c.required_strength_value is not null
           and lower(c.required_strength_unit)='mg/ml'
        then
          c.strength_parse->>'status'='PARSED_CONCENTRATION'
          and lower(coalesce(c.strength_parse#>>'{numerator,unit}',''))='mg'
          and lower(coalesce(c.strength_parse#>>'{denominator,unit}',''))='ml'
          and (c.strength_parse#>>'{denominator,value}')::numeric > 0
          and (
            (c.strength_parse#>>'{numerator,value}')::numeric
            / (c.strength_parse#>>'{denominator,value}')::numeric
          )=c.required_strength_value
      else false
    end as strength_compatible
  from candidates c
)
select
  drug_id,registry_number,trade_name,product_target_kind,
  rule_target_id,rule_id,rule_key,patient_group,indication_id,
  rule_route,rule_pharmaceutical_form,strength_match_mode,
  case
    when target_kind='SUBSTANCE' then 'substance_moiety_inheritance'
    else 'ingredient_set_moiety_inheritance'
  end as match_method,
  dose_moiety_key,dose_moiety_concept_ids,
  required_strength_value,required_strength_unit,presentation_policy
from matched
where strength_compatible;

revoke all on drx_dose.inherited_rule_matches_v2 from public,anon,authenticated;
grant select on drx_dose.inherited_rule_matches_v2 to service_role;
