
-- DRx Phase 11BZ: review workbench v3 with official product-source discovery state.
-- Read-only. Replaces the coarse product-shell queue payload with source-aware
-- exact/partial discovery rows.

create or replace function public.drx_phase11_review_workbench_v3()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v2()
  ||
  jsonb_build_object(
    'productSourceDiscovery',
      (select to_jsonb(x) from drx_dose.product_shell_source_discovery_summary_v1 x),
    'productShells',coalesce((
      select jsonb_agg(jsonb_build_object(
        'drugId',q.drug_id,
        'registryNumber',q.registry_number,
        'tradeName',q.trade_name,
        'form',q.pharmaceutical_form,
        'productId',q.product_id,
        'productKey',q.product_key,
        'productShellStatus',q.product_shell_status,
        'identityMatchStatus',q.identity_match_status,
        'snapshotStatus',q.snapshot_status,
        'clinicalEvidenceStatus',q.clinical_evidence_status,
        'sourceTier',q.source_tier,
        'sourceAuthority',q.source_authority,
        'sourceJurisdiction',q.source_jurisdiction,
        'externalRegistryId',q.external_registry_id,
        'sourceUrl',q.source_url,
        'nextAction',q.next_action,
        'discoveryNote',q.discovery_note
      ) order by q.registry_number)
      from drx_dose.product_shell_source_discovery_v2 q
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.drx_phase11_review_workbench_v3()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v3()
  to service_role;
