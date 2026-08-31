-- DRx Phase 11CV: lazy clinical preflight workbench packet.
-- Read-only administrative packet. No review status is changed and
-- auto-approval remains disabled.

create or replace function public.drx_phase11_clinical_preflight_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'summary',coalesce((
    select to_jsonb(s)
    from drx_dose.phase11_clinical_review_preflight_summary_v1 s
  ),'{}'::jsonb),
  'technicalBlocked',coalesce((
    select jsonb_agg(jsonb_build_object(
      'regimenKey',q.regimen_key,
      'indicationId',q.indication_id,
      'blockers',q.technical_integrity_blockers
    ) order by q.regimen_key)
    from drx_dose.phase11_clinical_review_preflight_v1 q
    where not q.technical_integrity_ready
  ),'[]'::jsonb),
  'humanBlockerCounts',coalesce((
    select jsonb_agg(jsonb_build_object(
      'blocker',x.blocker,
      'regimenCount',x.regimen_count
    ) order by x.regimen_count desc,x.blocker)
    from (
      select b.blocker,count(distinct q.regimen_key) as regimen_count
      from drx_dose.phase11_clinical_review_preflight_v1 q
      cross join lateral unnest(q.upstream_human_review_blockers) b(blocker)
      group by b.blocker
    ) x
  ),'[]'::jsonb),
  'readyForAttestation',coalesce((
    select jsonb_agg(jsonb_build_object(
      'regimenKey',q.regimen_key,
      'reviewStatus',q.review_status
    ) order by q.regimen_key)
    from drx_dose.phase11_clinical_review_preflight_v1 q
    where q.technical_integrity_ready
      and q.upstream_human_review_complete
      and q.review_status='PENDING'
  ),'[]'::jsonb),
  'autoApproveAllowed',false
);
$$;

revoke all on function public.drx_phase11_clinical_preflight_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_clinical_preflight_workbench_v1()
  to service_role;
