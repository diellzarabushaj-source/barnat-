
-- DRx Phase 11CJ: end-to-end review workbench v7.
-- Read-only aggregation for prepared rules, product-shell verification and
-- rule-product binding review. All decisions remain explicit human actions.

create or replace function public.drx_phase11_review_workbench_v7()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v6()
  ||
  jsonb_build_object(
    'productShellVerificationSummary',
      (select to_jsonb(x) from drx_dose.phase11_product_shell_verification_summary_v1 x),
    'productShellVerification',coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId',q.product_id,
        'drugId',q.drug_id,
        'productKey',q.product_key,
        'registryNumber',q.registry_number,
        'tradeName',q.trade_name,
        'form',q.pharmaceutical_form,
        'route',q.route,
        'patientGroup',q.patient_group,
        'editorialStatus',q.editorial_status,
        'eligibleExactSourceCount',q.eligible_exact_source_count,
        'eligibleSources',q.eligible_sources,
        'nextAction',q.next_action
      ) order by q.registry_number,q.product_key)
      from drx_dose.phase11_product_shell_verification_queue_v1 q
    ),'[]'::jsonb),
    'bindingSummary',
      (select to_jsonb(x) from drx_dose.phase11_rule_product_binding_summary_v1 x),
    'bindings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'bindingId',q.binding_id,
        'ruleId',q.rule_id,
        'ruleKey',q.rule_key,
        'regimenKey',q.regimen_key,
        'productId',q.product_id,
        'drugId',q.drug_id,
        'registryNumber',q.registry_number,
        'tradeName',q.trade_name,
        'form',q.pharmaceutical_form,
        'matchMethod',q.match_method,
        'bindingStatus',q.binding_status,
        'conversionEnabled',q.conversion_enabled,
        'canonicalMatchCurrent',q.canonical_match_current,
        'nextAction',q.next_action
      ) order by q.regimen_key,q.rule_key,q.registry_number)
      from drx_dose.phase11_rule_product_binding_queue_v1 q
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.drx_phase11_review_workbench_v7()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v7()
  to service_role;
