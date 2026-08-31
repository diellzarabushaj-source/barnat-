
-- DRx Phase 11BS: quality-gate ICD suggestions and expose identity suggestion coverage.
-- Low-similarity ICD suggestions remain visible for context but are never treated as
-- recommendation-quality matches and never auto-apply.

create or replace view drx_dose.indication_icd_review_queue_v2 as
select
  q.*,
  case
    when q.best_match_score is null then 'NO_CANDIDATE'
    when q.best_match_score >= 0.65 then 'HIGH'
    when q.best_match_score >= 0.45 then 'MEDIUM'
    else 'LOW'
  end as suggestion_quality,
  (
    q.best_match_score is null
    or q.best_match_score < 0.45
  ) as manual_search_required,
  false::boolean as auto_apply_allowed_v2
from drx_dose.indication_icd_review_queue_v1 q;

create or replace view drx_dose.indication_icd_review_quality_summary_v1 as
select
  count(*) as draft_indications,
  count(*) filter (where suggestion_quality='HIGH') as high_quality,
  count(*) filter (where suggestion_quality='MEDIUM') as medium_quality,
  count(*) filter (where suggestion_quality='LOW') as low_quality,
  count(*) filter (where suggestion_quality='NO_CANDIDATE') as no_candidate,
  count(*) filter (where manual_search_required) as manual_search_required,
  false::boolean as auto_apply_allowed
from drx_dose.indication_icd_review_queue_v2;

create or replace function public.drx_phase11_indication_review_packet_v2()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select jsonb_build_object(
  'summary',jsonb_build_object(
    'total',(select count(*) from public.dose_indication_concepts_v3),
    'published',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='published'),
    'draft',(select count(*) from public.dose_indication_concepts_v3 where editorial_status='draft'),
    'icdVerified',(select count(*) from public.dose_indication_concepts_v3 where icd_verification_status='verified')
  ),
  'quality',(select to_jsonb(x) from drx_dose.indication_icd_review_quality_summary_v1 x),
  'items',coalesce((
    select jsonb_agg(jsonb_build_object(
      'indicationId',q.indication_id,
      'indicationKey',q.indication_key,
      'canonicalName',q.canonical_name,
      'editorialStatus',q.editorial_status,
      'icdVerificationStatus',q.icd_verification_status,
      'candidateCount',q.candidate_count,
      'bestMatchScore',q.best_match_score,
      'suggestionQuality',q.suggestion_quality,
      'manualSearchRequired',q.manual_search_required,
      'candidates',q.candidates
    ) order by
      case q.suggestion_quality when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end,
      q.best_match_score desc nulls last,
      q.canonical_name
    )
    from drx_dose.indication_icd_review_queue_v2 q
  ),'[]'::jsonb)
);
$$;

create or replace function public.drx_phase11_review_workbench_v2()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v1()
  ||
  jsonb_build_object(
    'identitySuggestionCoverage',
      (select to_jsonb(x) from drx_dose.ingredient_identity_candidate_summary_v1 x),
    'icdSuggestionQuality',
      (select to_jsonb(x) from drx_dose.indication_icd_review_quality_summary_v1 x)
  );
$$;

revoke all on drx_dose.indication_icd_review_queue_v2 from public,anon,authenticated;
revoke all on drx_dose.indication_icd_review_quality_summary_v1 from public,anon,authenticated;
grant select on drx_dose.indication_icd_review_queue_v2 to service_role;
grant select on drx_dose.indication_icd_review_quality_summary_v1 to service_role;

revoke all on function public.drx_phase11_indication_review_packet_v2() from public,anon,authenticated;
revoke all on function public.drx_phase11_review_workbench_v2() from public,anon,authenticated;
grant execute on function public.drx_phase11_indication_review_packet_v2() to service_role;
grant execute on function public.drx_phase11_review_workbench_v2() to service_role;
