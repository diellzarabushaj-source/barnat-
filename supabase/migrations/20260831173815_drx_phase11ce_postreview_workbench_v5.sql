
-- DRx Phase 11CE: post-review-aware admin workbench v5.
-- Read-only orchestration state; no clinical or publication state is mutated.

create or replace view drx_dose.product_shell_draft_summary_v1 as
select
  count(*) as product_shell_candidates,
  count(*) filter (where capture_status='STAGED') as identity_capture_review,
  count(*) filter (where capture_status='VERIFIED' and product_id is null) as verified_identity_to_materialize,
  count(*) filter (where product_id is not null and editorial_status='draft') as draft_shells_to_review,
  count(*) filter (where product_id is not null and editorial_status='verified') as verified_shells,
  count(*) filter (where product_id is not null and editorial_status='published') as published_shells,
  count(*) filter (where shell_next_action='RESOLVE_SOURCE_IDENTITY') as partial_source_identity,
  false::boolean as auto_publish_allowed
from drx_dose.product_shell_draft_readiness_v1;

create or replace function public.drx_phase11_review_workbench_v5()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v4()
  ||
  jsonb_build_object(
    'postReviewPreparation',
      (select to_jsonb(x) from drx_dose.phase11_postreview_preparation_summary_v1 x),
    'productShellDraft',
      (select to_jsonb(x) from drx_dose.product_shell_draft_summary_v1 x),
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
        'productId',q.product_id,
        'productKey',q.product_key,
        'editorialStatus',q.editorial_status,
        'nextAction',q.shell_next_action
      ) order by q.registry_number)
      from drx_dose.product_shell_draft_readiness_v1 q
    ),'[]'::jsonb)
  );
$$;

revoke all on drx_dose.product_shell_draft_summary_v1 from public,anon,authenticated;
grant select on drx_dose.product_shell_draft_summary_v1 to service_role;
revoke all on function public.drx_phase11_review_workbench_v5() from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v5() to service_role;
