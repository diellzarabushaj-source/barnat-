-- DRx Phase 11CM: fast/lazy adjustment workbench.
-- This endpoint is intentionally separate from the already-heavy main Phase 11 workbench.

create or replace function public.drx_phase11_adjustment_workbench_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with rows as materialized (
  select *
  from drx_dose.phase11_adjustment_materialization_preview_v1
),
summary as (
  select
    (select count(*) from drx_dose.source_adjustment_candidates_v1) as source_candidates,
    (select count(*) from drx_dose.source_adjustment_candidates_v1 where review_status='APPROVED') as approved_source_candidates,
    count(*) as preview_rows,
    count(*) filter (where cardinality(materialization_blockers)=0) as ready_to_materialize,
    count(distinct adjustment_key) filter (
      where materialization_blockers @> array['MEASURE_TYPE_REQUIRES_NORMALIZATION_REVIEW']::text[]
    ) as measure_normalization_review,
    count(distinct adjustment_key) filter (
      where materialization_blockers @> array['SEQUENCE_STEP_SCOPE_REQUIRES_REVIEW']::text[]
    ) as sequence_scope_review
  from rows
)
select jsonb_build_object(
  'summary',jsonb_build_object(
    'sourceCandidates',s.source_candidates,
    'approvedSourceCandidates',s.approved_source_candidates,
    'previewRows',s.preview_rows,
    'readyToMaterialize',s.ready_to_materialize,
    'measureNormalizationReview',s.measure_normalization_review,
    'sequenceScopeReview',s.sequence_scope_review,
    'materializedEvents',(select count(*) from drx_dose.phase11_adjustment_materialization_events_v1),
    'autoMaterializeAllowed',false,
    'autoApplyAllowed',false,
    'autoPublishAllowed',false
  ),
  'rows',coalesce((
    select jsonb_agg(jsonb_build_object(
      'ruleId',q.rule_id,
      'ruleKey',q.rule_key,
      'regimenKey',q.regimen_key,
      'regimenKind',q.regimen_kind,
      'branchNo',q.branch_no,
      'stepNo',q.step_no,
      'adjustmentKey',q.adjustment_key,
      'domain',q.adjustment_domain,
      'sourceMeasureType',q.source_measure_type,
      'mappedMeasureType',q.mapped_measure_type,
      'sourceActionType',q.source_action_type,
      'mappedDoseAction',q.mapped_dose_action,
      'conditionText',q.condition_text,
      'reviewStatus',q.review_status,
      'reviewedBy',q.reviewed_by,
      'reviewedAt',q.reviewed_at,
      'blockers',q.materialization_blockers,
      'readyToMaterialize',cardinality(q.materialization_blockers)=0
    ) order by q.regimen_key,q.branch_no,q.step_no,q.adjustment_key)
    from rows q
    where q.review_status='APPROVED' or q.rule_id is not null
  ),'[]'::jsonb)
)
from summary s;
$$;

revoke all on function public.drx_phase11_adjustment_workbench_v1()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_adjustment_workbench_v1()
  to service_role;
