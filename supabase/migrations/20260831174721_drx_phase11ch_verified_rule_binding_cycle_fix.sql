
-- DRx Phase 11CH: break the rule-publication/product-binding deadlock safely.
-- Verified (not yet published) rules may discover compatible verified/published
-- products and stage CANDIDATE bindings. Binding verification remains explicit
-- and still passes the existing DB guard. No conversion or publication is enabled.

create or replace view drx_dose.inherited_rule_matches_v3 as
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
    r.pharmaceutical_form as rule_pharmaceutical_form,r.editorial_status as rule_status
  from drx_dose.product_dose_moiety_targets_v1 p
  join drx_dose.rule_targets_v1 t
    on t.binding_status='VERIFIED'
   and t.target_kind=p.target_kind
   and t.dose_moiety_key is not null
   and t.dose_moiety_key=p.dose_moiety_key
  join public.dose_rules_v3 r
    on r.rule_id=t.rule_id
   and r.editorial_status in ('verified','published')
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
      when c.strength_match_mode='EXACT_STRENGTH'
       and nullif(btrim(c.required_strength_hash),'') is not null
        then c.required_strength_hash=c.strength_hash
      when c.strength_match_mode='EXACT_STRENGTH'
       and c.required_strength_value is not null
       and lower(c.required_strength_unit)='mg'
        then c.strength_parse->>'status'='PARSED_AMOUNT'
         and lower(coalesce(c.strength_parse->>'unit',''))='mg'
         and (c.strength_parse->>'value')::numeric=c.required_strength_value
      when c.strength_match_mode='EXACT_STRENGTH'
       and c.required_strength_value is not null
       and lower(c.required_strength_unit)='mg/ml'
        then c.strength_parse->>'status'='PARSED_CONCENTRATION'
         and lower(coalesce(c.strength_parse#>>'{numerator,unit}',''))='mg'
         and lower(coalesce(c.strength_parse#>>'{denominator,unit}',''))='ml'
         and (c.strength_parse#>>'{denominator,value}')::numeric>0
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
  rule_target_id,rule_id,rule_key,rule_status,patient_group,indication_id,
  rule_route,rule_pharmaceutical_form,strength_match_mode,
  case when target_kind='SUBSTANCE'
    then 'substance_moiety_inheritance'
    else 'ingredient_set_moiety_inheritance'
  end as match_method,
  dose_moiety_key,dose_moiety_concept_ids,
  required_strength_value,required_strength_unit,presentation_policy
from matched
where strength_compatible;

create table if not exists drx_dose.rule_product_binding_review_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.dose_rule_products_v3(binding_id) on delete restrict,
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  product_id uuid not null references public.dose_products_v3(product_id) on delete restrict,
  decision text not null check (decision in ('verified','rejected')),
  reviewer text not null check (nullif(btrim(reviewer),'') is not null),
  review_note text not null check (nullif(btrim(review_note),'') is not null),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_stage_rule_product_binding_candidates_v2(
  p_rule_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_rule_status text;
  v_binding_ids uuid[];
  v_count integer;
begin
  if p_rule_id is null then raise exception 'rule_id is required'; end if;
  if nullif(btrim(p_actor),'') is null then raise exception 'actor is required'; end if;

  select editorial_status into v_rule_status
  from public.dose_rules_v3
  where rule_id=p_rule_id;
  if not found then raise exception 'Unknown rule_id: %',p_rule_id; end if;

  if v_rule_status not in ('verified','published') then
    raise exception 'Rule % must be VERIFIED before product-binding candidates can be staged',p_rule_id;
  end if;

  if not exists (
    select 1 from drx_dose.rule_targets_v1
    where rule_id=p_rule_id and binding_status='VERIFIED'
  ) then
    raise exception 'Rule % has no VERIFIED canonical rule target',p_rule_id;
  end if;

  with eligible as (
    select distinct m.rule_id,p.product_id,m.match_method
    from drx_dose.inherited_rule_matches_v3 m
    join public.dose_products_v3 p
      on p.drug_id=m.drug_id
     and p.editorial_status in ('verified','published')
    where m.rule_id=p_rule_id
  ),
  inserted as (
    insert into public.dose_rule_products_v3(
      rule_id,product_id,match_method,preferred,conversion_enabled,
      tablet_split_allowed,rounding_increment_value,rounding_increment_unit,
      binding_status,verified_by,verified_at
    )
    select
      e.rule_id,e.product_id,e.match_method,false,false,false,null,null,
      'candidate',null,null
    from eligible e
    on conflict (rule_id,product_id) do nothing
    returning binding_id
  )
  select
    coalesce(array_agg(binding_id order by binding_id),'{}'::uuid[]),
    count(*)::integer
  into v_binding_ids,v_count
  from inserted;

  insert into drx_dose.rule_product_binding_staging_events_v1(
    rule_id,actor,staged_binding_count,binding_ids
  ) values (
    p_rule_id,btrim(p_actor),v_count,v_binding_ids
  );

  return jsonb_build_object(
    'ok',true,'ruleId',p_rule_id,'stagedCandidateBindings',v_count,
    'bindingIds',v_binding_ids,'bindingStatus','candidate',
    'conversionEnabled',false,'autoVerified',false,'autoPublished',false
  );
end;
$$;

create or replace function public.drx_phase11_review_rule_product_binding_v1(
  p_binding_id uuid,
  p_decision text,
  p_reviewer text,
  p_attestation text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision,'')));
  v_before jsonb;
  v_after jsonb;
  v_rule_id uuid;
  v_product_id uuid;
  v_drug_id uuid;
begin
  if p_binding_id is null then raise exception 'binding_id is required'; end if;
  if v_decision not in ('verified','rejected') then
    raise exception 'Binding decision must be verified or rejected';
  end if;
  if nullif(btrim(p_reviewer),'') is null then raise exception 'reviewer is required'; end if;
  if nullif(btrim(p_review_note),'') is null then raise exception 'review_note is required'; end if;
  if p_attestation<>'RULE_PRODUCT_BINDING_REVIEW_ATTESTED' then
    raise exception 'Explicit rule-product binding attestation is required';
  end if;

  select to_jsonb(b),b.rule_id,b.product_id,p.drug_id
  into v_before,v_rule_id,v_product_id,v_drug_id
  from public.dose_rule_products_v3 b
  join public.dose_products_v3 p on p.product_id=b.product_id
  where b.binding_id=p_binding_id
  for update of b;

  if v_before is null then raise exception 'Rule-product binding not found'; end if;

  if v_decision='verified' and not exists (
    select 1
    from drx_dose.inherited_rule_matches_v3 m
    where m.rule_id=v_rule_id and m.drug_id=v_drug_id
  ) then
    raise exception 'Binding no longer matches the verified canonical inheritance target';
  end if;

  update public.dose_rule_products_v3
  set binding_status=v_decision,
      verified_by=case when v_decision='verified' then btrim(p_reviewer) else null end,
      verified_at=case when v_decision='verified' then now() else null end
  where binding_id=p_binding_id;

  select to_jsonb(b) into v_after
  from public.dose_rule_products_v3 b
  where b.binding_id=p_binding_id;

  insert into drx_dose.rule_product_binding_review_events_v1(
    binding_id,rule_id,product_id,decision,reviewer,review_note,before_state,after_state
  ) values (
    p_binding_id,v_rule_id,v_product_id,v_decision,btrim(p_reviewer),
    btrim(p_review_note),v_before,v_after
  );

  return jsonb_build_object(
    'ok',true,'bindingId',p_binding_id,'decision',v_decision,
    'conversionEnabled',false,'autoPublished',false
  );
end;
$$;

create or replace view drx_dose.phase11_rule_product_binding_queue_v1 as
select
  b.binding_id,b.rule_id,r.rule_key,r.regimen_key,
  b.product_id,p.drug_id,p.registry_number,p.trade_name,p.pharmaceutical_form,
  b.match_method,b.binding_status,b.conversion_enabled,b.verified_by,b.verified_at,
  exists (
    select 1 from drx_dose.inherited_rule_matches_v3 m
    where m.rule_id=b.rule_id and m.drug_id=p.drug_id
  ) as canonical_match_current,
  case
    when b.binding_status='candidate' then 'REVIEW_BINDING'
    when b.binding_status='verified' then 'BINDING_VERIFIED'
    when b.binding_status='rejected' then 'BINDING_REJECTED'
    else upper(b.binding_status)
  end as next_action,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from public.dose_rule_products_v3 b
join public.dose_rules_v3 r on r.rule_id=b.rule_id
join public.dose_products_v3 p on p.product_id=b.product_id
where r.regimen_key is not null;

create or replace view drx_dose.phase11_rule_product_binding_summary_v1 as
select
  count(*) as bindings,
  count(*) filter (where binding_status='candidate') as candidate_review,
  count(*) filter (where binding_status='verified') as verified,
  count(*) filter (where binding_status='rejected') as rejected,
  count(*) filter (where not canonical_match_current) as stale_or_mismatched,
  false::boolean as auto_verify_allowed,
  false::boolean as auto_publish_allowed
from drx_dose.phase11_rule_product_binding_queue_v1;

alter table drx_dose.rule_product_binding_review_events_v1 enable row level security;

revoke all on drx_dose.inherited_rule_matches_v3 from public,anon,authenticated;
revoke all on drx_dose.rule_product_binding_review_events_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_rule_product_binding_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.phase11_rule_product_binding_summary_v1 from public,anon,authenticated;
grant select on drx_dose.inherited_rule_matches_v3 to service_role;
grant select on drx_dose.rule_product_binding_review_events_v1 to service_role;
grant select on drx_dose.phase11_rule_product_binding_queue_v1 to service_role;
grant select on drx_dose.phase11_rule_product_binding_summary_v1 to service_role;

revoke all on function public.drx_phase11_stage_rule_product_binding_candidates_v2(uuid,text)
  from public,anon,authenticated;
revoke all on function public.drx_phase11_review_rule_product_binding_v1(uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_stage_rule_product_binding_candidates_v2(uuid,text)
  to service_role;
grant execute on function public.drx_phase11_review_rule_product_binding_v1(uuid,text,text,text,text)
  to service_role;
