
-- DRx Phase 11AS: extended operational status for the fill-once dosing pipeline.

create or replace function public.drx_phase11_status_v2()
returns jsonb
language sql
security definer
set search_path=pg_catalog,public,drx_dose
as $$
select public.drx_phase11_status_v1()
||
jsonb_build_object(
  'clinicalReviewReadyRegimens',
    (select clinical_review_ready from drx_dose.source_regimen_review_dashboard_v1),
  'clinicallyApprovedRegimens',
    (select clinically_approved from drx_dose.source_regimen_review_dashboard_v1),
  'promotionGateReadyRegimens',
    (select promotion_ready from drx_dose.source_regimen_review_dashboard_v1),
  'regimensWithPresentationRequirements',
    (select with_presentation_requirements from drx_dose.source_regimen_review_dashboard_v1),
  'regimensWithAdministrationRequirements',
    (select with_administration_requirements from drx_dose.source_regimen_review_dashboard_v1),
  'regimensWithMultiIndicationLinks',
    (select with_multi_indication_links from drx_dose.source_regimen_review_dashboard_v1),
  'stepPresentationRequirementRows',
    (select count(*) from drx_dose.source_regimen_step_presentation_requirements_v1),
  'stepAdministrationRequirementRows',
    (select count(*) from drx_dose.source_regimen_step_administration_v1),
  'supportingEvidenceRows',
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1),
  'pendingSupportingEvidenceRows',
    (select count(*) from drx_dose.source_regimen_supporting_evidence_v1 where review_status='PENDING')
)
||
jsonb_build_object(
  'ruleProductCompatibilityReviewRows',
    (select count(*) from drx_dose.rule_product_compatibility_reviews_v1),
  'ruleProductCompatibilityApproved',
    (select count(*) from drx_dose.rule_product_compatibility_reviews_v1 where review_status='APPROVED'),
  'ruleProductStrictMatches',
    (select coalesce(sum(strict_matches),0) from drx_dose.rule_product_inheritance_gap_summary_v1),
  'ruleProductReviewGaps',
    (select coalesce(sum(review_gaps),0) from drx_dose.rule_product_inheritance_gap_summary_v1),
  'ruleProductIncompatibleOrUnresolved',
    (select coalesce(sum(incompatible_or_unresolved),0) from drx_dose.rule_product_inheritance_gap_summary_v1),
  'sourceAdjustmentSemanticDuplicateRows',
    (select count(*) from drx_dose.source_adjustment_semantic_duplicates_v1),
  'sourceRestrictionSemanticDuplicateRows',
    (select count(*) from drx_dose.source_restriction_semantic_duplicates_v1),
  'draftIndications',
    (select count(*) from public.dose_indication_concepts_v3 where editorial_status='draft'),
  'icdCandidateRows',
    (select count(*) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING'),
  'draftIndicationsWithIcdCandidates',
    (select count(distinct indication_id) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING'),
  'highScoreIcdCandidateRows',
    (select count(*) from drx_dose.indication_icd_candidate_reviews_v1 where review_status='PENDING' and match_score>=0.65),
  'autoClinicalApprovalAllowed',false,
  'autoIcdApplyAllowed',false,
  'autoPublishAllowedV2',false,
  'runtimeServeEnabledV2',false
);
$$;

revoke all on function public.drx_phase11_status_v2() from public,anon,authenticated;
grant execute on function public.drx_phase11_status_v2() to service_role;
