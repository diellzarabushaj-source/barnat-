
-- DRx Phase 11BJ: product-shell readiness queue + gated staging of candidate
-- rule/product bindings. No binding is verified automatically.

create or replace view drx_dose.product_shell_provisioning_queue_v1 as
with wanted as (
  select distinct
    p.drug_id,p.registry_number,p.trade_name,p.pharmaceutical_form,
    p.product_form_family,p.route_keys,p.population_key,p.strength_parse,
    p.variant_binding_status,p.variant_anomaly_codes
  from drx_dose.source_regimen_product_inheritance_preview_v1 p
  where p.inheritance_status='STRICT_CANDIDATE'
),
market_source as (
  select distinct on (b.drug_id)
    b.drug_id,b.snapshot_id,c.source_key,c.authorization_date,
    b.reviewed_by,b.reviewed_at
  from drx_dose.exact_market_product_source_bindings_v1 b
  join drx_dose.exact_market_product_source_captures_v1 c
    on c.discovery_id=b.discovery_id
   and c.drug_id=b.drug_id
   and c.snapshot_id=b.snapshot_id
  where b.binding_status='VERIFIED'
    and c.capture_status='CAPTURED'
  order by b.drug_id,b.reviewed_at desc nulls last,b.created_at desc
)
select
  w.*,
  dp.product_id,
  dp.product_key,
  dp.editorial_status as product_shell_status,
  ms.snapshot_id as exact_market_snapshot_id,
  ms.source_key as exact_market_source_key,
  ms.reviewed_by as exact_market_reviewed_by,
  ms.reviewed_at as exact_market_reviewed_at,
  case
    when dp.product_id is not null and dp.editorial_status='published'
      then 'SHELL_PUBLISHED'
    when dp.product_id is not null
      then 'REVIEW_EXISTING_SHELL'
    when ms.snapshot_id is not null
      then 'EXACT_MARKET_SOURCE_READY_FOR_SHELL'
    else 'VERIFY_EXACT_MARKET_PRODUCT_SOURCE'
  end as next_action,
  false::boolean as auto_publish_allowed
from wanted w
left join public.dose_products_v3 dp on dp.drug_id=w.drug_id
left join market_source ms on ms.drug_id=w.drug_id;

create table if not exists drx_dose.rule_product_binding_staging_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.dose_rules_v3(rule_id) on delete restrict,
  actor text not null check (nullif(btrim(actor),'') is not null),
  staged_binding_count integer not null check (staged_binding_count >= 0),
  binding_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create or replace function public.drx_phase11_stage_rule_product_binding_candidates_v1(
  p_rule_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
declare
  v_rule public.dose_rules_v3%rowtype;
  v_binding_ids uuid[];
  v_count integer;
begin
  if p_rule_id is null then
    raise exception 'rule_id is required';
  end if;
  if nullif(btrim(p_actor),'') is null then
    raise exception 'actor is required';
  end if;

  select * into v_rule
  from public.dose_rules_v3
  where rule_id=p_rule_id;

  if not found then
    raise exception 'Unknown rule_id: %',p_rule_id;
  end if;

  if v_rule.editorial_status <> 'published' then
    raise exception 'Rule % must be published before product-binding candidates can be staged',p_rule_id;
  end if;

  if not exists (
    select 1
    from drx_dose.rule_targets_v1 t
    where t.rule_id=p_rule_id
      and t.binding_status='VERIFIED'
  ) then
    raise exception 'Rule % has no VERIFIED canonical rule target',p_rule_id;
  end if;

  with eligible as (
    select distinct
      m.rule_id,
      dp.product_id,
      m.match_method
    from drx_dose.inherited_rule_matches_v2 m
    join public.dose_products_v3 dp
      on dp.drug_id=m.drug_id
     and dp.editorial_status='published'
    where m.rule_id=p_rule_id
  ),
  inserted as (
    insert into public.dose_rule_products_v3(
      rule_id,product_id,match_method,preferred,conversion_enabled,
      tablet_split_allowed,rounding_increment_value,rounding_increment_unit,
      binding_status,verified_by,verified_at
    )
    select
      e.rule_id,e.product_id,e.match_method,
      false,false,false,null,null,'candidate',null,null
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
    'ruleId',p_rule_id,
    'stagedCandidateBindings',v_count,
    'bindingIds',v_binding_ids,
    'bindingStatus','candidate',
    'conversionEnabled',false,
    'autoVerified',false,
    'autoPublished',false
  );
end;
$$;

alter table drx_dose.rule_product_binding_staging_events_v1 enable row level security;
revoke all on drx_dose.product_shell_provisioning_queue_v1 from public,anon,authenticated;
revoke all on drx_dose.rule_product_binding_staging_events_v1 from public,anon,authenticated;
grant select on drx_dose.product_shell_provisioning_queue_v1 to service_role;
grant select on drx_dose.rule_product_binding_staging_events_v1 to service_role;

revoke all on function public.drx_phase11_stage_rule_product_binding_candidates_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.drx_phase11_stage_rule_product_binding_candidates_v1(uuid,text)
  to service_role;
