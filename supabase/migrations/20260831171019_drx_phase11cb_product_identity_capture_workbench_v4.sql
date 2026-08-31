
-- DRx Phase 11CB: product-identity-capture aware review workbench v4.
-- Read-only. Surfaces six staged exact identity captures and the remaining
-- partial source case; no verification or publication is automatic.

create or replace function public.drx_phase11_review_workbench_v4()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v3()
  ||
  jsonb_build_object(
    'productIdentityCapture',
      (select to_jsonb(x) from drx_dose.product_shell_identity_capture_summary_v1 x),
    'productShells',coalesce((
      select jsonb_agg(jsonb_build_object(
        'drugId',q.drug_id,
        'registryNumber',q.registry_number,
        'tradeName',q.trade_name,
        'form',q.pharmaceutical_form,
        'identityMatchStatus',q.identity_match_status,
        'sourceTier',q.source_tier,
        'sourceAuthority',q.source_authority,
        'sourceJurisdiction',q.source_jurisdiction,
        'externalRegistryId',q.external_registry_id,
        'sourceUrl',q.source_url,
        'captureId',q.capture_id,
        'captureStatus',q.capture_status,
        'normalizedRecordSha256',q.normalized_record_sha256,
        'reviewedBy',q.reviewed_by,
        'reviewedAt',q.reviewed_at,
        'reviewNote',q.review_note,
        'nextAction',q.next_action
      ) order by q.registry_number)
      from drx_dose.product_shell_identity_capture_queue_v1 q
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.drx_phase11_review_workbench_v4()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v4()
  to service_role;
