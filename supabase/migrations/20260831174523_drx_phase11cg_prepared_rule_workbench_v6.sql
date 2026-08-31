
-- DRx Phase 11CG: prepared-rule aware review workbench v6.
-- Read-only orchestration. Surfaces structural validation and target/rule review
-- state without changing any clinical or publication status.

create or replace function public.drx_phase11_review_workbench_v6()
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,drx_dose,drx_runtime
as $$
select
  public.drx_phase11_review_workbench_v5()
  ||
  jsonb_build_object(
    'preparedRuleSummary',
      (select to_jsonb(x) from drx_dose.phase11_prepared_rule_summary_v1 x),
    'preparedRules',coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruleId',q.rule_id,
        'ruleKey',q.rule_key,
        'regimenKey',q.regimen_key,
        'branchNo',q.branch_no,
        'stepNo',q.step_no,
        'editorialStatus',q.editorial_status,
        'safetyValidationStatus',q.safety_validation_status,
        'verifiedBy',q.verified_by,
        'verifiedAt',q.verified_at,
        'structureMatchesPreview',q.structure_matches_preview,
        'exactEvidenceVerified',q.exact_evidence_verified,
        'safetyReviewComplete',q.safety_review_complete,
        'renalFlagMatches',q.renal_flag_matches,
        'hepaticFlagMatches',q.hepatic_flag_matches,
        'indicationVerified',q.indication_verified,
        'validationBlockers',q.validation_blockers,
        'readyForStructuralValidation',q.ready_for_structural_validation,
        'readyForRuleReview',q.ready_for_rule_review,
        'targets',coalesce((
          select jsonb_agg(jsonb_build_object(
            'ruleTargetId',t.rule_target_id,
            'targetKind',t.target_kind,
            'doseMoietyKey',t.dose_moiety_key,
            'formFamily',t.form_family,
            'releaseKey',t.release_key,
            'routeKeys',t.route_keys,
            'strengthMatchMode',t.strength_match_mode,
            'requiredStrengthValue',t.required_strength_value,
            'requiredStrengthUnit',t.required_strength_unit,
            'presentationPolicy',t.presentation_policy,
            'bindingStatus',t.binding_status,
            'verifiedBy',t.verified_by,
            'verifiedAt',t.verified_at
          ) order by t.created_at,t.rule_target_id)
          from drx_dose.rule_targets_v1 t
          where t.rule_id=q.rule_id
            and t.binding_status<>'RETIRED'
        ),'[]'::jsonb)
      ) order by q.regimen_key,q.branch_no,q.step_no,q.rule_key)
      from drx_dose.phase11_prepared_rule_review_queue_v1 q
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.drx_phase11_review_workbench_v6()
  from public,anon,authenticated;
grant execute on function public.drx_phase11_review_workbench_v6()
  to service_role;
