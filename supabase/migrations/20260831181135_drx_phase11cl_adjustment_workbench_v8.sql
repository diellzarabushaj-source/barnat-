-- DRx Phase 11CL: adjustment-aware workbench v8.
-- Read-only aggregation; no clinical decision or runtime state is changed.

create or replace function public.drx_phase11_review_workbench_v8()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select
  public.drx_phase11_review_workbench_v7()
  ||
  jsonb_build_object(
    'adjustmentMaterializationSummary',
      jsonb_build_object(
        'sourceCandidates',(select count(*) from drx_dose.source_adjustment_candidates_v1),
        'approvedSourceCandidates',(select count(*) from drx_dose.source_adjustment_candidates_v1 where review_status='APPROVED'),
        'previewRows',(select count(*) from drx_dose.phase11_adjustment_materialization_preview_v1),
        'readyToMaterialize',(select count(*) from drx_dose.phase11_adjustment_materialization_preview_v1 where cardinality(materialization_blockers)=0),
        'measureNormalizationReview',(select count(distinct adjustment_key) from drx_dose.phase11_adjustment_materialization_preview_v1 where materialization_blockers @> array['MEASURE_TYPE_REQUIRES_NORMALIZATION_REVIEW']::text[]),
        'sequenceScopeReview',(select count(distinct adjustment_key) from drx_dose.phase11_adjustment_materialization_preview_v1 where materialization_blockers @> array['SEQUENCE_STEP_SCOPE_REQUIRES_REVIEW']::text[]),
        'materializedEvents',(select count(*) from drx_dose.phase11_adjustment_materialization_events_v1),
        'autoMaterializeAllowed',false,
        'autoPublishAllowed',false
      ),
    'adjustmentMaterialization',coalesce((
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
      from drx_dose.phase11_adjustment_materialization_preview_v1 q
      where q.review_status='APPROVED' or q.rule_id is not null
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.drx_phase11_review_workbench_v8()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v8()
  to service_role;
