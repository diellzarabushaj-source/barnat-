create or replace function public.drx_phase10_legacy_retirement_preflight_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, drx_runtime
as $$
declare
  v_status jsonb;
  v_v2_bound jsonb := '[]'::jsonb;
  v_v3_bound jsonb := '[]'::jsonb;
  v_v2_product_shells integer := 0;
  v_v2_rules integer := 0;
  v_v2_bindings integer := 0;
  v_v2_safety integer := 0;
  v_v3_products integer := 0;
  v_v3_rules integer := 0;
  v_v3_bindings integer := 0;
begin
  v_status := public.drx_phase10_status_v1();

  select count(*)::integer into v_v2_product_shells
  from public.dose_products_v2
  where active is true and editorial_status='published';

  select count(*)::integer into v_v2_rules
  from public.dose_rules_v2
  where active is true and editorial_status='published';

  select count(*)::integer into v_v2_safety
  from public.dose_safety_v2
  where active is true and editorial_status='published';

  with bound as (
    select distinct p.product_key::text as product_key, p.drug_id::text as drug_id
    from public.dose_products_v2 p
    join public.dose_rule_products_v2 b
      on b.product_key=p.product_key
     and b.active is true
     and b.editorial_status='published'
    join public.dose_rules_v2 r
      on r.rule_key=b.rule_key
     and r.active is true
     and r.editorial_status='published'
    where p.active is true
      and p.editorial_status='published'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('productKey',product_key,'drugId',drug_id)
      order by product_key,drug_id
    ),
    '[]'::jsonb
  )
  into v_v2_bound
  from bound;

  select count(*)::integer into v_v2_bindings
  from public.dose_rule_products_v2 b
  join public.dose_products_v2 p
    on p.product_key=b.product_key
   and p.active is true
   and p.editorial_status='published'
  join public.dose_rules_v2 r
    on r.rule_key=b.rule_key
   and r.active is true
   and r.editorial_status='published'
  where b.active is true
    and b.editorial_status='published';

  select count(*)::integer into v_v3_products
  from public.dose_products_v3
  where editorial_status='published';

  select count(*)::integer into v_v3_rules
  from public.dose_rules_v3
  where editorial_status='published';

  with bound as (
    select distinct p.product_key::text as product_key, p.drug_id::text as drug_id
    from public.dose_products_v3 p
    join public.dose_rule_products_v3 b
      on b.product_id=p.product_id
     and b.binding_status='verified'
    join public.dose_rules_v3 r
      on r.rule_id=b.rule_id
     and r.editorial_status='published'
    where p.editorial_status='published'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('productKey',product_key,'drugId',drug_id)
      order by product_key,drug_id
    ),
    '[]'::jsonb
  )
  into v_v3_bound
  from bound;

  select count(*)::integer into v_v3_bindings
  from public.dose_rule_products_v3 b
  join public.dose_products_v3 p
    on p.product_id=b.product_id
   and p.editorial_status='published'
  join public.dose_rules_v3 r
    on r.rule_id=b.rule_id
   and r.editorial_status='published'
  where b.binding_status='verified';

  return jsonb_build_object(
    'schemaVersion','drx-phase10-legacy-retirement-preflight-db-v1',
    'phase10',jsonb_build_object(
      'mode',v_status->'mode',
      'controlledTrafficPercent',v_status->'controlledTrafficPercent',
      'soak14DaysPass',v_status->'soak14DaysPass',
      'finalGatePass',v_status->'finalGatePass',
      'strictArmed',v_status->'strictArmed',
      'restoreTestEvidencePass',v_status->'restoreTestEvidencePass',
      'effectiveParityCurrent',v_status->'effectiveParityCurrent',
      'legacyWritesZeroEvidencePass',v_status->'legacyWritesZeroEvidencePass',
      'legacyConsumersZeroEvidencePass',v_status->'legacyConsumersZeroEvidencePass'
    ),
    'coverage',jsonb_build_object(
      'v2PublishedProductShells',v_v2_product_shells,
      'v2PublishedRules',v_v2_rules,
      'v2EffectiveBindings',v_v2_bindings,
      'v2PublishedSafetyRows',v_v2_safety,
      'v3PublishedProducts',v_v3_products,
      'v3PublishedRules',v_v3_rules,
      'v3VerifiedEffectiveBindings',v_v3_bindings,
      'v2BoundProducts',v_v2_bound,
      'v3BoundProducts',v_v3_bound,
      'exactBoundProductParity',v_v2_bound=v_v3_bound,
      'ruleCountParity',v_v2_rules=v_v3_rules,
      'bindingCountParity',v_v2_bindings=v_v3_bindings,
      'safetyContentLossRisk',v_v2_safety>0
    )
  );
end;
$$;

revoke all on function public.drx_phase10_legacy_retirement_preflight_v1()
  from public, anon, authenticated;
grant execute on function public.drx_phase10_legacy_retirement_preflight_v1()
  to service_role;
